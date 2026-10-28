import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AppDatabase } from '../src/main/db'
import { LibraryRepository } from '../src/main/library'
import { CollectionService } from '../src/main/collection'
import { SettingsStore } from '../src/main/settings'
import { UpdateScheduler } from '../src/main/scheduler'
import { settingsPatch } from '../src/shared/settings'
import { catalogueVisibility } from '../src/shared/browse'
import { shouldKeepDisplayAwake } from '../src/main/reader-power'
import { validateArgs } from '../src/shared/ipc'
import type { ReadingServices } from '../src/main/services'
function setup(): {
  db: AppDatabase
  library: LibraryRepository
  collection: CollectionService
  settings: SettingsStore
  path: string
  id: number
} {
  const db = new AppDatabase(':memory:', resolve('migrations')),
    library = new LibraryRepository(db)
  const path = join(mkdtempSync(join(tmpdir(), 'mihon-settings-')), 'settings.json'),
    settings = new SettingsStore(path, db)
  const id = library.save(7, { url: '/m', title: 'Paper', status: 1 }, [
    { url: '/c1', name: 'One', chapterNumber: 1, dateUpload: 10 }
  ])
  library.upsert(7, { url: '/m', title: 'Paper', status: 1 }, true)
  return {
    db,
    library,
    collection: new CollectionService(db, undefined, settings),
    settings,
    path,
    id
  }
}
test('categories support multiple assignments, rename, delete cascade and transactional failures', () => {
  const { db, collection, id } = setup()
  try {
    const a = collection.category(0, 'Reading')[0].id,
      b = collection.category(0, 'Favorites')[1].id
    collection.assign([id], [a, b])
    assert.deepEqual(collection.library()[0].categories, [a, b])
    assert.throws(() => collection.assign([id], [999]))
    assert.deepEqual(collection.library()[0].categories, [a, b])
    collection.category(a, 'Now')
    assert.equal(collection.categories()[0].name, 'Now')
    collection.deleteCategory(a)
    assert.deepEqual(collection.library()[0].categories, [b])
    assert.throws(() => collection.category(0, '  '))
    assert.throws(() => collection.category(0, 'Favorites'))
  } finally {
    db.close()
  }
})
test('library aggregates and bulk read/unread/remove preserve identities', () => {
  const { db, collection, library, id } = setup()
  try {
    const chapter = library.chapters(id)[0]
    assert.equal(collection.library()[0].unread, 1)
    collection.bulk([id], 'read')
    assert.equal(collection.library()[0].unread, 0)
    collection.bulk([id], 'unread')
    assert.equal(collection.library()[0].unread, 1)
    collection.bulk([id], 'remove')
    assert.equal(collection.library().length, 0)
    assert.equal(library.chapter(chapter.id).id, chapter.id)
  } finally {
    db.close()
  }
})
test('new chapters create persistent feed, repeated refresh does not duplicate and reading marks seen', () => {
  const { db, library, collection, id } = setup()
  try {
    const chapters = [
      { url: '/c1', name: 'One', chapterNumber: 1, dateUpload: 10 },
      { url: '/c2', name: 'Two', chapterNumber: 2, dateUpload: 20 }
    ]
    library.save(7, { url: '/m', title: 'Paper', status: 1 }, chapters)
    library.save(7, { url: '/m', title: 'Paper', status: 1 }, chapters)
    assert.equal(collection.updates().length, 1)
    assert.equal(collection.updates()[0].name, 'Two')
    const c = library.chapters(id)[1]
    library.savePages(c.id, [
      { index: 0, url: 'https://x.invalid/1', imageUrl: 'https://x.invalid/1' }
    ])
    library.progress(c.id, 0, 50)
    assert.equal(collection.updates()[0].seen, 1)
    assert.equal(collection.updates()[0].read, 1)
  } finally {
    db.close()
  }
})
test('history supports literal search, pagination and delete without clearing progress', () => {
  const { db, library, collection, id } = setup()
  try {
    const c = library.chapters(id)[0]
    library.savePages(c.id, [{ index: 0, url: 'https://x.invalid' }])
    library.progress(c.id, 0, 12)
    assert.equal(collection.history('pap', 10, 0).length, 1)
    assert.equal(collection.history('%', 10, 0).length, 0)
    assert.equal(collection.history('', 10, 1).length, 0)
    collection.deleteHistory(c.id)
    assert.equal(collection.history('', 10, 0).length, 0)
    assert.equal(library.chapter(c.id).read, 1)
  } finally {
    db.close()
  }
})
test('settings validate, atomically persist, mirror to SQLite and survive reopen', () => {
  const { db, settings, path, library, id } = setup()
  try {
    settings.save({ theme: 'dark', readerMode: 'webtoon', preload: 4 })
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).theme, 'dark')
    assert.equal(new SettingsStore(path, db).get().preload, 4)
    assert.equal(
      (
        db.connection.prepare("SELECT value FROM settings WHERE key='theme'").get() as {
          value: string
        }
      ).value,
      '"dark"'
    )
    assert.equal(library.preferences(id).mode, 'webtoon')
    assert.throws(() => settings.save({ gridColumns: 99 }))
    assert.equal(settings.get().gridColumns, 3)
    assert.throws(() => settingsPatch({ unknown: true }))
    assert.throws(() => settingsPatch({ userAgent: 'bad\r\nheader' }))
    assert.throws(() => settingsPatch({ theme: 'invalid' }))
  } finally {
    db.close()
  }
})
test('collection IPC rejects invalid bulk actions, oversized arrays and invalid settings', () => {
  assert.throws(() => validateArgs('collection:bulk', [[1], 'erase']))
  assert.throws(() => validateArgs('categories:assign', [[1], [-1]]))
  assert.throws(() => validateArgs('settings:set', [{ preload: 11 }]))
  assert.throws(() => validateArgs('collection:bulk', [Array(2001).fill(1), 'read']))
  validateArgs('collection:bulk', [[1], 'read'])
})
test('background checks serialize, report per-source errors and release empty runs', async () => {
  const { db, library, settings } = setup()
  try {
    let calls = 0
    const services = {
      library,
      refresh: async () => {
        calls++
        await Promise.resolve()
        throw new Error('offline')
      }
    } as unknown as ReadingServices
    const collection = new CollectionService(db, services, settings),
      a = collection.check(),
      b = collection.check()
    assert.equal(a, b)
    const result = await a
    assert.equal(calls, 1)
    assert.equal(result.done, 1)
    assert.match(result.errors[0], /offline/)
    db.connection.prepare('UPDATE mangas SET favorite=0').run()
    await collection.check()
    await collection.check()
    assert.equal(collection.status().total, 0)
  } finally {
    db.close()
  }
})
test('scheduled checks respect interval, AC power, disabled setting and notification preference', async () => {
  const { db, collection, settings } = setup()
  try {
    let checks = 0,
      notifications = 0,
      battery = true
    collection.check = async () => {
      checks++
      return { ...collection.status(), added: 2 }
    }
    settings.save({ updateHours: 1, chargeOnly: true })
    const scheduler = new UpdateScheduler(
      collection,
      settings,
      () => battery,
      () => {
        notifications++
      }
    )
    await scheduler.tick(0)
    await scheduler.tick(3600000)
    assert.equal(checks, 0)
    battery = false
    await scheduler.tick(3600001)
    assert.equal(checks, 1)
    assert.equal(notifications, 1)
    settings.save({ notifications: false })
    await scheduler.tick(7200001)
    assert.equal(checks, 2)
    assert.equal(notifications, 1)
    settings.save({ updateHours: 0 })
    await scheduler.tick(99999999)
    assert.equal(checks, 2)
  } finally {
    db.close()
  }
})
test('single chapter download deduplicates and only marks fully cached chapters', async () => {
  const { db, library, settings, id } = setup()
  try {
    const c = library.chapters(id)[0]
    let pages = 0,
      fail = true
    const services = {
      reader: async () => ({ pages: [{}, {}] }),
      page: async () => {
        pages++
        if (fail) throw new Error('image offline')
      }
    } as unknown as ReadingServices
    const collection = new CollectionService(db, services, settings)
    await assert.rejects(collection.download(c.id))
    assert.equal(collection.library()[0].downloaded, 0)
    fail = false
    const a = collection.download(c.id),
      b = collection.download(c.id)
    assert.equal(a, b)
    await a
    assert.equal(pages, 3)
    assert.equal(collection.library()[0].downloaded, 1)
  } finally {
    db.close()
  }
})

