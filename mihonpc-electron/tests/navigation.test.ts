import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeOrigin, resolveOrigin } from '../src/renderer/src/navigation'
import { pagerImageStyle } from '../src/renderer/src/readerLayout'
const fallback = { path: '/library', label: 'Library' }
test('navigation carries Library and catalogue origins through reader and adjacent chapter round trips', () => {
  const library = makeOrigin({ pathname: '/library', search: '?category=2' }, 'Library')
  const reader = makeOrigin({ pathname: '/manga/10', state: library }, 'manga')
  const detail = resolveOrigin(reader, fallback)
  assert.equal(detail.path, '/manga/10')
  assert.equal(resolveOrigin(detail.state, fallback).path, '/library?category=2')
  const catalogue = makeOrigin({ pathname: '/source/7001', search: '?feed=latest' }, 'catalogue')
  assert.equal(resolveOrigin(catalogue, fallback).path, '/source/7001?feed=latest')
  assert.equal(
    resolveOrigin(makeOrigin({ pathname: '/history' }, 'History'), fallback).path,
    '/history'
  )
})
test('return targets reject external, protocol-relative, reader-loop and malformed destinations', () => {
  for (const path of [
    'https://example.com',
    '//example.com',
    '/reader/1',
    '/manga/nope',
    '/source/1#x'
  ])
    assert.deepEqual(resolveOrigin({ origin: { path, label: 'bad' } }, fallback), fallback)
  assert.deepEqual(resolveOrigin(null, fallback), fallback)
})
test('pager fit modes set real sizing and retain zoom without changing webtoon geometry', () => {
  assert.equal(pagerImageStyle('screen', 1).maxWidth, '96vw')
  assert.equal(pagerImageStyle('width', 1.5).width, '144vw')
  assert.equal(pagerImageStyle('height', 1).maxWidth, 'none')
  assert.equal(pagerImageStyle('original', 2).zoom, 2)
})
