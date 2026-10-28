import './mobile-backup.test'
import './runtime-restore.test'
import './navigation.test'
import './covers.test'
import './icons.test'
import './repositories.test'
import './reading.test'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, cpSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import Sqlite from 'better-sqlite3'
import { AppDatabase, migrate } from '../src/main/db'
import { createHandlers, dispatch } from '../src/main/handlers'
import { isChannel, validateArgs } from '../src/shared/ipc'

const migrations = resolve('migrations')
function withDb(run: (db: AppDatabase) => void): void {
  const db = new AppDatabase(':memory:', migrations)
  try {
    run(db)
  } finally {
    db.close()
  }
}
test('fresh database applies schema v4 with collection and settings tables', () =>
  withDb((db) => {
    const status = db.status('test')
    assert.equal(status.schemaVersion, 4)
    assert.equal(status.integrity, 'ok')
    const tables = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
    assert.equal(tables.length, 14)
    assert.deepEqual(db.getFavorites(), [])
    assert.deepEqual(db.getHistory(50, 0), [])
  }))
test('migration is idempotent and preserves existing rows', () =>
  withDb((db) => {
    db.connection
      .prepare("INSERT INTO mangas(source_id,url,title,favorite) VALUES(1,'/test','Test',1)")
      .run()
    migrate(db.connection, migrations)
    assert.equal(db.getFavorites()[0].title, 'Test')
    assert.equal(db.status('test').schemaVersion, 4)
  }))
test('database persists across close and reopen', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'mihon-db-')), 'nested', 'mihonpc.db')
  const first = new AppDatabase(path, migrations)
  first.connection
    .prepare("INSERT INTO mangas(source_id,url,title,favorite) VALUES(2,'/persist','Persistent',1)")
    .run()
  first.close()
  const second = new AppDatabase(path, migrations)
  try {
    assert.equal(second.getFavorites()[0].title, 'Persistent')
  } finally {
    second.close()
  }
})
test('failed migration rolls back SQL and user_version together', () =>
  withDb((db) => {
    const directory = mkdtempSync(join(tmpdir(), 'mihon-migrations-'))
    cpSync(migrations, directory, { recursive: true })
    writeFileSync(
      join(directory, '005_broken.sql'),
      'CREATE TABLE partial(id INTEGER); INVALID SQL;'
    )
    assert.throws(() => migrate(db.connection, directory))
    assert.equal(db.connection.pragma('user_version', { simple: true }), 4)
    assert.equal(
      db.connection.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get(),
      undefined
    )
  }))
test('future database versions are rejected without overwriting them', () =>
  withDb((db) => {
    db.connection.pragma('user_version=99')
    assert.throws(() => migrate(db.connection, migrations), /newer/)
    assert.equal(db.connection.pragma('user_version', { simple: true }), 99)
  }))
test('missing, duplicate and gapped migrations fail before applying SQL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mihon-gap-'))
  const db = new Sqlite(':memory:')
  try {
    assert.throws(() => migrate(db, directory), /No database migrations/)
    writeFileSync(join(directory, '002_gap.sql'), 'CREATE TABLE unexpected(id INTEGER);')
    assert.throws(() => migrate(db, directory), /sequence/)
    assert.equal(db.pragma('user_version', { simple: true }), 0)
    writeFileSync(join(directory, '001_first.sql'), 'CREATE TABLE test(id INTEGER);')
    writeFileSync(join(directory, '001_duplicate.sql'), 'CREATE TABLE test2(id INTEGER);')
    assert.throws(() => migrate(db, directory), /sequence/)
  } finally {
    db.close()
  }
})
test('foreign keys reject orphans and cascade chapters, history and assignments', () =>
  withDb((db) => {
    assert.throws(
      () =>
        db.connection.prepare("INSERT INTO chapters(manga_id,url,name) VALUES(99,'/a','A')").run(),
      /FOREIGN KEY/
    )
    db.connection.exec(`INSERT INTO mangas(id,source_id,url,title) VALUES(1,1,'/m','M');
    INSERT INTO chapters(id,manga_id,url,name) VALUES(1,1,'/c','C');
    INSERT INTO history(chapter_id,last_read) VALUES(1,100);
    INSERT INTO categories(id,name) VALUES(1,'Test');
    INSERT INTO manga_categories(manga_id,category_id) VALUES(1,1);
    DELETE FROM mangas WHERE id=1;`)
    for (const table of ['chapters', 'history', 'manga_categories']) {
      assert.deepEqual(db.connection.prepare('SELECT * FROM ' + table).all(), [])
    }
  }))