test('first settings file preserves existing schema-2 global reader defaults', () => {
  const db = new AppDatabase(':memory:', resolve('migrations'))
  try {
    db.connection
      .prepare(
        "UPDATE reader_defaults SET mode='vertical',direction='rtl',preload=7,zoom=1.5 WHERE id=1"
      )
      .run()
    const path = join(mkdtempSync(join(tmpdir(), 'mihon-prior-defaults-')), 'settings.json'),
      store = new SettingsStore(path, db)
    assert.equal(store.get().readerMode, 'vertical')
    assert.equal(store.get().direction, 'rtl')
    assert.equal(store.get().preload, 7)
    assert.equal(
      (db.connection.prepare('SELECT zoom FROM reader_defaults').get() as { zoom: number }).zoom,
      1.5
    )
  } finally {
    db.close()
  }
})

test('activity layouts persist independently and reject unsupported values', () => {
  const { db, settings, path } = setup()
  try {
    assert.equal(settings.get().historyView, 'card')
    assert.equal(settings.get().updatesView, 'card')
    settings.save({ historyView: 'list', updatesView: 'card' })
    const fresh = new SettingsStore(path, db)
    assert.equal(fresh.get().historyView, 'list')
    assert.equal(fresh.get().updatesView, 'card')
    fresh.save({ updatesView: 'list' })
    assert.equal(fresh.get().historyView, 'list')
    assert.throws(() => settingsPatch({ historyView: 'giant' }))
    assert.throws(() => settingsPatch({ updatesView: 'grid' }))
  } finally {
    db.close()
  }
})
test('history search and recent history include covers without changing resume progress', () => {
  const { db, library, collection, id } = setup()
  try {
    const url = 'https://covers.example/test.png'
    db.connection.prepare('UPDATE mangas SET thumbnail_url=? WHERE id=?').run(url, id)
    const c = library.chapters(id)[0]
    library.savePages(c.id, [
      {
        index: 0,
        url: 'https://covers.example/page.png',
        imageUrl: 'https://covers.example/page.png'
      }
    ])
    library.progress(c.id, 0, 10)
    assert.equal(collection.history('', 100, 0)[0].thumbnail_url, url)
    assert.equal(db.getHistory(100, 0)[0].thumbnail_url, url)
    assert.equal(collection.history('', 100, 0)[0].last_page_read, 0)
  } finally {
    db.close()
  }
})

