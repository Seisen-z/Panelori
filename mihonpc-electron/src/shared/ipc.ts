import { integer, text, manga, chapter, filters, httpUrl, record } from './source'
import type {
  SManga,
  SChapter,
  Filter,
  Page,
  MangasPage,
  SourceInfo,
  ExtensionInfo
} from './source'
import type { ExtensionRepository, RepositoryExtension } from './repositories'
import type { ReleaseContract } from './release'
import { settingsPatch, type Settings } from './settings'
export type { SourceInfo } from './source'
export interface Manga {
  id: number
  source_id: number
  url: string
  title: string
  thumbnail_url: string | null
  date_added?: number
  favorite: number
  author: string | null
  artist: string | null
  description: string | null
  genre: string | null
  status: number
}
export interface Chapter {
  id: number
  manga_id: number
  url: string
  name: string
  scanlator: string | null
  read: number
  bookmark: number
  last_page_read: number
  date_fetch?: number
  date_upload: number
  chapter_number: number
  source_order: number
}
export interface MangaDetail {
  manga: Manga
  chapters: Chapter[]
}
export interface ReaderPreferences {
  mode: 'pager' | 'vertical' | 'webtoon'
  direction: 'ltr' | 'rtl'
  preload: number
  zoom: number
}
export interface ReaderSession extends MangaDetail {
  chapter: Chapter
  pages: Page[]
  preferences: ReaderPreferences
  cached: boolean
}
export interface HistoryEntry {
  thumbnail_url?: string | null
  chapter_id: number
  manga_id: number
  source_id: number
  title: string
  name: string
  last_read: number
  last_page_read: number
}
export interface AppStatus {
  version: string
  databasePath: string
  schemaVersion: number
  integrity: string
  mangaCount: number
  chapterCount: number
  extensionCount: number
}
export interface Category {
  id: number
  name: string
  sort: number
}
export interface LibraryItem extends Manga {
  categories: number[]
  unread: number
  downloaded: number
  last_read: number | null
  last_updated: number | null
  date_added: number
}
export interface UpdateEntry extends Chapter {
  title: string
  source_id: number
  thumbnail_url: string | null
  discovered: number
  seen: number
  downloaded: number
}
export interface UpdateStatus {
  running: boolean
  total: number
  done: number
  added: number
  current: string
  errors: string[]
  lastCheck: number
}
export interface IpcContract extends ReleaseContract {
  'collection:library': { args: []; result: LibraryItem[] }
  'categories:list': { args: []; result: Category[] }
  'categories:save': { args: [id: number, name: string]; result: Category[] }
  'categories:delete': { args: [id: number]; result: void }
  'categories:assign': { args: [ids: number[], categories: number[]]; result: void }
  'collection:bulk': { args: [ids: number[], action: 'read' | 'unread' | 'remove']; result: void }
  'history:search': { args: [query: string, limit: number, offset: number]; result: HistoryEntry[] }
  'history:delete': { args: [id: number]; result: void }
  'updates:list': { args: []; result: UpdateEntry[] }
  'updates:check': { args: []; result: UpdateStatus }
  'updates:status': { args: []; result: UpdateStatus }
  'updates:mark': { args: [id: number, read: boolean]; result: void }
  'chapters:download': { args: [id: number]; result: number }
  'settings:get': { args: []; result: Settings }
  'settings:set': { args: [patch: Partial<Settings>]; result: Settings }
  'data:clearCache': { args: []; result: void }
  'data:clearLibrary': { args: [confirmation: string]; result: void }

