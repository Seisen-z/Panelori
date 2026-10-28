import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
  readdirSync,
  unlinkSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import type { AppDatabase } from './db'
import { preferences } from '../shared/ipc'
import { LibraryRepository } from './library'
import { record, text, integer, manga, chapter } from '../shared/source'
import { settingsPatch } from '../shared/settings'
import { decodeMobileBackup, RUNTIME_ORIGIN } from './mobile-backup'
import { sourceAlias } from '../shared/repositories'
import type { SettingsStore } from './settings'
import type { BackupProgress } from '../shared/release'
function list(v: unknown, max = 10000): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid backup list')
  return v
}
export class BackupService {
  private state: BackupProgress = {
    running: false,
    total: 0,
    done: 0,
    restored: 0,
    errors: [],
    lastBackup: 0
  }
  constructor(
    readonly db: AppDatabase,
    readonly settings: SettingsStore,
    private readonly dataDirectory: string,
    private readonly importSourceId?: (remoteId: string) => number
  ) {
    const row = db.connection.prepare("SELECT value FROM app_meta WHERE key='lastBackup'").get() as
      { value: string } | undefined
    this.state.lastBackup = Number(row?.value ?? 0)
  }
  status(): BackupProgress {
    return { ...this.state, errors: [...this.state.errors] }
  }
  export(path: string): string {
    const library = new LibraryRepository(this.db)
    const payload = this.db.connection.transaction(() => ({
      format: 'mihonpc',
      version: 1,
      created: Date.now(),
      settings: this.settings.get(),
      manga: (
        this.db.connection
          .prepare(
            'SELECT m.* FROM mangas m WHERE m.favorite=1 OR EXISTS(SELECT 1 FROM chapters c JOIN history h ON h.chapter_id=c.id WHERE c.manga_id=m.id) ORDER BY m.title,m.id'
          )
          .all() as ReturnType<AppDatabase['getFavorites']>
      ).map((m) => ({
        sourceId: m.source_id,
        favorite: m.favorite,
        dateAdded: m.date_added ?? 0,
        ...this.sourceMetadata(m.source_id),
        manga: {
          url: m.url,
          title: m.title,
          status: m.status,
          author: m.author ?? undefined,
          artist: m.artist ?? undefined,
          description: m.description ?? undefined,
          genre: m.genre ?? undefined,
          thumbnailUrl: m.thumbnail_url ?? undefined,
          initialized: true
        },
        categories: (
          this.db.connection
            .prepare(
              'SELECT c.name FROM categories c JOIN manga_categories mc ON mc.category_id=c.id WHERE mc.manga_id=?'
            )
            .all(m.id) as { name: string }[]
        ).map((c) => c.name),
        chapters: library.chapters(m.id).map((c) => ({
          chapter: {
            url: c.url,
            name: c.name,
            chapterNumber: c.chapter_number,
            dateUpload: c.date_upload,
            scanlator: c.scanlator ?? undefined
          },
          read: c.read,
          bookmark: c.bookmark,
          page: c.last_page_read,
          dateFetch: c.date_fetch,
          sourceOrder: c.source_order,
          history:
            this.db.connection
              .prepare('SELECT last_read,time_read FROM history WHERE chapter_id=?')
              .get(c.id) ?? null
        })),
        preferences: library.preferences(m.id)
      })),
      categories: (
        this.db.connection.prepare('SELECT name FROM categories ORDER BY sort,id').all() as {
          name: string
        }[]
      ).map((c) => c.name)
    }))()
    const bytes = JSON.stringify(payload)
    if (Buffer.byteLength(bytes) > 64 * 1024 * 1024) throw new Error('Backup exceeds 64 MiB')
    mkdirSync(dirname(path), { recursive: true })
    const temp = path + '.' + randomUUID() + '.tmp'
    writeFileSync(temp, bytes, 'utf8')
    renameSync(temp, path)
    this.state.lastBackup = Date.now()
    this.db.connection
      .prepare(
        "INSERT INTO app_meta(key,value) VALUES('lastBackup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      )
      .run(String(this.state.lastBackup))
    return path
  }
  async import(path: string, includeSettings: boolean): Promise<BackupProgress> {
    if (this.state.running) throw new Error('An import is already running')
    if (statSync(path).size > 64 * 1024 * 1024) throw new Error('Backup exceeds 64 MiB')
    const bytes = readFileSync(path)
    const json = bytes
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trimStart()
    const data = json.startsWith('{') ? record(JSON.parse(json)) : decodeMobileBackup(bytes)
    if (data.format !== 'mihonpc' || data.version !== 1)
      throw new Error('Unsupported backup format/version')
    const entries = list(data.manga, 10000),
      categories = list(data.categories, 1000).map((v) => text(v, 200)),
      patch = includeSettings && !data.mobile ? settingsPatch(data.settings) : null
    this.state = {
      ...this.state,
      running: true,
      total: entries.length,
      done: 0,
      restored: 0,
      errors: [],
      format: data.mobile ? 'mihon' : 'mihonpc',
      warnings: Array.isArray(data.warnings) ? data.warnings.map((v) => text(v, 1000)) : [],
      summary: { manga: 0, favorites: 0, chapters: 0, history: 0, categories: categories.length }
    }
    const library = new LibraryRepository(this.db)
    const category = (name: string): number => {
      if (!name.trim()) throw new Error('Empty category')
      this.db.connection.prepare('INSERT OR IGNORE INTO categories(name) VALUES(?)').run(name)
      return (
        this.db.connection.prepare('SELECT id FROM categories WHERE name=?').get(name) as {
          id: number
        }
      ).id
    }
    try {
      this.db.connection.transaction(() => categories.forEach(category))()
      for (const [index, entry] of entries.entries()) {
        try {
          this.db.connection.transaction(() => {
            const item = record(entry),
              value = manga(item.manga),
              sourceId = integer(item.sourceId, 1),
              favorite = item.favorite === undefined ? 1 : integer(item.favorite, 0, 1),
              chapters = list(item.chapters),
              names = list(item.categories, 1000).map((v) => text(v, 200))
            if (item.remoteSourceId !== undefined) {
              const remote = text(item.remoteSourceId, 30),
                alias = sourceAlias(remote)
              if (alias !== sourceId)
                throw new Error('Backup source alias does not match its Long ID')
              const prior = this.sourceMetadata(sourceId)
              if (prior.remoteSourceId && prior.remoteSourceId !== remote)
                throw new Error('Source identity collision')
              if (this.importSourceId && this.importSourceId(remote) !== sourceId)
                throw new Error('Runtime source alias mismatch')
              this.db.connection
                .prepare(
                  'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
                )
                .run(
                  'mobile-source:' + sourceId,
                  JSON.stringify({
                    remoteSourceId: remote,
                    sourceName: text(item.sourceName ?? remote, 500)
                  })
                )
            }
            // Engine numeric IDs are profile-local. Export/restore uses the stable source+key cover route.
            const runtimeKey = /^\/__mihon\/([A-Za-z0-9_-]+)$/.exec(value.url)
            if (runtimeKey && value.thumbnailUrl?.startsWith(RUNTIME_ORIGIN + '/'))
              value.thumbnailUrl = RUNTIME_ORIGIN + '/api/mihon/cover/' + runtimeKey[1]
            const priorManga = this.db.connection
              .prepare('SELECT id FROM mangas WHERE source_id=? AND url=?')
              .get(sourceId, value.url) as { id: number } | undefined
            const priorChapterUrls = new Set(
              priorManga ? library.chapters(priorManga.id).map((c) => c.url) : []
            )
            const parsed = chapters.map((v) => {
              const r = record(v)
              return { r, c: chapter(r.chapter) }
            })
            const id = library.save(
              sourceId,
              value,
              parsed.map((v) => v.c)
            )
            library.upsert(sourceId, value, favorite === 1)
            if (item.dateAdded !== undefined) {
              const added = integer(item.dateAdded, 0)
              if (added)
                this.db.connection
                  .prepare(
                    'UPDATE mangas SET date_added=CASE WHEN date_added IS NULL OR date_added=0 THEN ? ELSE min(date_added,?) END WHERE id=?'
                  )
                  .run(added, added, id)
            }
            if (item.originalThumbnail)
              this.db.connection
                .prepare(
                  'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
                )
                .run(
                  'mobile-cover:' + id,
                  JSON.stringify({ originalThumbnail: text(item.originalThumbnail, 8192) })
                )
            for (const name of names)
              this.db.connection
                .prepare('INSERT OR IGNORE INTO manga_categories(manga_id,category_id) VALUES(?,?)')
                .run(id, category(name))
            const saved = new Map(library.chapters(id).map((c) => [c.url, c]))
            for (const { r, c } of parsed) {
              const stored = saved.get(c.url)!
              const read = integer(r.read, 0, 1),
                bookmark = integer(r.bookmark, 0, 1),
                page = integer(r.page, 0, 2147483647)
              this.db.connection
                .prepare(
                  'UPDATE chapters SET read=max(read,?),bookmark=max(bookmark,?),last_page_read=max(last_page_read,?) WHERE id=?'
                )
                .run(read, bookmark, page, stored.id)
              if (r.dateFetch !== undefined)
                this.db.connection
                  .prepare(
                    priorChapterUrls.has(c.url)
                      ? 'UPDATE chapters SET date_fetch=max(date_fetch,?) WHERE id=?'
                      : 'UPDATE chapters SET date_fetch=? WHERE id=?'
                  )
                  .run(integer(r.dateFetch, 0), stored.id)
              if (r.sourceOrder !== undefined) {
                if (!Number.isSafeInteger(r.sourceOrder)) throw new Error('Invalid source order')
                this.db.connection
                  .prepare('UPDATE chapters SET source_order=? WHERE id=?')
                  .run(r.sourceOrder, stored.id)
              }
              if (r.history !== null) {
                const h = record(r.history)
                this.db.connection
                  .prepare(
                    'INSERT INTO history(chapter_id,last_read,time_read) VALUES(?,?,?) ON CONFLICT(chapter_id) DO UPDATE SET last_read=max(history.last_read,excluded.last_read),time_read=max(history.time_read,excluded.time_read)'
                  )
                  .run(stored.id, integer(h.last_read, 0), integer(h.time_read, 0))
              }
            }
            if (item.preferences) library.setPreferences(id, preferences(item.preferences), false)
            const summary = this.state.summary!
            summary.manga++
            summary.favorites += favorite
            summary.chapters += parsed.length
            summary.history += parsed.filter((v) => v.r.history !== null).length
          })()
          this.state.restored++
        } catch (error) {
          this.state.errors.push('Entry ' + (index + 1) + ': ' + String(error))
        }
        this.state.done++
        await setImmediate()
      }
      if (patch) this.settings.save({ ...patch, defaultCategory: 0 })
    } finally {
      this.state.running = false
    }
    return this.status()
  }
  private sourceMetadata(sourceId: number): { remoteSourceId?: string; sourceName?: string } {
    const row = this.db.connection
      .prepare('SELECT value FROM app_meta WHERE key=?')
      .get('mobile-source:' + sourceId) as { value: string } | undefined
    return row ? (JSON.parse(row.value) as { remoteSourceId: string; sourceName: string }) : {}
  }
  tick(now = Date.now()): void {
    const p = this.settings.get()
    if (
      !p.backupHours ||
      this.state.running ||
      now - this.state.lastBackup < p.backupHours * 3600000
    )
      return
    const dir = p.backupLocation || join(this.dataDirectory, 'backups')
    this.export(join(dir, 'mihonpc-auto-' + now + '-' + randomUUID() + '.mihonbk'))
    const files = readdirSync(dir)
      .filter((n) => /^mihonpc-auto-\d+-[a-f0-9-]+\.mihonbk$/.test(n))
      .map((n) => ({ n, time: statSync(join(dir, n)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    for (const f of files.slice(p.maxBackups)) unlinkSync(join(dir, f.n))
  }
}
