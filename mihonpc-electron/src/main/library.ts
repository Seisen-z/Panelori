import type { AppDatabase } from './db'
import type { Manga, Chapter, MangaDetail, ReaderPreferences } from '../shared/ipc'
import type { SManga, SChapter, Page } from '../shared/source'
export function sourceManga(manga: Manga): SManga {
  return {
    url: manga.url,
    title: manga.title,
    status: manga.status,
    author: manga.author ?? undefined,
    artist: manga.artist ?? undefined,
    description: manga.description ?? undefined,
    genre: manga.genre ?? undefined,
    thumbnailUrl: manga.thumbnail_url ?? undefined,
    initialized: true
  }
}
export function sourceChapter(chapter: Chapter): SChapter {
  return {
    url: chapter.url,
    name: chapter.name,
    scanlator: chapter.scanlator ?? undefined,
    dateUpload: chapter.date_upload,
    chapterNumber: chapter.chapter_number
  }
}
export class LibraryRepository {
  constructor(private readonly db: AppDatabase) {}
  upsert(sourceId: number, manga: SManga, favorite = false): number {
    this.db.connection
      .prepare(
        `INSERT INTO mangas(source_id,url,title,author,artist,description,genre,status,thumbnail_url,initialized,favorite,date_added)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source_id,url) DO UPDATE SET title=excluded.title,author=excluded.author,artist=excluded.artist,
      description=excluded.description,genre=excluded.genre,status=excluded.status,thumbnail_url=excluded.thumbnail_url,initialized=excluded.initialized,
      favorite=CASE WHEN excluded.favorite=1 THEN 1 ELSE mangas.favorite END,
      date_added=CASE WHEN excluded.favorite=1 AND mangas.favorite=0 THEN excluded.date_added ELSE mangas.date_added END`
      )
      .run(
        sourceId,
        manga.url,
        manga.title,
        manga.author ?? null,
        manga.artist ?? null,
        manga.description ?? null,
        manga.genre ?? null,
        manga.status,
        manga.thumbnailUrl ?? null,
        manga.initialized ? 1 : 0,
        favorite ? 1 : 0,
        favorite ? Date.now() : null
      )
    return (
      this.db.connection
        .prepare('SELECT id FROM mangas WHERE source_id=? AND url=?')
        .get(sourceId, manga.url) as { id: number }
    ).id
  }
  save(sourceId: number, manga: SManga, chapters: SChapter[]): number {
    return this.db.connection.transaction(() => {
      const id = this.upsert(sourceId, manga)
      const insert = this.db.connection
        .prepare(`INSERT INTO chapters(manga_id,url,name,scanlator,date_upload,chapter_number,source_order,date_fetch) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(manga_id,url) DO UPDATE SET name=excluded.name,scanlator=excluded.scanlator,date_upload=excluded.date_upload,chapter_number=excluded.chapter_number,source_order=excluded.source_order`)
      const old = new Set(this.chapters(id).map((c) => c.url))
      chapters.forEach((chapter, index) =>
        insert.run(
          id,
          chapter.url,
          chapter.name,
          chapter.scanlator ?? null,
          chapter.dateUpload,
          chapter.chapterNumber,
          index,
          Date.now()
        )
      )
      if (this.manga(id).favorite) {
        const insertUpdate = this.db.connection.prepare(
          'INSERT OR IGNORE INTO chapter_updates(chapter_id,discovered) VALUES(?,?)'
        )
        for (const c of this.chapters(id)) if (!old.has(c.url)) insertUpdate.run(c.id, Date.now())
      }
      return id
    })()
  }
  manga(id: number): Manga {
    const manga = this.db.connection.prepare('SELECT * FROM mangas WHERE id=?').get(id) as
      Manga | undefined
    if (!manga) throw new Error('Manga not found')
    return manga
  }
  chapters(id: number): Chapter[] {
    return this.db.connection
      .prepare(
        'SELECT * FROM chapters WHERE manga_id=? ORDER BY chapter_number ASC, source_order DESC, id ASC'
      )
      .all(id) as Chapter[]
  }
  chapter(id: number): Chapter {
    const chapter = this.db.connection.prepare('SELECT * FROM chapters WHERE id=?').get(id) as
      Chapter | undefined
    if (!chapter) throw new Error('Chapter not found')
    return chapter
  }
  detail(id: number): MangaDetail {
    return { manga: this.manga(id), chapters: this.chapters(id) }
  }
  removeFavorite(id: number): void {
    this.db.connection.prepare('UPDATE mangas SET favorite=0 WHERE id=?').run(id)
  }
  pages(id: number): Page[] {
    const rows = this.db.connection
      .prepare('SELECT * FROM chapter_pages WHERE chapter_id=? ORDER BY page_index')
      .all(id) as { page_index: number; url: string; image_url: string; headers_json: string }[]
    return rows.map((row) => ({
      index: row.page_index,
      url: row.url,
      imageUrl: row.image_url,
      headers: JSON.parse(row.headers_json) as Record<string, string>
    }))
  }
  savePages(id: number, pages: Page[]): void {
    this.db.connection.transaction(() => {
      this.db.connection.prepare('DELETE FROM chapter_pages WHERE chapter_id=?').run(id)
      const insert = this.db.connection.prepare(
        'INSERT INTO chapter_pages(chapter_id,page_index,url,image_url,headers_json) VALUES(?,?,?,?,?)'
      )
      pages.forEach((page, index) =>
        insert.run(id, index, page.url, page.imageUrl ?? '', JSON.stringify(page.headers ?? {}))
      )
    })()
  }
  progress(id: number, page: number, elapsed: number): void {
    const count = (
      this.db.connection
        .prepare('SELECT count(*) AS n FROM chapter_pages WHERE chapter_id=?')
        .get(id) as { n: number }
    ).n
    if (page >= count) throw new Error('Page is outside this chapter')
    this.db.connection.transaction(() => {
      this.db.connection
        .prepare(
          'UPDATE chapters SET last_page_read=?,read=CASE WHEN ? THEN 1 ELSE read END WHERE id=?'
        )
        .run(page, page === count - 1 ? 1 : 0, id)
      this.db.connection
        .prepare(
          `INSERT INTO history(chapter_id,last_read,time_read) VALUES(?,?,?)
        ON CONFLICT(chapter_id) DO UPDATE SET last_read=excluded.last_read,time_read=history.time_read+excluded.time_read`
        )
        .run(id, Date.now(), elapsed)
      this.db.connection.prepare('UPDATE chapter_updates SET seen=1 WHERE chapter_id=?').run(id)
    })()
  }
  preferences(id: number): ReaderPreferences {
    return (this.db.connection
      .prepare('SELECT mode,direction,preload,zoom FROM reader_preferences WHERE manga_id=?')
      .get(id) ??
      this.db.connection
        .prepare('SELECT mode,direction,preload,zoom FROM reader_defaults WHERE id=1')
        .get()) as ReaderPreferences
  }
  setPreferences(id: number, prefs: ReaderPreferences, asDefault: boolean): ReaderPreferences {
    this.manga(id)
    this.db.connection.transaction(() => {
      this.db.connection
        .prepare(
          `INSERT INTO reader_preferences(manga_id,mode,direction,preload,zoom) VALUES(?,?,?,?,?)
        ON CONFLICT(manga_id) DO UPDATE SET mode=excluded.mode,direction=excluded.direction,preload=excluded.preload,zoom=excluded.zoom`
        )
        .run(id, prefs.mode, prefs.direction, prefs.preload, prefs.zoom)
      if (asDefault)
        this.db.connection
          .prepare('UPDATE reader_defaults SET mode=?,direction=?,preload=?,zoom=? WHERE id=1')
          .run(prefs.mode, prefs.direction, prefs.preload, prefs.zoom)
    })()
    return prefs
  }
}