test('overdue library schedule waits offline and runs immediately when online again', async () => {
  const { db, collection, settings } = setup()
  try {
    let checks = 0
    collection.check = async () => {
      checks++
      return { ...collection.status(), added: 0 }
    }
    settings.save({ updateHours: 1, offlineOnly: true })
    const scheduler = new UpdateScheduler(
      collection,
      settings,
      () => false,
      () => {}
    )
    await scheduler.tick(0)
    await scheduler.tick(3600000)
    assert.equal(checks, 0)
    settings.save({ offlineOnly: false })
    await scheduler.tick(3600001)
    assert.equal(checks, 1)
    await scheduler.tick(3600002)
    assert.equal(checks, 1)
  } finally {
    db.close()
  }
})

test('display wake applies only to visible reader routes, not library, settings or tray', () => {
  assert.equal(shouldKeepDisplayAwake(true, 'file:///app/index.html#/reader/42', true), true)
  assert.equal(shouldKeepDisplayAwake(false, 'file:///app/index.html#/reader/42', true), false)
  assert.equal(shouldKeepDisplayAwake(true, 'file:///app/index.html#/reader/42', false), false)
  assert.equal(shouldKeepDisplayAwake(true, 'file:///app/index.html#/library', true), false)
  assert.equal(shouldKeepDisplayAwake(true, 'file:///app/index.html#/settings/reader', true), false)
  assert.equal(
    shouldKeepDisplayAwake(true, 'file:///app/index.html#/reader/not-an-id', true),
    false
  )
  assert.equal(shouldKeepDisplayAwake(true, 'not a URL', true), false)
})

