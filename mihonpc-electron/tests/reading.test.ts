import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { AppDatabase } from '../src/main/db'
import { LibraryRepository } from '../src/main/library'
import { ImageCache } from '../src/main/images'
import { ReadingServices } from '../src/main/services'
import type { ExtensionManager } from '../src/main/extensions/manager'
import { HttpBroker, isPrivateAddress } from '../src/main/extensions/network'
import { manga, filters, integer, relativeUrl, headers } from '../src/shared/source'
import { validateArgs } from '../src/shared/ipc'
const migrations = resolve('migrations')
const sample = { url: '/manga/paper', title: 'Paper Satellites', status: 1, initialized: true }
const chapters = [{ url: '/chapter/1', name: 'Chapter 1', dateUpload: 100, chapterNumber: 1 }]
const pages = [0, 1, 2].map((index) => ({
  index,
  url: 'https://source.invalid/' + index + '.png',
  imageUrl: 'https://source.invalid/' + index + '.png'
}))
function database(): { db: AppDatabase; library: LibraryRepository } {
  const db = new AppDatabase(':memory:', migrations)
  return { db, library: new LibraryRepository(db) }
}
test('upgrade schema 1 to 4 preserves existing favorites, read flags and history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mihon-upgrade-')),
    oldMigrations = join(directory, 'old')
  mkdirSync(oldMigrations)
  copyFileSync(join(migrations, '001_init.sql'), join(oldMigrations, '001_init.sql'))
  const file = join(directory, 'data.db'),
    old = new AppDatabase(file, oldMigrations)
  old.connection.exec(
    "INSERT INTO mangas(id,source_id,url,title,favorite) VALUES(1,7,'/m','Kept',1); INSERT INTO chapters(id,manga_id,url,name,read,last_page_read) VALUES(1,1,'/c','Chapter',1,4); INSERT INTO history(chapter_id,last_read,time_read) VALUES(1,100,500);"
  )
  old.close()
  const next = new AppDatabase(file, migrations)
  try {
    assert.equal(next.status('test').schemaVersion, 4)
    assert.equal(next.getFavorites()[0].title, 'Kept')
    assert.equal(next.getHistory(10, 0)[0].last_page_read, 4)
    assert.equal(
      (next.connection.prepare('SELECT time_read FROM history').get() as { time_read: number })
        .time_read,
      500
    )
  } finally {
    next.close()
  }
})
test('refresh and favorite upserts preserve chapter IDs, read progress and bindings', () => {
  const { db, library } = database()
  try {
    const id = library.save(7, sample, chapters),
      chapter = library.chapters(id)[0]
    library.upsert(7, sample, true)
    library.savePages(chapter.id, pages)
    library.progress(chapter.id, 1, 100)
    db.connection.prepare('UPDATE chapters SET bookmark=1 WHERE id=?').run(chapter.id)
    const again = library.save(7, { ...sample, title: 'Updated' }, [
      { ...chapters[0], name: 'Updated chapter' }
    ])
    assert.equal(again, id)
    assert.equal(library.manga(id).favorite, 1)
    assert.equal(library.chapters(id)[0].id, chapter.id)
    assert.equal(library.chapters(id)[0].last_page_read, 1)
    assert.equal(library.chapters(id)[0].bookmark, 1)
    library.removeFavorite(id)
    assert.equal(library.manga(id).favorite, 0)
    assert.equal(library.pages(chapter.id).length, 3)
  } finally {
    db.close()
  }
})
test('page progress is bounded, accumulates time and marks completed only on the last page', () => {
  const { db, library } = database()
  try {
    const id = library.save(7, sample, chapters),
      chapter = library.chapters(id)[0]
    assert.throws(() => library.progress(chapter.id, 0, 0), /outside/)
    library.savePages(chapter.id, pages)
    library.progress(chapter.id, 1, 123)
    assert.equal(library.chapter(chapter.id).read, 0)
    assert.throws(() => library.progress(chapter.id, 3, 0), /outside/)
    library.progress(chapter.id, 2, 456)
    assert.equal(library.chapter(chapter.id).read, 1)
    assert.equal(
      (db.connection.prepare('SELECT time_read FROM history').get() as { time_read: number })
        .time_read,
      579
    )
    library.progress(chapter.id, 0, 0)
    assert.equal(library.chapter(chapter.id).read, 1)
    assert.equal(db.getHistory(10, 0)[0].manga_id, id)
  } finally {
    db.close()
  }
})
test('reader preferences persist per manga and global defaults apply to new manga', () => {
  const { db, library } = database()
  try {
    const id = library.upsert(7, sample)
    assert.deepEqual(library.preferences(id), {
      mode: 'pager',
      direction: 'ltr',
      preload: 3,
      zoom: 1
    })
    const prefs = { mode: 'webtoon', direction: 'rtl', preload: 5, zoom: 1.5 } as const
    library.setPreferences(id, prefs, true)
    assert.deepEqual(library.preferences(id), prefs)
    const second = library.upsert(7, { ...sample, url: '/other' })
    assert.deepEqual(library.preferences(second), prefs)
    db.connection.prepare('DELETE FROM mangas WHERE id=?').run(id)
    assert.equal(
      db.connection.prepare('SELECT * FROM reader_preferences WHERE manga_id=?').get(id),
      undefined
    )
  } finally {
    db.close()
  }
})
test('chapter page cache and preferences cascade with manga deletion', () => {
  const { db, library } = database()
  try {
    const id = library.save(7, sample, chapters),
      chapter = library.chapters(id)[0]
    library.savePages(chapter.id, pages)
    db.connection.prepare('DELETE FROM mangas WHERE id=?').run(id)
    assert.deepEqual(library.pages(chapter.id), [])
  } finally {
    db.close()
  }
})
test('source and IPC validators reject unsafe identifiers, URLs, headers and reader settings', () => {
  for (const value of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => integer(value, 1))
  for (const value of ['https://example.com/m', '//example.com', '/bad\\path', 'x'])
    assert.throws(() => relativeUrl(value))
  assert.throws(() => manga({ ...sample, status: 99 }))
  assert.throws(() => filters([{ type: 'select', name: 'Sort', values: ['one'], state: 5 }]))
  assert.throws(() => headers({ Host: 'localhost' }))
  assert.throws(() => headers({ 'X-Test': 'one\r\ntwo' }))
  for (const args of [
    [1, -1],
    [1, 2000],
    [1, NaN]
  ])
    assert.throws(() => validateArgs('reader:image', args))
  assert.throws(() => validateArgs('reader:progress', [1, 1, 60001]))
  assert.throws(() =>
    validateArgs('reader:setPreferences', [
      1,
      { mode: 'invalid', direction: 'ltr', preload: 3, zoom: 1 },
      false
    ])
  )
  assert.throws(() =>
    validateArgs('reader:setPreferences', [
      1,
      { mode: 'pager', direction: 'ltr', preload: 99, zoom: 1 },
      false
    ])
  )
})
test('HTTP broker rejects local and undeclared hosts before issuing requests', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:127.0.0.1'
  ])
    assert.equal(isPrivateAddress(ip), true)
  assert.equal(isPrivateAddress('93.184.216.34'), false)
  await assert.rejects(() => new HttpBroker().request('http://127.0.0.1/'), /Private/)
  await assert.rejects(
    () => new HttpBroker(true).request('http://127.0.0.1/', {}, ['example.com']),
    /not declared/
  )
})
test('image cache deduplicates concurrent fetches and serves disk bytes without a source', async () => {
  const bytes = readFileSync('tests/fixtures/images/page-1.png')
  let calls = 0,
    offline = false
  const extensions = {
    request: async () => {
      calls++
      if (offline) throw new Error('offline')
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { status: 200, bytes }
    }
  } as unknown as ExtensionManager
  const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'mihon-images-')), extensions)
  const first = await Promise.all([
    cache.dataUrl(7, 'https://source.invalid/1'),
    cache.dataUrl(7, 'https://source.invalid/1')
  ])
  assert.equal(first[0], first[1])
  assert.equal(calls, 1)
  offline = true
  assert.equal(await cache.dataUrl(7, 'https://source.invalid/1'), first[0])
  assert.equal(calls, 1)
})
test('failed image requests are not cached and retry can recover', async () => {
  let calls = 0
  const extensions = {
    request: async () => {
      calls++
      return calls === 1
        ? { status: 503, bytes: Buffer.alloc(0) }
        : { status: 200, bytes: readFileSync('tests/fixtures/images/page-1.png') }
    }
  } as unknown as ExtensionManager
  const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'mihon-retry-')), extensions)
  await assert.rejects(() => cache.dataUrl(7, 'https://source.invalid/1'), /503/)
  assert.match(await cache.dataUrl(7, 'https://source.invalid/1'), /^data:image\/png;base64,/)
  assert.equal(calls, 2)
})
test('reader reopens persisted page lists when the extension is offline', async () => {
  const { db, library } = database()
  let calls = 0
  const extensions = {
    pages: async () => {
      calls++
      throw new Error('offline')
    }
  } as unknown as ExtensionManager
  const cache = new ImageCache(mkdtempSync(join(tmpdir(), 'mihon-offline-')), extensions)
  const services = new ReadingServices(library, extensions, cache)
  try {
    const id = library.save(7, sample, chapters),
      chapter = library.chapters(id)[0]
    library.savePages(chapter.id, pages)
    library.progress(chapter.id, 1, 0)
    const session = await services.reader(chapter.id, false)
    assert.equal(session.cached, true)
    assert.equal(session.chapter.last_page_read, 1)
    assert.equal(calls, 0)
    await assert.rejects(() => services.reader(chapter.id, true), /offline/)
    assert.equal(calls, 1)
  } finally {
    db.close()
  }
})

test('HTTP broker bounds redirects, transfer size and decompressed responses', async () => {
  const payload = JSON.stringify({ message: 'bounded data '.repeat(100) })
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/redirect' })
      res.end()
      return
    }
    if (req.url === '/large') {
      res.end(Buffer.alloc(4096))
      return
    }
    res.setHeader('Content-Encoding', 'gzip')
    res.end(gzipSync(payload))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test address')
  const base = 'http://127.0.0.1:' + address.port,
    broker = new HttpBroker(true)
  try {
    assert.equal(
      (await broker.request(base + '/gzip', {}, undefined, 4096)).bytes.toString(),
      payload
    )
    await assert.rejects(() => broker.request(base + '/gzip', {}, undefined, 256))
    await assert.rejects(() => broker.request(base + '/large', {}, undefined, 128), /limit/)
    await assert.rejects(() => broker.request(base + '/redirect'), /redirects/)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
