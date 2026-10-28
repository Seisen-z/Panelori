import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repositoryUrl, sourceAlias } from '../src/shared/repositories'
import { validateArgs } from '../src/shared/ipc'

test('repository URLs select published indexes, not source-code HTML or JS bundles', () => {
  assert.equal(
    repositoryUrl('https://github.com/keiyoushi/extensions'),
    'https://github.com/keiyoushi/extensions/raw/repo/index.pb'
  )
  assert.equal(
    repositoryUrl('https://github.com/keiyoushi/extensions/'),
    'https://github.com/keiyoushi/extensions/raw/repo/index.pb'
  )
  assert.throws(
    () => repositoryUrl('https://github.com/keiyoushi/extensions-source'),
    /source-code/
  )
  assert.throws(() => repositoryUrl('https://example.com/source.js'), /index/)
  assert.throws(() => repositoryUrl('http://example.com/index.pb'), /HTTPS/)
  assert.throws(() => repositoryUrl('https://user:pass@example.com/index.pb'), /HTTPS/)
})
test('repository operations have explicit validated IPC channels', () => {
  validateArgs('repos:add', ['https://example.com/index.pb'])
  validateArgs('repos:install', ['eu.kanade.tachiyomi.extension.all.xkcd'])
  assert.throws(() => validateArgs('repos:add', ['file:///tmp/index.pb']))
  assert.throws(() => validateArgs('repos:install', [123]))
  assert.throws(() => validateArgs('repos:list', ['extra']))
})

test('source Long aliases are deterministic without rounding original 64-bit IDs', () => {
  const id = '1538249443376436084',
    other = '1538249443376436085'
  assert.ok(Number.isSafeInteger(sourceAlias(id)))
  assert.equal(sourceAlias(id), sourceAlias(id))
  assert.notEqual(sourceAlias(id), sourceAlias(other))
  assert.throws(() => sourceAlias('9223372036854775808'))
})