test('global reader defaults preserve explicit per-title preferences and zoom', () => {
  const { db, settings, library, id } = setup()
  try {
    library.setPreferences(id, { mode: 'vertical', direction: 'rtl', preload: 5, zoom: 1.5 }, false)
    settings.save({ readerMode: 'webtoon', direction: 'ltr', preload: 1 })
    assert.deepEqual(library.preferences(id), {
      mode: 'vertical',
      direction: 'rtl',
      preload: 5,
      zoom: 1.5
    })
    const other = library.save(7, { url: '/other', title: 'Other', status: 1 }, [])
    assert.deepEqual(library.preferences(other), {
      mode: 'webtoon',
      direction: 'ltr',
      preload: 1,
      zoom: 1
    })
  } finally {
    db.close()
  }
})

test('reader fit and page number settings validate and survive reopen', () => {
  const { db, settings, path } = setup()
  try {
    assert.equal(settings.get().showPageNumber, true)
    assert.equal(settings.get().imageFit, 'screen')
    settings.save({ showPageNumber: false, imageFit: 'width' })
    const fresh = new SettingsStore(path, db)
    assert.equal(fresh.get().showPageNumber, false)
    assert.equal(fresh.get().imageFit, 'width')
    for (const fit of ['screen', 'width', 'height', 'original'] as const)
      assert.equal(settingsPatch({ imageFit: fit }).imageFit, fit)
    assert.throws(() => settingsPatch({ imageFit: 'crop' }))
    assert.throws(() => settingsPatch({ showPageNumber: 'yes' }))
  } finally {
    db.close()
  }
})

test('browse preferences default off, persist independently and reject nonboolean values', () => {
  const { db, settings, path } = setup()
  try {
    assert.equal(settings.get().showNsfw, false)
    assert.equal(settings.get().hideInLibrary, false)
    settings.save({ showNsfw: true, hideInLibrary: true })
    const fresh = new SettingsStore(path, db)
    assert.equal(fresh.get().showNsfw, true)
    assert.equal(fresh.get().hideInLibrary, true)
    fresh.save({ showNsfw: false })
    assert.equal(fresh.get().hideInLibrary, true)
    assert.throws(() => settingsPatch({ showNsfw: 'true' }))
    assert.throws(() => settingsPatch({ hideInLibrary: 1 }))
  } finally {
    db.close()
  }
})

test('hide-in-library filters only exact favorite source-relative URLs, preserving order and input', () => {
  const page = [
    { url: '/same', title: 'One' },
    { url: '/other', title: 'One' },
    { url: '/new', title: 'New' }
  ]
  const favorites = [
    { source_id: 7, url: '/same', favorite: 1 },
    { source_id: 8, url: '/other', favorite: 1 },
    { source_id: 7, url: '/new', favorite: 0 }
  ]
  assert.deepEqual(catalogueVisibility(page, 7, favorites, true), [page[1], page[2]])
  assert.deepEqual(catalogueVisibility(page, 8, favorites, true), [page[0], page[2]])
  assert.deepEqual(catalogueVisibility(page, 9, favorites, true), page)
  assert.deepEqual(catalogueVisibility(page, 7, favorites, false), page)
  assert.equal(page.length, 3)
  assert.deepEqual(catalogueVisibility([{ url: '/same/' }], 7, favorites, true), [
    { url: '/same/' }
  ])
})
