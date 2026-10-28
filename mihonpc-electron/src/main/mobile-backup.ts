import { gunzipSync } from 'node:zlib'
import { sourceAlias } from '../shared/repositories'
// Wire schema verified against Mihon0.21.3 serializers; see root Mihon Data.md.
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024
export const RUNTIME_ORIGIN = 'https://mihonpc-runtime.invalid'
export const runtimeMangaUrl = (raw: string): string =>
  '/__mihon/' + Buffer.from(raw).toString('base64url')
export const runtimeChapterUrl = (mangaUrl: string, raw: string): string =>
  mangaUrl + '/chapter/' + Buffer.from(raw).toString('base64url')
type Field = { tag: number; wire: number; value: bigint | Buffer }
type Message = Field[]
const decoder = new TextDecoder('utf-8', { fatal: true })
function varint(bytes: Buffer, pos: { n: number }): bigint {
  let result = 0n
  for (let shift = 0; shift < 70; shift += 7) {
    if (pos.n >= bytes.length) throw new Error('Truncated protobuf varint')
    const b = bytes[pos.n++]
    if (shift === 63 && b > 1) throw new Error('Protobuf varint exceeds64bits')
    result |= BigInt(b & 127) << BigInt(shift)
    if (!(b & 128)) return result
  }
  throw new Error('Invalid protobuf varint')
}
function message(bytes: Buffer, budget: { fields: number }): Message {
  const pos = { n: 0 },
    out: Message = []
  while (pos.n < bytes.length) {
    if (++budget.fields > 2000000) throw new Error('Backup contains too many protobuf fields')
    const key = varint(bytes, pos),
      tag = Number(key >> 3n),
      wire = Number(key & 7n)
    if (tag < 1 || tag > 536870911) throw new Error('Invalid protobuf field number')
    let value: bigint | Buffer
    if (wire === 0) value = varint(bytes, pos)
    else {
      let size: number
      if (wire === 1) size = 8
      else if (wire === 5) size = 4
      else if (wire === 2) {
        const n = varint(bytes, pos)
        if (n > BigInt(MAX_BACKUP_BYTES)) throw new Error('Protobuf field too large')
        size = Number(n)
      } else throw new Error('Unsupported protobuf wire type')
      if (pos.n + size > bytes.length) throw new Error('Truncated protobuf field')
      value = bytes.subarray(pos.n, pos.n + size)
      pos.n += size
    }
    out.push({ tag, wire, value })
  }
  return out
}
function field(m: Message, tag: number, wire: number): Field | undefined {
  const matches = m.filter((f) => f.tag === tag)
  if (matches.some((f) => f.wire !== wire)) throw new Error('Unexpected wire type for field' + tag)
  return matches.at(-1)
}
function num(m: Message, tag: number, fallback = 0): number {
  const f = field(m, tag, 0)
  if (!f) return fallback
  const v = BigInt.asIntN(64, f.value as bigint)
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error('Unsafe integer field' + tag)
  return Number(v)
}
function str(m: Message, tag: number, fallback = ''): string {
  const f = field(m, tag, 2)
  return f ? decoder.decode(f.value as Buffer) : fallback
}
function long(m: Message, tag: number, required = false): string {
  const f = field(m, tag, 0)
  if (!f && required) throw new Error('Missing Long field' + tag)
  return f ? BigInt.asIntN(64, f.value as bigint).toString() : '0'
}
function repeated(m: Message, tag: number, limit: number): Buffer[] {
  const values = m.filter((f) => f.tag === tag)
  if (values.length > limit || values.some((f) => f.wire !== 2))
    throw new Error('Invalid repeated field' + tag)
  return values.map((f) => f.value as Buffer)
}
function longs(m: Message, tag: number): string[] {
  const result: string[] = []
  for (const f of m.filter((v) => v.tag === tag)) {
    if (f.wire === 0) result.push(BigInt.asIntN(64, f.value as bigint).toString())
    else if (f.wire === 2) {
      const b = f.value as Buffer,
        p = { n: 0 }
      while (p.n < b.length) result.push(BigInt.asIntN(64, varint(b, p)).toString())
    } else throw new Error('Invalid packed Long field')
    if (result.length > 1000) throw new Error('Too many category memberships')
  }
  return result
}
export function decodeMobileBackup(input: Buffer): Record<string, unknown> {
  if (input.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds64MiB')
  const raw =
    input[0] === 31 && input[1] === 139
      ? gunzipSync(input, { maxOutputLength: MAX_BACKUP_BYTES })
      : input
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('Expanded backup exceeds64MiB')
  const budget = { fields: 0 },
    root = message(raw, budget),
    read = (b: Buffer): Message => message(b, budget)
  const categories = repeated(root, 2, 1000).map((b) => {
    const m = read(b)
    return { name: str(m, 1), order: long(m, 2), id: long(m, 3) }
  })
  const byOrder = new Map<string, string>()
  for (const c of categories) {
    if (!c.name.trim()) throw new Error('Empty backup category')
    if (byOrder.has(c.order) && byOrder.get(c.order) !== c.name)
      throw new Error('Conflicting category order')
    byOrder.set(c.order, c.name)
  }
  const sources = repeated(root, 101, 10000).map((b) => {
    const m = read(b)
    return { remoteId: long(m, 2, true), name: str(m, 1) }
  })
  const sourceNames = new Map(sources.map((s) => [s.remoteId, s.name])),
    aliases = new Map<number, string>()
  const manga = repeated(root, 1, 10000).map((b) => {
    const m = read(b),
      remoteId = long(m, 1, true),
      sourceId = sourceAlias(remoteId),
      rawUrl = str(m, 2),
      url = runtimeMangaUrl(rawUrl)
    if (!rawUrl || rawUrl.length > 4096) throw new Error('Invalid mobile manga URL')
    if (aliases.has(sourceId) && aliases.get(sourceId) !== remoteId)
      throw new Error('Mobile source identity collision')
    aliases.set(sourceId, remoteId)
    const history = new Map<string, { last_read: number; time_read: number }>()
    for (const h of repeated(m, 104, 10000).map(read)) {
      const key = str(h, 1),
        prior = history.get(key),
        last_read = num(h, 2),
        time_read = num(h, 3)
      history.set(key, {
        last_read: Math.max(prior?.last_read ?? 0, last_read),
        time_read: Math.max(prior?.time_read ?? 0, time_read)
      })
    }
    const chapters = repeated(m, 16, 10000)
      .map(read)
      .map((c) => {
        const rawChapter = str(c, 1),
          number = field(c, 9, 5),
          chapterNumber = number ? (number.value as Buffer).readFloatLE() : 0
        if (!rawChapter || rawChapter.length > 4096 || !Number.isFinite(chapterNumber))
          throw new Error('Invalid mobile chapter')
        return {
          chapter: {
            url: runtimeChapterUrl(url, rawChapter),
            name: str(c, 2),
            chapterNumber,
            dateUpload: num(c, 8),
            scanlator: str(c, 3) || undefined
          },
          read: num(c, 4),
          bookmark: num(c, 5),
          page: Math.min(2147483647, Math.max(0, num(c, 6))),
          history: history.get(rawChapter) ?? null,
          dateFetch: num(c, 7),
          sourceOrder: num(c, 10)
        }
      })
    const chapterUrls = new Set(chapters.map((c) => c.chapter.url))
    const unresolvedHistory = [...history.keys()].filter(
      (h) => !chapterUrls.has(runtimeChapterUrl(url, h))
    ).length
    if (unresolvedHistory) throw new Error('Mobile history has no matching chapter')
    const memberships = longs(m, 17).map((k) => {
      const name = byOrder.get(k)
      if (name === undefined) throw new Error('Missing mobile category order' + k)
      return name
    })
    const originalThumbnail = str(m, 9)
    return {
      sourceId,
      remoteSourceId: remoteId,
      sourceName: sourceNames.get(remoteId) || 'Source ' + remoteId,
      favorite: num(m, 100, 1),
      dateAdded: num(m, 13),
      manga: {
        url,
        title: str(m, 3) || rawUrl,
        author: str(m, 5) || undefined,
        artist: str(m, 4) || undefined,
        description: str(m, 6) || undefined,
        genre: repeated(m, 7, 1000)
          .map((b) => decoder.decode(b))
          .join(', '),
        status: num(m, 8),
        thumbnailUrl: originalThumbnail
          ? RUNTIME_ORIGIN + '/api/mihon/cover/' + Buffer.from(rawUrl).toString('base64url')
          : undefined,
        initialized: num(m, 111) === 1
      },
      originalThumbnail,
      chapters,
      categories: memberships
    }
  })
  return {
    format: 'mihonpc',
    version: 1,
    mobile: true,
    manga,
    categories: categories.map((c) => c.name),
    sources,
    warnings: [
      'Mobile app/source settings, tracking accounts, reader bit flags and extension repositories are not applied.',
      'Extensions and page/cover image files are not included in this backup; install the matching sources to fetch online content.'
    ]
  }
}
