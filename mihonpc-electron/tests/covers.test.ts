import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverSize } from '../src/main/covers'
import { validateArgs } from '../src/shared/ipc'

test('cover rendition uses the physical display box, preserves aspect and never upscales', () => {
  assert.deepEqual(coverSize({ width: 2000, height: 2861 }, { width: 192, height: 288 }), {
    width: 201,
    height: 288
  })
  assert.deepEqual(coverSize({ width: 2000, height: 2861 }, { width: 384, height: 544 }), {
    width: 384,
    height: 549
  })
  assert.deepEqual(coverSize({ width: 80, height: 120 }, { width: 384, height: 544 }), {
    width: 80,
    height: 120
  })
  assert.deepEqual(coverSize({ width: 3000, height: 1000 }, { width: 180, height: 270 }), {
    width: 810,
    height: 270
  })
})

test('cover IPC bounds physical dimensions and keeps source URLs validated', () => {
  assert.doesNotThrow(() => validateArgs('source:cover', ['https://source.invalid/c', 7, 384, 544]))
  for (const size of [0, -1, 1.5, NaN, Infinity, 2049, '192'])
    assert.throws(() => validateArgs('source:cover', ['https://source.invalid/c', 7, size, 288]))
  assert.throws(() => validateArgs('source:cover', ['file:///private', 7, 192, 288]))
  assert.throws(() => validateArgs('source:cover', ['https://source.invalid/c', 0, 192, 288]))
})
