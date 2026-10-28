import { gzipSync } from 'node:zlib'

/** Exact opaque extension keys; never interpret a restored value as a fetch URL. */
export function decodeRuntimeKey(encoded: string): string {
  if (!encoded || encoded.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(encoded))
    throw new Error('Invalid restored runtime identity')
  const bytes = Buffer.from(encoded, 'base64url')
  const value = bytes.toString('utf8')
  if (Buffer.from(value).toString('base64url') !== encoded || bytes.some((b) => b < 32))
    throw new Error('Invalid restored runtime identity')
  return value
}

export function restoredMangaKey(url: string): string {
  const match = /^\/__mihon\/([A-Za-z0-9_-]+)$/.exec(url)
  if (!match) throw new Error('Invalid restored manga identity')
  return decodeRuntimeKey(match[1])
}

export function restoredChapterParent(url: string): string {
  const match = /^(\/__mihon\/[A-Za-z0-9_-]+)\/chapter\/([A-Za-z0-9_-]+)$/.exec(url)
  if (!match) throw new Error('Invalid restored chapter identity')
  restoredMangaKey(match[1])
  decodeRuntimeKey(match[2])
  return match[1]
}

function varint(value: bigint): Buffer {
  let n = BigInt.asUintN(64, value)
  const bytes: number[] = []
  while (n > 127n) {
    bytes.push(Number(n & 127n) | 128)
    n >>= 7n
  }
  bytes.push(Number(n))
  return Buffer.from(bytes)
}
function stringField(field: number, value: string): Buffer {
  const bytes = Buffer.from(value)
  return Buffer.concat([varint(BigInt(field * 8 + 2)), varint(BigInt(bytes.length)), bytes])
}

/** Pinned Suwayomi public backup API registers exact source+key, without importing user settings/code. */
export function runtimeRegistrationBackup(source: string, url: string, title: string): Buffer {
  const signed = BigInt(source)
  if (String(signed) !== source || BigInt.asIntN(64, signed) !== signed)
    throw new Error('Invalid runtime source ID')
  const entry = Buffer.concat([
    varint(8n),
    varint(signed),
    stringField(2, url),
    stringField(3, title),
    varint(800n),
    varint(0n)
  ])
  return gzipSync(Buffer.concat([varint(10n), varint(BigInt(entry.length)), entry]))
}
