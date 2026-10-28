import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IconCache,
  iconData,
  readIcon,
  githubRepositoryAvatar,
  MAX_ICON_BYTES
} from '../src/main/extensions/icons'
import { validateArgs } from '../src/shared/ipc'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
test('icons accept supported raster bytes and reject HTML, SVG and oversized bodies', () => {
  assert.match(iconData(png), /^data:image\/png;base64,/)
  assert.throws(() => iconData(Buffer.from('<html>not an icon</html>')))
  assert.throws(() => iconData(Buffer.from('<svg></svg>')))
  assert.throws(() => iconData(Buffer.alloc(MAX_ICON_BYTES + 1)))
})
test('icon streams enforce byte limits without trusting content-type', async () => {
  assert.deepEqual(await readIcon(new Response(new Uint8Array(png))), png)
  await assert.rejects(readIcon(new Response(new Uint8Array(MAX_ICON_BYTES + 1))))
  await assert.rejects(
    readIcon(new Response('x', { headers: { 'content-length': String(MAX_ICON_BYTES + 1) } }))
  )
})
test('icon requests deduplicate and missing logos keep a recoverable null result', async () => {
  const cache = new IconCache()
  let calls = 0
  const fetch = async (): Promise<Buffer> => {
    calls++
    return png
  }
  const [a, b] = await Promise.all([cache.load('pkg', fetch), cache.load('pkg', fetch)])
  assert.equal(a, b)
  assert.equal(calls, 1)
  assert.equal(
    await cache.load('bad', async () => {
      throw new Error('offline')
    }),
    null
  )
  cache.clear()
  await cache.load('pkg', fetch)
  assert.equal(calls, 2)
})
test('icon cache evicts old entries at its bounded capacity', async () => {
  const cache = new IconCache()
  let calls = 0
  for (let n = 0; n < 129; n++) await cache.load(String(n), async () => png)
  await cache.load('0', async () => {
    calls++
    return png
  })
  assert.equal(calls, 1)
})
test('repository avatars come only from recognized GitHub owners', () => {
  assert.equal(
    githubRepositoryAvatar('https://github.com/keiyoushi/extensions/raw/repo/index.pb'),
    'https://github.com/keiyoushi.png?size=80'
  )
  assert.equal(
    githubRepositoryAvatar('https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb'),
    'https://github.com/keiyoushi.png?size=80'
  )
  assert.equal(githubRepositoryAvatar('https://example.com/keiyoushi/index.pb'), null)
  assert.equal(githubRepositoryAvatar('http://github.com/keiyoushi/index.pb'), null)
})
test('icon IPC validates IDs and URLs without exposing arbitrary network requests', () => {
  validateArgs('extensions:icon', ['eu.kanade.tachiyomi.extension.all.xkcd'])
  validateArgs('repos:icon', ['https://github.com/keiyoushi/extensions/raw/repo/index.pb'])
  assert.throws(() => validateArgs('extensions:icon', [123]))
  assert.throws(() => validateArgs('repos:icon', ['file:///secret']))
  assert.throws(() => validateArgs('extensions:icon', ['pkg', 'extra']))
})
