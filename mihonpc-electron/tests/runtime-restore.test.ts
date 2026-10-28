import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { AppDatabase } from '../src/main/db'
import { RepositoryExtensionManager } from '../src/main/extensions/repository-manager'
import {
  decodeRuntimeKey,
  restoredMangaKey,
  restoredChapterParent,
  runtimeRegistrationBackup
} from '../src/main/extensions/runtime-restore'
import { sourceAlias } from '../src/shared/repositories'
import { manga, chapter } from '../src/shared/source'

test('restored runtime keys roundtrip exact extension keys and reject malformed identities', () => {
  const raw = '/series/some?key=value'
  const encoded = Buffer.from(raw).toString('base64url')
  const wrapped = '/__mihon/' + encoded
  assert.equal(decodeRuntimeKey(encoded), raw)
  assert.equal(restoredMangaKey(wrapped), raw)
  assert.equal(
    restoredChapterParent(wrapped + '/chapter/' + Buffer.from('/chapter/1').toString('base64url')),
    wrapped
  )
  for (const bad of ['', 'a', 'YQ=', 'AA', '____']) assert.throws(() => decodeRuntimeKey(bad))
  assert.throws(() => restoredMangaKey(wrapped + '/chapter/1'))
  assert.throws(() => restoredChapterParent('/foo'))
})

test('runtime registration contains only exact source, key, title and nonfavorite flag', () => {
  const body = gunzipSync(
    runtimeRegistrationBackup('-9223372036854775808', '/exact-key', 'Restored')
  )
  assert.equal(body[0], 10)
  assert.ok(body.includes(Buffer.from('/exact-key')))
  assert.ok(body.includes(Buffer.from('Restored')))
  assert.equal(body.subarray(-3).toString('hex'), 'a00600')
  assert.throws(() => runtimeRegistrationBackup('9223372036854775808', '/key', 'Title'))
  assert.throws(() => runtimeRegistrationBackup('001', '/key', 'Title'))
})

test('restored repository identities hydrate by source plus URL and rebuild chapter indices without browsing', async () => {
  const db = new AppDatabase(':memory:', resolve('migrations'))
  const directory = mkdtempSync(join(tmpdir(), 'mihon-runtime-restore-'))
  const manager = new RepositoryExtensionManager(directory, '', db, '')
  const remote = '6247824327199706550'
  const id = manager.importSourceId(remote)
  const url = '/__mihon/' + Buffer.from('/series/test').toString('base64url')
  const chapterUrl = url + '/chapter/' + Buffer.from('/series/test/chapter-1').toString('base64url')
  db.connection
    .prepare('INSERT INTO mangas(source_id,url,title,favorite) VALUES(?,?,?,1)')
    .run(id, url, 'Restored title')
  let registered = false
  const requests: string[] = []
  const fake = {
    async graphql(_query: string, variables: { source: string; url: string }) {
      assert.deepEqual(variables, { source: remote, url: '/series/test' })
      return {
        mangas: { nodes: registered ? [{ id: 42, sourceId: remote, url: '/series/test' }] : [] }
      }
    },
    async response(route: string, options?: RequestInit) {
      requests.push(route)
      if (route === '/api/v1/backup/import') {
        assert.equal(options?.method, 'POST')
        assert.ok(
          gunzipSync(Buffer.from(options?.body as Uint8Array)).includes(Buffer.from('/series/test'))
        )
        registered = true
        return new Response('{}')
      }
      assert.equal(route, '/api/v1/manga/42/thumbnail')
      return new Response(new Uint8Array([1, 2, 3]))
    },
    async json(route: string) {
      requests.push(route)
      if (route.includes('/chapters?'))
        return [
          {
            url: '/series/test/chapter-1',
            name: 'Chapter1',
            uploadDate: 0,
            chapterNumber: 1,
            index: 7,
            pageCount: 2
          }
        ]
      if (route.includes('/chapter/7')) return { pageCount: 2 }
      return {
        id: 42,
        sourceId: remote,
        url: '/series/test',
        title: 'Restored title',
        status: 'ONGOING'
      }
    },
    stop() {
      return undefined
    }
  }
  Object.assign(manager, {
    engine: fake,
    entries: [
      {
        id: 'test.pkg',
        enabled: true,
        sources: [
          { id, name: 'Test', lang: 'en', baseUrl: 'https://example.test', supportsLatest: true }
        ]
      }
    ]
  })
  try {
    assert.equal(id, sourceAlias(remote))
    assert.equal(manager.importSourceId(remote), id)
    assert.throws(() => manager.importSourceId('001'))
    const pages = await manager.pages(
      id,
      chapter({ url: chapterUrl, name: 'Chapter1', chapterNumber: 1 })
    )
    assert.equal(pages.length, 2)
    assert.match(pages[0].imageUrl!, /manga\/42\/chapter\/7\/page\/0/)
    assert.equal(requests.filter((r) => r === '/api/v1/backup/import').length, 1)
    assert.ok(!requests.some((r) => /popular|latest|search/.test(r)))
    const cover = await manager.request(
      id,
      'https://mihonpc-runtime.invalid/api/mihon/cover/' +
        Buffer.from('/series/test').toString('base64url')
    )
    assert.deepEqual([...cover.bytes], [1, 2, 3])
    await assert.rejects(
      manager.details(
        id,
        manga({
          url: '/__mihon/' + Buffer.from('/unowned').toString('base64url'),
          title: 'Unknown'
        })
      ),
      /local database/
    )
    const persisted = JSON.parse(readFileSync(join(directory, 'runtime-identities.json'), 'utf8'))
    assert.equal(persisted.sources[remote], id)
    assert.equal(persisted.mangas[JSON.stringify([id, url])], 42)
    assert.deepEqual(persisted.chapters[JSON.stringify([id, chapterUrl])], { manga: 42, index: 7 })
  } finally {
    manager.dispose()
    db.close()
  }
})