test('manga and chapter URL identities are unique within their source or manga', () =>
  withDb((db) => {
    db.connection.exec("INSERT INTO mangas(source_id,url,title) VALUES(1,'/m','M')")
    assert.throws(
      () =>
        db.connection.exec("INSERT INTO mangas(source_id,url,title) VALUES(1,'/m','Duplicate')"),
      /UNIQUE/
    )
    db.connection.exec("INSERT INTO mangas(source_id,url,title) VALUES(2,'/m','Other source')")
    assert.equal(db.status('test').mangaCount, 2)
    db.connection.exec("INSERT INTO chapters(manga_id,url,name) VALUES(1,'/c','C')")
    assert.throws(
      () =>
        db.connection.exec("INSERT INTO chapters(manga_id,url,name) VALUES(1,'/c','Duplicate')"),
      /UNIQUE/
    )
  }))
test('favorites are filtered and sorted; history joins titles and paginates', () =>
  withDb((db) => {
    db.connection
      .exec(`INSERT INTO mangas(id,source_id,url,title,favorite) VALUES(1,1,'/z','Zebra',1),(2,1,'/a','alpha',1),(3,1,'/x','Hidden',0);
    INSERT INTO chapters(id,manga_id,url,name) VALUES(1,1,'/c1','Chapter 1'),(2,2,'/c2','Chapter 2');
    INSERT INTO history(chapter_id,last_read) VALUES(1,100),(2,200);`)
    assert.deepEqual(
      db.getFavorites().map((manga) => manga.title),
      ['alpha', 'Zebra']
    )
    assert.equal(db.getHistory(1, 0)[0].title, 'alpha')
    assert.equal(db.getHistory(1, 1)[0].title, 'Zebra')
  }))
test('typed handlers return pong, real database status and zero bundled sources', () =>
  withDb((db) => {
    const handlers = createHandlers(db, '0.1.0', async () => {})
    assert.equal(dispatch(handlers, 'app:ping', []), 'pong')
    assert.deepEqual(dispatch(handlers, 'source:getAll', []), [])
    assert.deepEqual(dispatch(handlers, 'library:getFavorites', []), [])
    assert.deepEqual(dispatch(handlers, 'history:getRecent', [20, 0]), [])
    assert.deepEqual(dispatch(handlers, 'app:status', []), db.status('0.1.0'))
  }))
test('IPC allowlist rejects unknown channels, extra args and invalid history tuples', () =>
  withDb((db) => {
    const handlers = createHandlers(db, 'test', async () => {})
    for (const value of ['__proto__', 'constructor', 'fs:read', '', undefined, 1]) {
      assert.equal(isChannel(value), false)
      assert.throws(() => dispatch(handlers, value, []), /Unknown/)
    }
    for (const channel of [
      'app:ping',
      'app:status',
      'app:openDataDirectory',
      'library:getFavorites',
      'source:getAll',
      'extensions:getAll',
      'extensions:reload',
      'extensions:installFile'
    ] as const) {
      assert.throws(() => validateArgs(channel, [1]), /no arguments/)
    }
    for (const args of [
      [],
      [0, 0],
      [201, 0],
      [50, -1],
      [1.5, 0],
      ['50', 0],
      [NaN, 0],
      [1, Infinity],
      [1, 0, 'extra']
    ]) {
      assert.throws(() => dispatch(handlers, 'history:getRecent', args), /History requires/)
    }
  }))
test('packaging includes migrations and native SQLite; renderer has no remote assets', () => {
  const config = readFileSync('electron-builder.yml', 'utf8')
  assert.match(config, /extraResources:[\s\S]*from: migrations/)
  assert.match(config, /\*\*\/\*\.node/)
  const html = readFileSync('src/renderer/index.html', 'utf8')
  assert.match(html, /Content-Security-Policy/)
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  assert.doesNotMatch(app, /<img[^>]+https?:|fetch\(|XMLHttpRequest|from ['"]node:/)
})

import './collection.test'

import './release.test'
