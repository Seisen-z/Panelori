import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  symlinkSync,
  mkdirSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { AppDatabase } from '../src/main/db'
import { LibraryRepository } from '../src/main/library'
import { SettingsStore } from '../src/main/settings'
import { BackupService } from '../src/main/backups'
import { DownloadQueue } from '../src/main/downloads'
import { ReleaseServices } from '../src/main/release'
import { settingsPatch } from '../src/shared/settings'
import { validateArgs } from '../src/shared/ipc'
import { createHandlers, dispatch } from '../src/main/handlers'
import type { ReadingServices } from '../src/main/services'
const png = readFileSync('tests/fixtures/images/page-1.png')
const manga = { url: '/m', title: 'Kept book', status: 1 }
const chapters = [1, 2, 3].map((n) => ({
  url: '/c' + n,
  name: 'Chapter ' + n,
  chapterNumber: n,
  dateUpload: 100
}))
function setup(): {
  db: AppDatabase
  dir: string
  library: LibraryRepository
  settings: SettingsStore
  backup: BackupService
  id: number
} {
  const dir = mkdtempSync(join(tmpdir(), 'mihon-release-')),
    db = new AppDatabase(join(dir, 'test.db'), resolve('migrations')),
    library = new LibraryRepository(db),
    settings = new SettingsStore(join(dir, 'settings.json'), db)
  const id = library.save(7, manga, chapters)
  library.upsert(7, manga, true)
  return { dir, db, library, settings, backup: new BackupService(db, settings, dir), id }
}
async function until(test: () => boolean): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (test()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('Timed out')
}
function fake(
  library: LibraryRepository,
  id: number,
  bytes: () => Promise<Buffer> = async () => png
): ReadingServices {
  return {
    library,
    reader: async (chapterId: number) => ({
      chapter: library.chapter(chapterId),
      manga: library.manga(id),
      pages: [0, 1, 2].map((index) => ({
        index,
        url: 'https://source.invalid/' + index,
        imageUrl: 'https://source.invalid/' + index
      }))
    }),
    images: { bytes }
  } as unknown as ReadingServices
}
test('backup export/import roundtrip preserves stable identities, read/bookmark/history and multi-category membership', async () => {
  const { db, dir, library, backup, id } = setup()
  try {
    const c = library.chapters(id)[0]
    library.savePages(c.id, [
      { index: 0, url: 'https://source.invalid/0' },
      { index: 1, url: 'https://source.invalid/1' }
    ])
    library.progress(c.id, 1, 1000)
    db.connection.prepare('UPDATE chapters SET bookmark=1 WHERE id=?').run(c.id)
    db.connection.exec("INSERT INTO categories(id,name) VALUES(1,'A'),(2,'B');")
    db.connection.prepare('INSERT INTO manga_categories VALUES(?,1),(?,2)').run(id, id)
    const file = backup.export(join(dir, 'roundtrip.mihonbk'))
    library.removeFavorite(id)
    const result = await backup.import(file, false)
    assert.equal(result.restored, 1)
    assert.deepEqual(result.errors, [])
    assert.equal(db.getFavorites()[0].id, id)
    assert.equal(library.chapters(id)[0].id, c.id)
    assert.equal(library.chapter(c.id).read, 1)
    assert.equal(library.chapter(c.id).bookmark, 1)
    assert.equal(db.getHistory(10, 0)[0].last_page_read, 1)
    await backup.import(file, false)
    assert.equal(db.getFavorites().length, 1)
    assert.equal(library.chapters(id).length, 3)
    assert.equal(
      (db.connection.prepare('SELECT count(*) n FROM manga_categories').get() as { n: number }).n,
      2
    )
    const data = JSON.parse(readFileSync(file, 'utf8'))
    assert(!('tracker_tokens' in data))
    assert(!('autoTracking' in data.settings))
  } finally {
    db.close()
  }
})
test('backup import continues after a bad entry and rolls back that entry atomically', async () => {
  const { db, dir, backup } = setup()
  try {
    const file = backup.export(join(dir, 'mixed.mihonbk')),
      data = JSON.parse(readFileSync(file, 'utf8'))
    data.manga.push({
      ...data.manga[0],
      manga: { ...data.manga[0].manga, url: '/bad' },
      chapters: [{ ...data.manga[0].chapters[0], page: -1 }]
    })
    writeFileSync(file, JSON.stringify(data))
    const result = await backup.import(file, false)
    assert.equal(result.done, 2)
    assert.equal(result.restored, 1)
    assert.equal(result.errors.length, 1)
    assert(!db.connection.prepare("SELECT id FROM mangas WHERE url='/bad'").get())
    data.version = 99
    writeFileSync(file, JSON.stringify(data))
    await assert.rejects(backup.import(file, false), /Unsupported/)
  } finally {
    db.close()
  }
})
test('automatic backup schedule, retention and metadata persist without deleting unrelated files', () => {
  const { db, dir, backup, settings } = setup()
  try {
    settings.save({ backupHours: 1, maxBackups: 2, backupLocation: join(dir, 'backups') })
    mkdirSync(join(dir, 'backups'))
    writeFileSync(join(dir, 'backups', 'manual.mihonbk'), 'keep')
    const start = Date.now() + 7200000
    backup.tick(start)
    backup.tick(start + 7200000)
    backup.tick(start + 14400000)
    const files = readdirSync(join(dir, 'backups'))
    assert.equal(files.filter((n) => n.startsWith('mihonpc-auto-')).length, 2)
    assert(files.includes('manual.mihonbk'))
    assert(new BackupService(db, settings, dir).status().lastBackup > 0)
    settings.save({ backupHours: 0 })
    backup.tick(start + 999999999)
    assert.equal(readdirSync(join(dir, 'backups')).length, 3)
  } finally {
    db.close()
  }
})
test('settings upgrade removes old tracking preference and IPC rejects removed/new invalid fields', () => {
  const { db, dir } = setup()
  try {
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ theme: 'dark', autoTracking: true }))
    const store = new SettingsStore(join(dir, 'old.json'), db)
    assert.equal(store.get().theme, 'dark')
    assert(!('autoTracking' in store.get()))
    assert(
      !db.connection.prepare("SELECT name FROM sqlite_master WHERE name='tracker_tokens'").get()
    )
    assert(!db.connection.prepare("SELECT name FROM sqlite_master WHERE name='manga_tracks'").get())
    assert.throws(() => settingsPatch({ autoTracking: true }))
    assert.throws(() => validateArgs('downloads:action', [1, 'execute']))
    assert.throws(() => validateArgs('settings:pickDirectory', ['root']))
    assert.throws(() => validateArgs('backup:import', ['yes']))
  } finally {
    db.close()
  }
})
test('download queue pause/resume/cancel, disk completion and delete are durable', async () => {
  const { db, dir, library, settings, id } = setup(),
    c = library.chapters(id)[0],
    q = new DownloadQueue(db, fake(library, id), settings, dir)
  try {
    q.enqueue([c.id])
    q.action(c.id, 'pause')
    await q.tick()
    assert.equal(q.list().jobs[0].state, 'paused')
    q.action(c.id, 'cancel')
    assert.equal(q.list().jobs[0].state, 'cancelled')
    q.action(c.id, 'resume')
    await q.tick()
    await until(() => q.list().jobs[0].state === 'completed')
    assert.equal(q.list().jobs[0].done, 3)
    assert(q.offlinePage(c.id, 2)?.startsWith('data:image/png;base64,'))
    await until(() => !q.isBusy())
    q.action(c.id, 'delete')
    assert.equal(q.list().jobs.length, 0)
    assert.equal(q.offlinePage(c.id, 0), null)
  } finally {
    await q.close()
    db.close()
  }
})
test('download queue obeys concurrency and does not mark cancelled in-flight chapter complete', async () => {
  const { db, dir, library, settings, id } = setup()
  settings.save({ concurrentDownloads: 2 })
  let unblock: () => void = () => {}
  const gate = new Promise<void>((r) => {
      unblock = r
    }),
    q = new DownloadQueue(
      db,
      fake(library, id, async () => {
        await gate
        return png
      }),
      settings,
      dir
    )
  try {
    const ids = library.chapters(id).map((c) => c.id)
    q.enqueue(ids)
    await q.tick()
    assert.equal(q.list().jobs.filter((j) => j.state === 'downloading').length, 2)
    q.action(ids[0], 'cancel')
    unblock()
    await until(() => !q.isBusy())
    assert.equal(q.list().jobs.find((j) => j.chapter_id === ids[0])?.state, 'cancelled')
    assert(
      !db.connection
        .prepare('SELECT chapter_id FROM cached_chapters WHERE chapter_id=?')
        .get(ids[0])
    )
  } finally {
    unblock()
    await q.close()
    db.close()
  }
})
test('queue recovers interrupted work after restart, preserves pause and retries failed fetches', async () => {
  const { db, dir, library, settings, id } = setup(),
    ids = library.chapters(id).map((c) => c.id)
  let fail = true
  const services = fake(library, id, async () => {
    if (fail) throw new Error('503 fixture')
    return png
  })
  let q = new DownloadQueue(db, services, settings, dir)
  try {
    q.enqueue(ids.slice(0, 2))
    q.action(ids[1], 'pause')
    db.connection
      .prepare("UPDATE download_jobs SET state='downloading' WHERE chapter_id=?")
      .run(ids[0])
    await q.close()
    q = new DownloadQueue(db, services, settings, dir)
    assert.equal(q.list().jobs.find((j) => j.chapter_id === ids[0])?.state, 'queued')
    assert.equal(q.list().jobs.find((j) => j.chapter_id === ids[1])?.state, 'paused')
    await q.tick()
    await until(() => q.list().jobs.some((j) => j.state === 'error'))
    assert.match(q.list().jobs.find((j) => j.state === 'error')!.error, /503/)
    fail = false
    q.action(ids[0], 'resume')
    await q.tick()
    await until(() => q.list().jobs.some((j) => j.state === 'completed'))
  } finally {
    await q.close()
    db.close()
  }
})
test('Wi-Fi and offline gates prevent network work and preserve queued jobs', async () => {
  const { db, dir, library, settings, id } = setup()
  let calls = 0,
    wifi = false
  const q = new DownloadQueue(
    db,
    fake(library, id, async () => {
      calls++
      return png
    }),
    settings,
    dir,
    async () => wifi
  )
  try {
    settings.save({ wifiOnly: true })
    q.enqueue([library.chapters(id)[0].id])
    await q.tick()
    assert.equal(q.list().waiting, 'Waiting for Wi-Fi')
    assert.equal(calls, 0)
    wifi = true
    settings.save({ offlineOnly: true })
    await q.tick()
    assert.equal(q.list().waiting, 'Offline mode')
    assert.equal(calls, 0)
    settings.save({ offlineOnly: false })
    await q.tick()
    await until(() => q.list().jobs[0].state === 'completed')
    assert.equal(calls, 3)
  } finally {
    await q.close()
    db.close()
  }
})
test('download directory refuses symbolic link escape and statistics use database state', async () => {
  const { db, dir, library, settings, id } = setup(),
    services = fake(library, id),
    release = new ReleaseServices(db, settings, services, dir)
  try {
    const outside = join(dir, 'outside')
    mkdirSync(outside)
    const root = join(dir, 'downloads', 'MihonPC-downloads')
    mkdirSync(root, { recursive: true })
    symlinkSync(outside, join(root, String(library.chapters(id)[0].id)), 'junction')
    const c = library.chapters(id)[0]
    release.downloads.enqueue([c.id])
    await release.downloads.tick()
    await until(() => release.downloads.list().jobs[0].state === 'error')
    assert(!existsSync(join(outside, '0.img')))
    assert.equal(release.statistics().titles, 1)
    assert.equal(release.statistics().chapters, 3)
  } finally {
    await release.downloads.close()
    db.close()
  }
})

