import Sqlite from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppStatus, HistoryEntry, Manga } from '../shared/ipc'

export function migrate(db: Sqlite.Database, directory: string): void {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  if (files.length === 0) throw new Error('No database migrations found')
  files.forEach((file, index) => {
    if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(file) || Number(file.slice(0, 3)) !== index + 1) {
      throw new Error('Migration sequence is invalid: ' + file)
    }
  })
  const current = Number(db.pragma('user_version', { simple: true }))
  if (current > files.length) throw new Error('Database schema is newer than this app')
  db.transaction(() => {
    for (let index = current; index < files.length; index++) {
      db.exec(readFileSync(join(directory, files[index]), 'utf8'))
      db.pragma('user_version = ' + (index + 1))
    }
  })()
}

export class AppDatabase {
  readonly connection: Sqlite.Database
  constructor(
    readonly path: string,
    migrations: string
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.connection = new Sqlite(path)
    try {
      this.connection.pragma('foreign_keys = ON')
      this.connection.pragma('journal_mode = WAL')
      this.connection.pragma('busy_timeout = 5000')
      migrate(this.connection, migrations)
    } catch (error) {
      this.connection.close()
      throw error
    }
  }
  getFavorites(): Manga[] {
    return this.connection
      .prepare('SELECT * FROM mangas WHERE favorite = 1 ORDER BY title COLLATE NOCASE, id')
      .all() as Manga[]
  }
  getHistory(limit: number, offset: number): HistoryEntry[] {
    return this.connection
      .prepare(
        `SELECT h.chapter_id, m.id AS manga_id, m.source_id, m.title, m.thumbnail_url, c.name, h.last_read, c.last_page_read
      FROM history h JOIN chapters c ON c.id = h.chapter_id JOIN mangas m ON m.id = c.manga_id
      ORDER BY h.last_read DESC, h.id DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as HistoryEntry[]
  }
  status(version: string): AppStatus {
    const count = (table: 'mangas' | 'chapters' | 'extensions'): number => {
      const row = this.connection.prepare('SELECT count(*) AS total FROM ' + table).get() as {
        total: number
      }
      return row.total
    }
    return {
      version,
      databasePath: this.path,
      schemaVersion: Number(this.connection.pragma('user_version', { simple: true })),
      integrity: String(this.connection.pragma('quick_check', { simple: true })),
      mangaCount: count('mangas'),
      chapterCount: count('chapters'),
      extensionCount: count('extensions')
    }
  }
  close(): void {
    if (this.connection.open) this.connection.close()
  }
}
