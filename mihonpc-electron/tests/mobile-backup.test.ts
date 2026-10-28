import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decodeMobileBackup } from '../src/main/mobile-backup'
import { AppDatabase } from '../src/main/db'
import { SettingsStore } from '../src/main/settings'
import { BackupService } from '../src/main/backups'
function vint(n: bigint | number): Buffer {
  let v = BigInt.asUintN(64, BigInt(n))
  const out: number[] = []
  while (v > 127n) {
    out.push(Number(v & 127n) | 128)
    v >>= 7n
  }
  out.push(Number(v))
  return Buffer.from(out)
}
function number(tag: number, n: bigint | number): Buffer {
  return Buffer.concat([vint(tag * 8), vint(n)])
}
function bytes(tag: number, b: Buffer | string): Buffer {
  const data = typeof b === 'string' ? Buffer.from(b) : b
  return Buffer.concat([vint(tag * 8 + 2), vint(data.length), data])
}
function sample(): Buffer {
  const f = Buffer.alloc(4)
  f.writeFloatLE(1.5)
  const c = Buffer.concat([
    bytes(1, '/chapter/a'),
    bytes(2, 'Chapter 1.5'),
    number(4, 1),
    number(6, 99999),
    vint(9 * 8 + 5),
    f
  ])
  const m = Buffer.concat([
    number(1, 6247824327199706550n),
    bytes(2, '/series/a'),
    bytes(3, 'Example'),
    bytes(16, c),
    bytes(17, vint(0)),
    bytes(104, Buffer.concat([bytes(1, '/chapter/a'), number(2, 1234), number(3, 12)]))
  ])
  return gzipSync(
    Buffer.concat([
      bytes(1, m),
      bytes(2, Buffer.concat([bytes(1, 'Fantasy'), number(2, 0), number(3, 77)])),
      bytes(101, Buffer.concat([bytes(1, 'Asura Scans'), number(2, 6247824327199706550n)])),
      number(500, 2)
    ])
  )
}
test('mobile schema preserves exact Long IDs, default favorites, category order, float and history', () => {
  const d = decodeMobileBackup(sample())
  const m = (
    d.manga as {
      remoteSourceId: string
      favorite: number
      categories: string[]
      chapters: { chapter: { chapterNumber: number }; page: number; history: unknown }[]
    }[]
  )[0]
  assert.equal(m.remoteSourceId, '6247824327199706550')
  assert.equal(m.favorite, 1)
  assert.deepEqual(m.categories, ['Fantasy'])
  assert.equal(m.chapters[0].chapter.chapterNumber, 1.5)
  assert.equal(m.chapters[0].page, 99999)
  assert.deepEqual(m.chapters[0].history, { last_read: 1234, time_read: 12 })
})
test('mobile decoder rejects truncated and unsupported wire payloads', () => {
  assert.throws(() => decodeMobileBackup(sample().subarray(0, 20)))
  assert.throws(() => decodeMobileBackup(Buffer.from([10, 127, 1])))
  assert.throws(() => decodeMobileBackup(Buffer.from([11])))
  assert.throws(() => decodeMobileBackup(Buffer.from([0])))
})
test('mobile restore merges idempotently, retains higher progress and roundtrips native backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mihon-mobile-')),
    db = new AppDatabase(':memory:', resolve('migrations'))
  const settings = new SettingsStore(join(dir, 'settings.json'), db),
    service = new BackupService(db, settings, dir)
  const path = join(dir, 'mobile.tachibk')
  writeFileSync(path, sample())
  try {
    const before = settings.get()
    const first = await service.import(path, true)
    assert.equal(first.restored, 1)
    assert.deepEqual(first.errors, [])
    assert.deepEqual(settings.get(), before)
    db.connection.exec('UPDATE chapters SET last_page_read=100000,bookmark=1')
    assert.equal((await service.import(path, false)).restored, 1)
    assert.equal(
      (db.connection.prepare('SELECT count(*) n FROM mangas').get() as { n: number }).n,
      1
    )
    assert.equal(
      (db.connection.prepare('SELECT last_page_read p FROM chapters').get() as { p: number }).p,
      100000
    )
    const native = service.export(join(dir, 'native.mihonbk')),
      other = new AppDatabase(':memory:', resolve('migrations'))
    try {
      const copy = new BackupService(other, new SettingsStore(join(dir, 'other.json'), other), dir)
      assert.deepEqual((await copy.import(native, false)).errors, [])
      assert.equal(other.getFavorites().length, 1)
      assert.equal(
        (other.connection.prepare('SELECT bookmark FROM chapters').get() as { bookmark: number })
          .bookmark,
        1
      )
    } finally {
      other.close()
    }
  } finally {
    db.close()
  }
})