  'app:ping': { args: []; result: 'pong' }
  'app:status': { args: []; result: AppStatus }
  'app:openDataDirectory': { args: []; result: void }
  'app:fullscreen': { args: [enabled: boolean]; result: void }
  'library:getFavorites': { args: []; result: Manga[] }
  'library:addFavorite': { args: [value: SManga, sourceId: number]; result: number }
  'library:removeFavorite': { args: [id: number]; result: void }
  'source:getAll': { args: []; result: SourceInfo[] }
  'source:getPopular': { args: [id: number, page: number]; result: MangasPage }
  'source:getLatest': { args: [id: number, page: number]; result: MangasPage }
  'source:search': {
    args: [id: number, page: number, query: string, filters: Filter[]]
    result: MangasPage
  }
  'source:getFilters': { args: [id: number]; result: Filter[] }
  'source:getMangaDetails': { args: [id: number, manga: SManga]; result: SManga }
  'source:getChapterList': { args: [id: number, manga: SManga]; result: SChapter[] }
  'source:getPageList': { args: [id: number, chapter: SChapter]; result: Page[] }
  'source:fetchImage': { args: [url: string, sourceId: number]; result: string }
  'source:cover': {
    args: [url: string, sourceId: number, width: number, height: number]
    result: string
  }
  'extensions:icon': { args: [id: string]; result: string | null }
  'repos:icon': { args: [url: string]; result: string | null }
  'repos:list': { args: []; result: ExtensionRepository[] }
  'repos:add': { args: [url: string]; result: ExtensionRepository[] }
  'repos:remove': { args: [url: string]; result: ExtensionRepository[] }
  'repos:extensions': { args: []; result: RepositoryExtension[] }
  'repos:install': { args: [pkg: string]; result: ExtensionInfo[] }
  'extensions:getAll': { args: []; result: ExtensionInfo[] }
  'extensions:reload': { args: []; result: ExtensionInfo[] }
  'extensions:installFile': { args: []; result: ExtensionInfo[] }
  'extensions:installUrl': { args: [url: string]; result: ExtensionInfo[] }
  'extensions:uninstall': { args: [id: string]; result: ExtensionInfo[] }
  'extensions:setEnabled': { args: [id: string, enabled: boolean]; result: ExtensionInfo[] }
  'manga:open': { args: [sourceId: number, manga: SManga]; result: number }
  'manga:getDetail': { args: [id: number]; result: MangaDetail }
  'manga:refresh': { args: [id: number]; result: MangaDetail }
  'chapters:getByManga': { args: [id: number]; result: Chapter[] }
  'reader:open': { args: [chapterId: number, refresh: boolean]; result: ReaderSession }
  'reader:image': { args: [chapterId: number, page: number]; result: string }
  'reader:retryImage': { args: [chapterId: number, page: number]; result: string }
  'reader:progress': { args: [chapterId: number, page: number, elapsed: number]; result: void }
  'reader:setPreferences': {
    args: [mangaId: number, preferences: ReaderPreferences, asDefault: boolean]
    result: ReaderPreferences
  }
  'reader:saveImage': { args: [chapterId: number, page: number]; result: boolean }
  'reader:copyImage': { args: [chapterId: number, page: number]; result: void }
  'history:getRecent': { args: [limit: number, offset: number]; result: HistoryEntry[] }
}
type Validator = (value: unknown) => unknown
const id: Validator = (value) => integer(value, 1)
const index: Validator = (value) => integer(value, 0, 1999)
const boolean: Validator = (value) => {
  if (typeof value !== 'boolean') throw new Error('Expected boolean')
  return value
}
const string: Validator = (value) => text(value, 1000)
export function preferences(value: unknown): ReaderPreferences {
  const data = record(value)
  if (
    !['pager', 'vertical', 'webtoon'].includes(String(data.mode)) ||
    !['ltr', 'rtl'].includes(String(data.direction)) ||
    typeof data.zoom !== 'number' ||
    !Number.isFinite(data.zoom) ||
    data.zoom < 0.5 ||
    data.zoom > 3
  )
    throw new Error('Invalid reader preferences')
  return {
    mode: data.mode as ReaderPreferences['mode'],
    direction: data.direction as ReaderPreferences['direction'],
    preload: integer(data.preload, 0, 10),
    zoom: data.zoom
  }
}
const ids: Validator = (value) => {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('Invalid ID list')
  return value.map(id)
}
const validators: { [C in keyof IpcContract]: Validator[] } = {
  'backup:export': [],
  'backup:import': [boolean],
  'backup:status': [],
  'downloads:list': [],
  'downloads:enqueue': [ids],
  'downloads:action': [
    id,
    (v) => {
      if (!['pause', 'resume', 'cancel', 'delete'].includes(String(v)))
        throw new Error('Invalid download action')
      return v
    }
  ],
  'downloads:all': [
    (v) => {
      if (!['pause', 'resume'].includes(String(v))) throw new Error('Invalid queue action')
      return v
    }
  ],
  'app:statistics': [],
  'app:checkUpdate': [],
  'settings:pickDirectory': [
    (v) => {
      if (!['downloadLocation', 'backupLocation'].includes(String(v)))
        throw new Error('Invalid directory setting')
      return v
    }
  ],
  'collection:library': [],
  'categories:list': [],
  'categories:save': [(v) => integer(v, 0), string],
  'categories:delete': [id],
  'categories:assign': [ids, ids],
  'collection:bulk': [
    ids,
    (v) => {
      if (!['read', 'unread', 'remove'].includes(String(v))) throw new Error('Invalid bulk action')
      return v
    }
  ],
  'history:search': [string, (v) => integer(v, 1, 200), (v) => integer(v, 0)],
  'history:delete': [(v) => integer(v, 0)],
  'updates:list': [],
  'updates:check': [],
  'updates:status': [],
  'updates:mark': [id, boolean],
  'chapters:download': [id],
  'settings:get': [],
  'settings:set': [settingsPatch],
  'data:clearCache': [],
  'data:clearLibrary': [string],
  'app:ping': [],
  'app:status': [],
  'app:openDataDirectory': [],
  'app:fullscreen': [boolean],
  'library:getFavorites': [],
  'library:addFavorite': [manga, id],
  'library:removeFavorite': [id],
  'source:getAll': [],
  'source:getPopular': [id, id],
  'source:getLatest': [id, id],
  'source:search': [id, id, string, filters],
  'source:getFilters': [id],
  'source:getMangaDetails': [id, manga],
  'source:getChapterList': [id, manga],
  'source:getPageList': [id, chapter],
  'source:fetchImage': [httpUrl, id],
  'source:cover': [httpUrl, id, (v) => integer(v, 1, 2048), (v) => integer(v, 1, 2048)],
  'extensions:icon': [string],
  'repos:icon': [httpUrl],
  'repos:list': [],
  'repos:add': [httpUrl],
  'repos:remove': [httpUrl],
  'repos:extensions': [],
  'repos:install': [string],
  'extensions:getAll': [],
  'extensions:reload': [],
  'extensions:installFile': [],
  'extensions:installUrl': [httpUrl],
  'extensions:uninstall': [string],
  'extensions:setEnabled': [string, boolean],
  'manga:open': [id, manga],
  'manga:getDetail': [id],
  'manga:refresh': [id],
  'chapters:getByManga': [id],
  'reader:open': [id, boolean],
  'reader:image': [id, index],
  'reader:retryImage': [id, index],
  'reader:progress': [id, index, (value) => integer(value, 0, 60000)],
  'reader:setPreferences': [id, preferences, boolean],
  'reader:saveImage': [id, index],
  'reader:copyImage': [id, index],
  'history:getRecent': [(value) => integer(value, 1, 200), (value) => integer(value)]
}
export const CHANNELS = Object.keys(validators) as (keyof IpcContract)[]
export type Channel = keyof IpcContract
export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && Object.hasOwn(validators, value)
}
export function validateArgs(channel: Channel, args: unknown[]): void {
  const spec = validators[channel]
  try {
    if (args.length !== spec.length)
      throw new Error(
        spec.length === 0 ? channel + ' takes no arguments' : 'Invalid IPC argument count'
      )
    spec.forEach((validate, i) => validate(args[i]))
  } catch (error) {
    if (channel === 'history:getRecent')
      throw new Error('History requires a limit of 1–200 and a nonnegative offset', {
        cause: error
      })
    throw error
  }
}
export interface ElectronBridge {
  invoke<C extends Channel>(
    channel: C,
    ...args: IpcContract[C]['args']
  ): Promise<IpcContract[C]['result']>
}
