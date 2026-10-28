import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  statSync,
  lstatSync
} from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { ExtensionHost } from './host'
import { HttpBroker } from './network'
import {
  chapter,
  manga,
  page,
  filters,
  record,
  httpUrl,
  type ExtensionInfo,
  type MangasPage,
  type SManga,
  type SChapter,
  type Page,
  type Filter,
  type SourceInfo,
  type SourceMethod
} from '../../shared/source'
import type { AppDatabase } from '../db'
import {
  sourceAlias,
  type ExtensionRepository,
  type RepositoryExtension
} from '../../shared/repositories'

export class ExtensionManager {
  private hosts = new Map<number, ExtensionHost>()
  private list: ExtensionInfo[] = []
  private serial: Promise<unknown> = Promise.resolve()
  constructor(
    readonly directory: string,
    private readonly preload: string,
    private readonly db: AppDatabase,
    private readonly testLocal = false
  ) {
    mkdirSync(directory, { recursive: true })
  }
  importSourceId(remoteId: string): number {
    return sourceAlias(remoteId)
  }
  async repositories(): Promise<ExtensionRepository[]> {
    return []
  }
  async available(): Promise<RepositoryExtension[]> {
    return []
  }
  async addRepository(_url: string): Promise<ExtensionRepository[]> {
    void _url
    throw new Error('Repository runtime not active in fixture mode')
  }
  async removeRepository(_url: string): Promise<ExtensionRepository[]> {
    void _url
    throw new Error('Repository runtime not active in fixture mode')
  }
  async installPackage(_pkg: string): Promise<ExtensionInfo[]> {
    void _pkg
    throw new Error('Repository runtime not active in fixture mode')
  }
  async extensionIcon(id: string): Promise<string | null> {
    void id
    return null
  }
  async repositoryIcon(url: string): Promise<string | null> {
    void url
    return null
  }
  all(): ExtensionInfo[] {
    return this.list
  }
  sources(): SourceInfo[] {
    return this.list.filter((e) => e.enabled && !e.error).flatMap((e) => e.sources)
  }
  source(id: number): SourceInfo {
    const source = this.sources().find((s) => s.id === id)
    if (!source) throw new Error('Source is unavailable. Enable or reinstall its extension.')
    return source
  }
  private host(id: number): ExtensionHost {
    this.source(id)
    const host = this.hosts.get(id)
    if (!host) throw new Error('Extension is stopped')
    return host
  }
  async reload(): Promise<ExtensionInfo[]> {
    return this.exclusive(() => this.reloadNow())
  }
  private async reloadNow(): Promise<ExtensionInfo[]> {
    this.dispose()
    this.list = []
    for (const filename of readdirSync(this.directory)
      .filter((f) => f.endsWith('.js'))
      .sort()) {
      const stored = this.db.connection
        .prepare('SELECT enabled, metadata_json FROM extensions WHERE filename=?')
        .get(filename) as { enabled: number; metadata_json: string } | undefined
      if (stored?.enabled === 0 && stored.metadata_json !== '{}') {
        this.list.push({
          ...(JSON.parse(stored.metadata_json) as ExtensionInfo),
          enabled: false,
          filename
        })
        continue
      }
      const host = new ExtensionHost(this.preload, this.testLocal)
      try {
        const full = join(this.directory, filename)
        if (
          lstatSync(full).isSymbolicLink() ||
          !statSync(full).isFile() ||
          statSync(full).size > 2 * 1024 * 1024
        )
          throw new Error('Extension must be a regular JavaScript file of at most 2 MB')
        const code = readFileSync(full, 'utf8')
        if (Buffer.byteLength(code) > 2 * 1024 * 1024) throw new Error('Extension exceeds 2 MB')
        const loaded = await host.load(code)
        if (this.list.some((e) => e.id === loaded.meta.id))
          throw new Error('Duplicate extension id')
        const row = this.db.connection
          .prepare('SELECT enabled FROM extensions WHERE id=?')
          .get(loaded.meta.id) as { enabled: number } | undefined
        const enabled = row?.enabled !== 0
        if (loaded.sources.some((s) => this.hosts.has(s.id))) throw new Error('Duplicate source id')
        const entry: ExtensionInfo = { ...loaded.meta, enabled, filename, sources: loaded.sources }
        this.persist(entry)
        this.list.push(entry)
        if (enabled) for (const source of loaded.sources) this.hosts.set(source.id, host)
        else host.dispose()
      } catch (error) {
        host.dispose()
        this.list.push({
          id: 'invalid-' + createHash('sha256').update(filename).digest('hex').slice(0, 12),
          name: filename,
          lang: '',
          version: '',
          nsfw: false,
          enabled: false,
          filename,
          sources: [],
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return this.list
  }
  async installFile(path: string): Promise<ExtensionInfo[]> {
    return this.exclusive(async () => {
      if (!statSync(path).isFile() || statSync(path).size > 2 * 1024 * 1024)
        throw new Error('Extension exceeds 2 MB or is not a regular file')
      const code = readFileSync(path, 'utf8')
      if (Buffer.byteLength(code) > 2 * 1024 * 1024) throw new Error('Extension exceeds 2 MB')
      const probe = new ExtensionHost(this.preload, this.testLocal)
      try {
        const { meta, sources } = await probe.load(code)
        if (
          sources.some((s) =>
            this.sources().some((current) => current.id === s.id && current.extensionId !== meta.id)
          )
        )
          throw new Error('Source id collides with another extension')
        const existing = this.list.find((e) => e.id === meta.id)
        const filename = meta.id + '.js'
        const temporary = join(this.directory, filename + '.tmp')
        writeFileSync(temporary, code)
        renameSync(temporary, join(this.directory, filename))
        if (existing && existing.filename !== filename)
          unlinkSync(join(this.directory, existing.filename))
        this.persist({ ...meta, sources, filename, enabled: existing?.enabled ?? true })
      } finally {
        probe.dispose()
      }
      return this.reloadNow()
    })
  }
  async installUrl(url: string): Promise<ExtensionInfo[]> {
    const result = await new HttpBroker(this.testLocal).request(url, {}, undefined, 2 * 1024 * 1024)
    if (result.status < 200 || result.status >= 300)
      throw new Error('Extension download failed: HTTP ' + result.status)
    const temp = join(this.directory, 'download-' + Date.now() + '.tmp')
    writeFileSync(temp, result.bytes)
    try {
      return await this.installFile(temp)
    } finally {
      try {
        unlinkSync(temp)
      } catch {
        /* already removed */
      }
    }
  }
  async setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo[]> {
    return this.exclusive(async () => {
      if (!this.list.some((e) => e.id === id && !e.error)) throw new Error('Extension not found')
      this.db.connection
        .prepare('UPDATE extensions SET enabled=? WHERE id=?')
        .run(enabled ? 1 : 0, id)
      return this.reloadNow()
    })
  }
  async uninstall(id: string): Promise<ExtensionInfo[]> {
    return this.exclusive(async () => {
      const entry = this.list.find((e) => e.id === id)
      if (!entry || basename(entry.filename) !== entry.filename)
        throw new Error('Extension not found')
      unlinkSync(join(this.directory, entry.filename))
      this.db.connection.prepare('DELETE FROM extensions WHERE id=?').run(id)
      return this.reloadNow()
    })
  }
  async catalogue(
    id: number,
    method: 'getPopularManga' | 'getLatestUpdates' | 'searchManga',
    args: unknown[]
  ): Promise<MangasPage> {
    if (method === 'getLatestUpdates' && !this.source(id).supportsLatest)
      throw new Error('Source does not support latest updates')
    const result = record(await this.call(id, method, args))
    if (
      !Array.isArray(result.mangas) ||
      result.mangas.length > 200 ||
      typeof result.hasNextPage !== 'boolean'
    )
      throw new Error('Invalid catalogue result')
    return { mangas: result.mangas.map(manga), hasNextPage: result.hasNextPage }
  }
  async details(id: number, value: SManga): Promise<SManga> {
    return manga(await this.call(id, 'getMangaDetails', [value]))
  }
  async chapters(id: number, value: SManga): Promise<SChapter[]> {
    const result = await this.call(id, 'getChapterList', [value])
    if (!Array.isArray(result) || result.length > 30000) throw new Error('Invalid chapter list')
    return result.map(chapter)
  }
  async pages(id: number, value: SChapter): Promise<Page[]> {
    const result = await this.call(id, 'getPageList', [value])
    if (!Array.isArray(result) || !result.length || result.length > 2000)
      throw new Error('Chapter has no pages or exceeds the page limit')
    const output = result.map(page)
    for (const item of output) {
      if (!item.imageUrl) item.imageUrl = httpUrl(await this.call(id, 'getImageUrl', [item]))
      item.headers = {
        Referer: this.source(id).baseUrl,
        ...this.host(id).sourceHeaders.get(id),
        ...item.headers
      }
    }
    return output
  }
  async filters(id: number): Promise<Filter[]> {
    return filters(await this.call(id, 'getFilters', []))
  }
  async request(
    id: number,
    url: string,
    requestHeaders?: Record<string, string>
  ): Promise<Awaited<ReturnType<ExtensionHost['request']>>> {
    const source = this.source(id)
    return this.host(id).request(
      url,
      {
        headers: {
          Referer: source.baseUrl,
          ...this.host(id).sourceHeaders.get(id),
          ...requestHeaders
        }
      },
      16 * 1024 * 1024
    )
  }
  private persist(entry: ExtensionInfo): void {
    this.db.connection
      .prepare(
        `INSERT INTO extensions(id,enabled,nsfw,version,filename,metadata_json) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET nsfw=excluded.nsfw,version=excluded.version,filename=excluded.filename,metadata_json=excluded.metadata_json`
      )
      .run(
        entry.id,
        entry.enabled ? 1 : 0,
        entry.nsfw ? 1 : 0,
        entry.version,
        entry.filename,
        JSON.stringify(entry)
      )
  }
  private async call(id: number, method: SourceMethod, args: unknown[]): Promise<unknown> {
    const host = this.host(id)
    try {
      return await host.call(id, method, args)
    } catch (error) {
      if (host.stopped) {
        const entry = this.list.find((entry) => entry.sources.some((source) => source.id === id))
        if (entry) entry.error = 'Extension stopped. Reload it to try again.'
        for (const [source, value] of this.hosts) if (value === host) this.hosts.delete(source)
      }
      throw error
    }
  }
  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.serial.then(run, run)
    this.serial = result.catch(() => {})
    return result
  }
  dispose(): void {
    for (const host of new Set(this.hosts.values())) host.dispose()
    this.hosts.clear()
  }
}
