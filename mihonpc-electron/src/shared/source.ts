export interface SManga {
  url: string
  title: string
  author?: string
  artist?: string
  description?: string
  genre?: string
  status: number
  thumbnailUrl?: string
  initialized?: boolean
}
export interface SChapter {
  url: string
  name: string
  scanlator?: string
  dateUpload: number
  chapterNumber: number
}
export interface Page {
  index: number
  url: string
  imageUrl?: string
  headers?: Record<string, string>
}
export interface Filter {
  type: 'text' | 'select' | 'checkbox' | 'header' | 'separator'
  name: string
  state?: string | number | boolean
  values?: string[]
}
export interface MangasPage {
  mangas: SManga[]
  hasNextPage: boolean
}
export interface SourceInfo {
  id: number
  name: string
  lang: string
  baseUrl: string
  supportsLatest: boolean
  extensionId: string
}
export interface ExtensionInfo {
  id: string
  name: string
  lang: string
  version: string
  nsfw: boolean
  enabled: boolean
  filename: string
  error?: string
  sources: SourceInfo[]
}
export interface ExtensionMeta {
  id: string
  name: string
  lang: string
  version: string
  nsfw: boolean
  hosts?: string[]
}
export interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}
export interface FetchResult {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
  body: string
}
export type SourceMethod =
  | 'getPopularManga'
  | 'getLatestUpdates'
  | 'searchManga'
  | 'getMangaDetails'
  | 'getChapterList'
  | 'getPageList'
  | 'getFilters'
  | 'getImageUrl'
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object')
  return value as Record<string, unknown>
}
export function text(value: unknown, max = 20000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text')
  return value
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error('Invalid integer')
  return value as number
}
export function relativeUrl(value: unknown): string {
  const url = text(value, 4096)
  if (
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.includes('\\') ||
    [...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new Error('Manga and chapter URLs must be source-relative')
  return url
}
export function httpUrl(value: unknown): string {
  const url = new URL(text(value, 8192))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Expected HTTP(S) URL without credentials')
  return url.href
}
export function headers(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  const result: Record<string, string> = {}
  const entries = Object.entries(record(value))
  if (entries.length > 30) throw new Error('Too many headers')
  for (const [key, val] of entries) {
    if (
      !/^[a-zA-Z0-9-]{1,80}$/.test(key) ||
      /^(host|connection|content-length|proxy-.+|transfer-encoding)$/i.test(key)
    )
      throw new Error('Unsupported HTTP header')
    const data = text(val, 8192)
    if (/[\r\n]/.test(data)) throw new Error('Invalid HTTP header')
    result[key] = data
  }
  return result
}
export function manga(value: unknown): SManga {
  const data = record(value)
  const result: SManga = {
    url: relativeUrl(data.url),
    title: text(data.title, 500),
    status: integer(data.status ?? 0, 0, 6)
  }
  for (const key of ['author', 'artist', 'description', 'genre'] as const)
    if (data[key] != null) result[key] = text(data[key])
  if (data.thumbnailUrl) result.thumbnailUrl = httpUrl(data.thumbnailUrl)
  result.initialized = data.initialized === true
  return result
}
export function chapter(value: unknown): SChapter {
  const data = record(value)
  if (typeof data.chapterNumber !== 'number' || !Number.isFinite(data.chapterNumber))
    throw new Error('Invalid chapter number')
  return {
    url: relativeUrl(data.url),
    name: text(data.name, 500),
    scanlator: data.scanlator == null ? undefined : text(data.scanlator, 500),
    dateUpload: integer(data.dateUpload ?? 0),
    chapterNumber: data.chapterNumber
  }
}
export function page(value: unknown, index: number): Page {
  const data = record(value)
  const result: Page = { index, url: data.url ? httpUrl(data.url) : '' }
  if (data.imageUrl) result.imageUrl = httpUrl(data.imageUrl)
  if (data.headers) result.headers = headers(data.headers)
  return result
}
export function filters(value: unknown): Filter[] {
  if (!Array.isArray(value) || value.length > 60) throw new Error('Invalid filters')
  return value.map((input) => {
    const data = record(input)
    if (!['text', 'select', 'checkbox', 'header', 'separator'].includes(String(data.type)))
      throw new Error('Unsupported filter type')
    const filter: Filter = { type: data.type as Filter['type'], name: text(data.name, 200) }
    if (data.values != null) {
      if (!Array.isArray(data.values) || data.values.length > 200)
        throw new Error('Invalid filter options')
      filter.values = data.values.map((v) => text(v, 200))
    }
    if (data.state !== undefined) {
      if (typeof data.state === 'string') filter.state = text(data.state, 1000)
      else if (typeof data.state === 'boolean') filter.state = data.state
      else if (
        typeof data.state === 'number' &&
        Number.isSafeInteger(data.state) &&
        data.state >= 0 &&
        data.state < (filter.values?.length ?? 1000)
      )
        filter.state = data.state
      else throw new Error('Invalid filter state')
    }
    return filter
  })
}