test('completed download survives full database close/reopen without a network fetch', async () => {
  const first = setup(),
    file = first.db.path,
    c = first.library.chapters(first.id)[0]
  const queue = new DownloadQueue(
    first.db,
    fake(first.library, first.id),
    first.settings,
    first.dir
  )
  queue.enqueue([c.id])
  await queue.tick()
  await until(() => queue.list().jobs[0].state === 'completed')
  await queue.close()
  first.db.close()
  const db = new AppDatabase(file, resolve('migrations')),
    library = new LibraryRepository(db),
    settings = new SettingsStore(join(first.dir, 'settings.json'), db)
  const reopened = new DownloadQueue(
    db,
    fake(library, first.id, async () => {
      throw new Error('No network permitted')
    }),
    settings,
    first.dir
  )
  try {
    assert.equal(reopened.list().jobs[0].state, 'completed')
    assert(reopened.offlinePage(c.id, 2)?.startsWith('data:image/png;'))
    assert.equal(db.status('test').integrity, 'ok')
  } finally {
    await reopened.close()
    db.close()
  }
})

test('auto-delete after chapter completion removes download files and badge through handler', async () => {
  const { db, dir, library, settings, id } = setup(),
    services = fake(library, id),
    release = new ReleaseServices(db, settings, services, dir)
  try {
    const c = library.chapters(id)[0]
    release.downloads.enqueue([c.id])
    await release.downloads.tick()
    await until(() => release.downloads.list().jobs[0].state === 'completed')
    await until(() => !release.downloads.isBusy())
    library.savePages(c.id, [{ index: 0, url: 'https://source.invalid/0' }])
    settings.save({ autoDelete: true })
    const handlers = createHandlers(
      db,
      'test',
      async () => {},
      services,
      undefined,
      undefined,
      settings,
      release
    )
    dispatch(handlers, 'reader:progress', [c.id, 0, 1])
    assert.equal(release.downloads.list().jobs.length, 0)
    assert.equal(release.statistics().offline, 0)
    assert.equal(library.chapter(c.id).read, 1)
  } finally {
    await release.downloads.close()
    db.close()
  }
})
