import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ExtensionManager } from './manager'
import { ExtensionEngine } from './engine'
import { IconCache, readIcon, githubRepositoryAvatar, MAX_ICON_BYTES } from './icons'
import { HttpBroker } from './network'
import {
  decodeRuntimeKey,
  restoredMangaKey,
  restoredChapterParent,
  runtimeRegistrationBackup
} from './runtime-restore'
import type { AppDatabase } from '../db'
import {
  manga,
  chapter,
  type ExtensionInfo,
  type SourceInfo,
  type SManga,
  type SChapter,
  type Page,
  type MangasPage,
  type Filter
} from '../../shared/source'
import {
  repositoryUrl,
  sourceAlias,
  type ExtensionRepository,
  type RepositoryExtension
} from '../../shared/repositories'

interface RemoteSource {
  id: string
  name: string
  lang: string
  baseUrl: string | null
  supportsLatest: boolean
  iconUrl: string
}
interface RemoteManga {
  id: number
  sourceId: string
  url: string
  title: string
  artist?: string
  author?: string
  description?: string
  genre?: string[]
  status?: string
  initialized?: boolean
}
interface RemoteChapter {
  url: string
  name: string
  scanlator?: string
  uploadDate: number
  chapterNumber: number
  index: number
  mangaId: number
  pageCount: number
}
interface Identity {
  sources: Record<string, number>
  mangas: Record<string, number>
  chapters: Record<string, { manga: number; index: number }>
  disabled: string[]
}
const origin = 'https://mihonpc-runtime.invalid'
/** Actual repository extensions execute in Suwayomi, never as JavaScript in Electron. */
export class RepositoryExtensionManager extends ExtensionManager {
  private entries: ExtensionInfo[] = []
  private readonly iconCache = new IconCache()
  private knownPackages = new Set<string>()
  private readonly engine: ExtensionEngine
  private readonly identityPath: string
  private identity: Identity = { sources: {}, mangas: {}, chapters: {}, disabled: [] }
  constructor(
    directory: string,
    preload: string,
    private readonly appDb: AppDatabase,
    resources: string
  ) {
    super(directory, preload, appDb)
    this.engine = new ExtensionEngine(resources, join(directory, 'runtime-data'))
    this.identityPath = join(directory, 'runtime-identities.json')
    if (existsSync(this.identityPath))
      this.identity = JSON.parse(readFileSync(this.identityPath, 'utf8')) as Identity
  }
  private save(): void {
    writeFileSync(this.identityPath + '.tmp', JSON.stringify(this.identity))
    renameSync(this.identityPath + '.tmp', this.identityPath)
  }
  override importSourceId(remote: string): number {
    if (
      !/^-?\d+$/.test(remote) ||
      String(BigInt(remote)) !== remote ||
      BigInt.asIntN(64, BigInt(remote)).toString() !== remote
    )
      throw new Error('Invalid remote source identity')
    const id = this.identity.sources[remote] ?? sourceAlias(remote)
    if (
      Object.entries(this.identity.sources).some(
        ([other, alias]) => other !== remote && alias === id
      )
    )
      throw new Error('Source identity collision; no sources were merged')
    this.identity.sources[remote] = id
    this.save()
    return id
  }
  override all(): ExtensionInfo[] {
    return this.entries
  }
  override sources(): SourceInfo[] {
    return this.entries.filter((e) => e.enabled).flatMap((e) => e.sources)
  }
  private remote(id: number): string {
    this.source(id)
    const item = Object.entries(this.identity.sources).find(([, v]) => v === id)
    if (!item) throw new Error('Source mapping missing')
    return item[0]
  }
  override async reload(): Promise<ExtensionInfo[]> {
    const [extensions, sources] = await Promise.all([
      this.engine.json<RepositoryExtension[]>('/api/v1/extension/list'),
      this.engine.json<RemoteSource[]>('/api/v1/source/list')
    ])
    this.knownPackages = new Set(extensions.map((e) => e.pkgName))
    this.iconCache.clear()
    this.entries = extensions
      .filter((e) => e.installed)
      .map((e) => ({
        id: e.pkgName,
        name: e.name,
        lang: e.lang,
        version: e.versionName,
        nsfw: e.isNsfw,
        enabled: !this.identity.disabled.includes(e.pkgName),
        filename: e.pkgName,
        sources: sources
          .filter((s) => s.id !== '0' && s.iconUrl.endsWith('/' + e.pkgName))
          .map((s) => {
            // Long IDs stay strings. Local aliases are persistent safe integers in a separate namespace.
            const id = this.identity.sources[s.id] ?? sourceAlias(s.id)
            if (
              Object.entries(this.identity.sources).some(
                ([remote, local]) => remote !== s.id && local === id
              )
            )
              throw new Error('Source identity collision; no sources were merged')
            this.identity.sources[s.id] = id
            return {
              id,
              name: s.name,
              lang: s.lang,
              baseUrl: s.baseUrl || 'https://localhost.invalid',
              supportsLatest: s.supportsLatest,
              extensionId: e.pkgName
            }
          })
      }))
    this.save()
    return this.entries
  }
  override async repositories(): Promise<ExtensionRepository[]> {
    return (
      await this.engine.graphql<{ extensionStores: { nodes: ExtensionRepository[] } }>(
        'query{extensionStores{nodes{indexUrl name}}}'
      )
    ).extensionStores.nodes
  }
  override async addRepository(input: string): Promise<ExtensionRepository[]> {
    await this.engine.graphql(
      'mutation($url:String!){addExtensionStore(input:{indexUrl:$url}){extensionStore{indexUrl name}}}',
      { url: repositoryUrl(input) }
    )
    await this.engine.graphql('mutation{fetchExtensions(input:{}){extensions{pkgName}}}')
    return this.repositories()
  }
  override async removeRepository(url: string): Promise<ExtensionRepository[]> {
    await this.engine.graphql(
      'mutation($url:String!){removeExtensionStore(input:{indexUrl:$url}){extensionStore{indexUrl}}}',
      { url }
    )
    return this.repositories()
  }
  override async available(): Promise<RepositoryExtension[]> {
    const entries = await this.engine.json<RepositoryExtension[]>('/api/v1/extension/list')
    this.knownPackages = new Set(entries.map((e) => e.pkgName))
    return entries
  }
  override async extensionIcon(pkg: string): Promise<string | null> {
    if (!this.knownPackages.has(pkg) || !/^[a-zA-Z0-9_.]+$/.test(pkg)) return null
    return this.iconCache.load('extension:' + pkg, async () =>
      readIcon(await this.engine.response('/api/v1/extension/icon/' + encodeURIComponent(pkg)))
    )
  }
  override async repositoryIcon(index: string): Promise<string | null> {
    return this.iconCache.load('repository:' + index, async () => {
      if (!(await this.repositories()).some((repo) => repo.indexUrl === index))
        throw new Error('Repository not configured')
      const avatar = githubRepositoryAvatar(index)
      if (!avatar) throw new Error('Repository has no known logo')
      const response = await new HttpBroker().request(avatar, {}, undefined, MAX_ICON_BYTES)
      if (response.status !== 200) throw new Error('Repository logo unavailable')
      return response.bytes
    })
  }
  override async installPackage(pkg: string): Promise<ExtensionInfo[]> {
    const entry = (await this.available()).find((e) => e.pkgName === pkg)
    if (!entry) throw new Error('Extension is not in a configured repository')
    await this.engine.response(
      '/api/v1/extension/' +
        (entry.installed ? 'update' : 'install') +
        '/' +
        encodeURIComponent(pkg)
    )
    return this.reload()
  }
  override async installUrl(url: string): Promise<ExtensionInfo[]> {
    await this.addRepository(url)
    return this.reload()
  }
  override async installFile(path: string): Promise<ExtensionInfo[]> {
    if (
      !['.apk', '.jar'].includes(extname(path).toLowerCase()) ||
      !statSync(path).isFile() ||
      statSync(path).size > 64 * 1024 * 1024
    )
      throw new Error('Choose an APK/JAR extension of at most 64 MB')
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(readFileSync(path))]), basename(path))
    await this.engine.response('/api/v1/extension/install', { method: 'POST', body: form })
    return this.reload()
  }
  override async setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo[]> {
    if (!this.entries.some((e) => e.id === id)) throw new Error('Extension not found')
    this.identity.disabled = this.identity.disabled.filter((v) => v !== id)
    if (!enabled) this.identity.disabled.push(id)
    this.save()
    return this.reload()
  }
  override async uninstall(id: string): Promise<ExtensionInfo[]> {
    if (!this.entries.some((e) => e.id === id)) throw new Error('Extension not found')
    await this.engine.response('/api/v1/extension/uninstall/' + encodeURIComponent(id))
    return this.reload()
  }
  private key(id: number, url: string): string {
    return JSON.stringify([id, url])
  }
  private convert(id: number, m: RemoteManga): SManga {
    // Some genuine extensions use non-HTTP grouping keys; wrap reversibly for the existing relative-identity contract.
    const url = '/__mihon/' + Buffer.from(m.url).toString('base64url')
    this.identity.mangas[this.key(id, url)] = m.id
    return manga({
      ...m,
      url,
      status:
        {
          UNKNOWN: 0,
          ONGOING: 1,
          COMPLETED: 2,
          LICENSED: 3,
          PUBLISHING_FINISHED: 4,
          CANCELLED: 5,
          ON_HIATUS: 6
        }[m.status ?? 'UNKNOWN'] ?? 0,
      genre: m.genre?.join(', '),
      thumbnailUrl: origin + '/api/v1/manga/' + m.id + '/thumbnail'
    })
  }
  override async catalogue(
    id: number,
    method: 'getPopularManga' | 'getLatestUpdates' | 'searchManga',
    args: unknown[]
  ): Promise<MangasPage> {
    const remote = this.remote(id),
      p = Number(args[0]),
      search = method === 'searchManga'
    if (method === 'getLatestUpdates' && !this.source(id).supportsLatest)
      throw new Error('Source does not support latest updates')
    const route =
      '/api/v1/source/' +
      remote +
      (search
        ? '/search?searchTerm=' + encodeURIComponent(String(args[1])) + '&pageNum=' + p
        : '/' + (method === 'getPopularManga' ? 'popular' : 'latest') + '/' + p)
    const result = await this.engine.json<{ mangaList: RemoteManga[]; hasNextPage: boolean }>(route)
    const mangas = result.mangaList.map((m) => this.convert(id, m))
    this.save()
    return { mangas, hasNextPage: result.hasNextPage }
  }
  private async mangaId(id: number, value: SManga): Promise<number> {
    const source = this.remote(id)
    const mid = this.identity.mangas[this.key(id, value.url)]
    if (mid !== undefined) return mid
    const stored = this.appDb.connection
      .prepare('SELECT title FROM mangas WHERE source_id = ? AND url = ?')
      .get(id, value.url) as { title: string } | undefined
    if (!stored) throw new Error('Restored manga is not in the local database')
    const raw = restoredMangaKey(value.url)
    const find = async (): Promise<number | undefined> => {
      const result = await this.engine.graphql<{
        mangas: { nodes: Pick<RemoteManga, 'id' | 'sourceId' | 'url'>[] }
      }>(
        'query($source:LongString!,$url:String!){mangas(condition:{sourceId:$source,url:$url},first:2){nodes{id sourceId url}}}',
        { source, url: raw }
      )
      const matches = result.mangas.nodes.filter((m) => m.sourceId === source && m.url === raw)
      if (matches.length > 1) throw new Error('Ambiguous runtime manga identity')
      const match = matches[0]
      if (match && (!Number.isSafeInteger(match.id) || match.id < 0))
        throw new Error('Invalid runtime manga ID')
      return match?.id
    }
    let hydrated = await find()
    if (hydrated === undefined) {
      await this.engine.response('/api/v1/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(runtimeRegistrationBackup(source, raw, stored.title))
      })
      hydrated = await find()
    }
    if (hydrated === undefined) throw new Error('Runtime could not restore this source manga')
    this.identity.mangas[this.key(id, value.url)] = hydrated
    this.save()
    return hydrated
  }
  override async details(id: number, value: SManga): Promise<SManga> {
    const result = this.convert(
      id,
      await this.engine.json<RemoteManga>(
        '/api/v1/manga/' + (await this.mangaId(id, value)) + '?onlineFetch=true'
      )
    )
    this.save()
    return result
  }
  override async chapters(id: number, value: SManga): Promise<SChapter[]> {
    const mid = await this.mangaId(id, value),
      list = await this.engine.json<RemoteChapter[]>(
        '/api/v1/manga/' + mid + '/chapters?onlineFetch=true'
      )
    const result = list.map((c) => {
      const url = value.url + '/chapter/' + Buffer.from(c.url).toString('base64url')
      this.identity.chapters[this.key(id, url)] = { manga: mid, index: c.index }
      return chapter({ ...c, url, dateUpload: Math.max(0, c.uploadDate || 0) })
    })
    this.save()
    return result
  }
  override async pages(id: number, value: SChapter): Promise<Page[]> {
    this.remote(id)
    let c = this.identity.chapters[this.key(id, value.url)]
    if (!c) {
      const parent = restoredChapterParent(value.url)
      await this.chapters(id, manga({ url: parent, title: '' }))
      c = this.identity.chapters[this.key(id, value.url)]
    }
    if (!c) throw new Error('Refresh manga chapters first')
    const route = '/api/v1/manga/' + c.manga + '/chapter/' + c.index
    const info = await this.engine.json<RemoteChapter>(route)
    if (!info.pageCount || info.pageCount > 2000)
      throw new Error('Chapter has no pages or exceeds the page limit')
    return Array.from({ length: info.pageCount }, (_, index) => ({
      index,
      url: '',
      imageUrl: origin + route + '/page/' + index + '?updateProgress=false'
    }))
  }
  override async filters(_id: number): Promise<Filter[]> {
    this.source(_id)
    return []
  }
  override async request(
    id: number,
    url: string
  ): Promise<{
    bytes: Buffer
    status: number
    statusText: string
    url: string
    headers: Record<string, string>
  }> {
    this.remote(id)
    const u = new URL(url)
    const restoredCover = /^\/api\/mihon\/cover\/([A-Za-z0-9_-]+)$/.exec(u.pathname)
    if (u.origin === origin && restoredCover) {
      const raw = decodeRuntimeKey(restoredCover[1])
      const wrapped = '/__mihon/' + Buffer.from(raw).toString('base64url')
      if (
        !this.appDb.connection
          .prepare('SELECT 1 FROM mangas WHERE source_id = ? AND url = ?')
          .get(id, wrapped)
      )
        throw new Error('Restored manga is not in the local database')
      const mid = await this.mangaId(id, manga({ url: wrapped, title: '' }))
      // Obtain metadata from the installed source, never fetch a backup's arbitrary thumbnail URL.
      await this.engine.json<RemoteManga>('/api/v1/manga/' + mid + '?onlineFetch=true')
      return this.request(id, origin + '/api/v1/manga/' + mid + '/thumbnail')
    }
    if (
      u.origin !== origin ||
      !/^\/api\/v1\/manga\/\d+\/(thumbnail|chapter\/\d+\/page\/\d+)$/.test(u.pathname)
    )
      throw new Error('Invalid runtime image route')
    const mid = Number(u.pathname.split('/')[4])
    if (
      !Object.entries(this.identity.mangas).some(
        ([k, v]) => v === mid && (JSON.parse(k) as [number, string])[0] === id
      )
    )
      throw new Error('Image does not belong to this source')
    const response = await this.engine.response(u.pathname + u.search)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Image exceeds 16 MB')
    return {
      bytes,
      status: response.status,
      statusText: response.statusText,
      url,
      headers: Object.fromEntries(response.headers.entries())
    }
  }
  override dispose(): void {
    this.engine.stop()
  }
}
