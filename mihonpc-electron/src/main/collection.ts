import type { AppDatabase } from './db'
import type { ReadingServices } from './services'
import type { SettingsStore } from './settings'
import type { Category, LibraryItem, UpdateEntry, UpdateStatus, HistoryEntry } from '../shared/ipc'
export class CollectionService {
  private inFlight: Promise<UpdateStatus> | null = null
  private state: UpdateStatus = {
    running: false,
    total: 0,
    done: 0,
    added: 0,
    current: '',
    errors: [],
    lastCheck: 0
  }
  private downloads = new Map<number, Promise<number>>()
  constructor(
    readonly db: AppDatabase,
    readonly services?: ReadingServices,
    readonly settings?: SettingsStore
  ) {}
  library(): LibraryItem[] {
    const rows = this.db.connection
      .prepare(
        `SELECT m.*, (SELECT count(*) FROM chapters c WHERE c.manga_id=m.id AND c.read=0) unread,
    (SELECT max(h.last_read) FROM history h JOIN chapters c ON c.id=h.chapter_id WHERE c.manga_id=m.id) last_read,
    (SELECT max(date_fetch) FROM chapters c WHERE c.manga_id=m.id) last_updated,
    (SELECT count(*) FROM cached_chapters d JOIN chapters c ON c.id=d.chapter_id WHERE c.manga_id=m.id) downloaded
    FROM mangas m WHERE favorite=1`
      )
      .all() as LibraryItem[]
    for (const row of rows)
      row.categories = (
        this.db.connection
          .prepare('SELECT category_id FROM manga_categories WHERE manga_id=?')
          .all(row.id) as { category_id: number }[]
      ).map((v) => v.category_id)
    return rows
  }
  categories(): Category[] {
    return this.db.connection
      .prepare('SELECT id,name,sort FROM categories ORDER BY sort,id')
      .all() as Category[]
  }
  category(id: number, name: string): Category[] {
    name = name.trim()
    if (!name) throw new Error('Category needs a name')
    if (id === 0)
      this.db.connection
        .prepare(
          'INSERT INTO categories(name,sort) VALUES(?,(SELECT coalesce(max(sort),0)+1 FROM categories))'
        )
        .run(name)
    else this.db.connection.prepare('UPDATE categories SET name=? WHERE id=?').run(name, id)
    return this.categories()
  }
  deleteCategory(id: number): void {
    this.db.connection.prepare('DELETE FROM categories WHERE id=?').run(id)
    if (this.settings?.get().defaultCategory === id) this.settings.save({ defaultCategory: 0 })
  }
  assign(ids: number[], categories: number[]): void {
    this.db.connection.transaction(() => {
      for (const id of ids) {
        this.db.connection.prepare('DELETE FROM manga_categories WHERE manga_id=?').run(id)
        for (const c of categories)
          this.db.connection.prepare('INSERT INTO manga_categories VALUES(?,?)').run(id, c)
      }
    })()
  }
  bulk(ids: number[], action: string): void {
    this.db.connection.transaction(() => {
      for (const id of ids) {
        if (action === 'remove')
          this.db.connection.prepare('UPDATE mangas SET favorite=0 WHERE id=?').run(id)
        else
          this.db.connection
            .prepare(
              'UPDATE chapters SET read=?,last_page_read=CASE WHEN ?=0 THEN 0 ELSE last_page_read END WHERE manga_id=?'
            )
            .run(action === 'read' ? 1 : 0, action === 'read' ? 1 : 0, id)
        if (action === 'read')
          this.db.connection
            .prepare(
              'UPDATE chapter_updates SET seen=1 WHERE chapter_id IN (SELECT id FROM chapters WHERE manga_id=?)'
            )
            .run(id)
      }
    })()
  }
  history(query: string, limit: number, offset: number): HistoryEntry[] {
    return this.db.connection
      .prepare(
        `SELECT h.chapter_id,m.id manga_id,m.source_id,m.title,m.thumbnail_url,c.name,h.last_read,c.last_page_read FROM history h JOIN chapters c ON c.id=h.chapter_id JOIN mangas m ON m.id=c.manga_id WHERE instr(lower(m.title),lower(?))>0 ORDER BY h.last_read DESC,h.id DESC LIMIT ? OFFSET ?`
      )
      .all(query, limit, offset) as HistoryEntry[]
  }
  deleteHistory(id: number): void {
    if (id === 0) this.db.connection.prepare('DELETE FROM history').run()
    else this.db.connection.prepare('DELETE FROM history WHERE chapter_id=?').run(id)
  }
  updates(): UpdateEntry[] {
    return this.db.connection
      .prepare(
        `SELECT c.*,m.title,m.source_id,m.thumbnail_url,u.discovered,u.seen,EXISTS(SELECT 1 FROM cached_chapters d WHERE d.chapter_id=c.id) downloaded FROM chapter_updates u JOIN chapters c ON c.id=u.chapter_id JOIN mangas m ON m.id=c.manga_id WHERE m.favorite=1 ORDER BY u.discovered DESC,c.id DESC LIMIT 2000`
      )
      .all() as UpdateEntry[]
  }
  mark(id: number, read: boolean): void {
    this.db.connection.transaction(() => {
      this.db.connection.prepare('UPDATE chapters SET read=? WHERE id=?').run(read ? 1 : 0, id)
      this.db.connection.prepare('UPDATE chapter_updates SET seen=1 WHERE chapter_id=?').run(id)
    })()
  }
  status(): UpdateStatus {
    return { ...this.state, errors: [...this.state.errors] }
  }
  check(): Promise<UpdateStatus> {
    if (this.inFlight) return this.inFlight
    if (!this.services) throw new Error('Reading services unavailable')
    const services = this.services,
      favorites = this.db.getFavorites()
    this.state = {
      running: true,
      total: favorites.length,
      done: 0,
      added: 0,
      current: '',
      errors: [],
      lastCheck: this.state.lastCheck
    }
    this.inFlight = Promise.resolve().then(async () => {
      try {
        for (const manga of favorites) {
          this.state.current = manga.title + ' (source ' + manga.source_id + ')'
          try {
            const old = new Set(services.library.chapters(manga.id).map((c) => c.id))
            await services.refresh(manga.id)
            this.db.connection.transaction(() => {
              for (const c of services.library.chapters(manga.id))
                if (!old.has(c.id)) {
                  this.db.connection
                    .prepare(
                      'INSERT OR IGNORE INTO chapter_updates(chapter_id,discovered) VALUES(?,?)'
                    )
                    .run(c.id, Date.now())
                  this.state.added++
                }
            })()
          } catch (e) {
            this.state.errors.push(manga.title + ': ' + String(e))
          }
          this.state.done++
        }
      } finally {
        this.state.running = false
        this.state.current = ''
        this.state.lastCheck = Date.now()
        this.inFlight = null
      }
      return this.status()
    })
    return this.inFlight
  }
  download(id: number): Promise<number> {
    const old = this.downloads.get(id)
    if (old) return old
    if (!this.services) throw new Error('Reading services unavailable')
    const services = this.services
    const task = (async () => {
      const session = await services.reader(id, false)
      if (!session.pages.length) throw new Error('Chapter has no pages')
      for (let i = 0; i < session.pages.length; i++) await services.page(id, i)
      this.db.connection
        .prepare(
          'INSERT INTO cached_chapters(chapter_id,completed) VALUES(?,?) ON CONFLICT(chapter_id) DO UPDATE SET completed=excluded.completed'
        )
        .run(id, Date.now())
      return session.pages.length
    })()
    this.downloads.set(id, task)
    void task.finally(() => this.downloads.delete(id)).catch(() => {})
    return task
  }
}
