import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  existsSync,
  lstatSync,
  realpathSync,
  readdirSync,
  unlinkSync,
  rmdirSync
} from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import type { AppDatabase } from './db'
import type { ReadingServices } from './services'
import type { SettingsStore } from './settings'
import type { DownloadJob, DownloadStatus } from '../shared/release'
import { imageMime } from './images'
export class DownloadQueue {
  private workers = new Map<number, Promise<void>>()
  private stopped = false
  private waiting = ''
  constructor(
    readonly db: AppDatabase,
    readonly services: ReadingServices,
    readonly settings: SettingsStore,
    private readonly dataDirectory: string,
    private readonly canDownload: () => Promise<boolean> = async () => true
  ) {
    db.connection
      .prepare(
        "UPDATE download_jobs SET state='queued',error='Resuming after restart' WHERE state='downloading'"
      )
      .run()
  }
  list(): DownloadStatus {
    return {
      waiting: this.waiting,
      jobs: this.db.connection
        .prepare(
          'SELECT d.*,m.title,c.name FROM download_jobs d JOIN chapters c ON c.id=d.chapter_id JOIN mangas m ON m.id=c.manga_id ORDER BY d.updated DESC,d.chapter_id'
        )
        .all() as DownloadJob[]
    }
  }
  private job(id: number): DownloadJob | undefined {
    return this.list().jobs.find((j) => j.chapter_id === id)
  }
  enqueue(ids: number[]): DownloadStatus {
    this.db.connection.transaction(() => {
      for (const id of new Set(ids)) {
        this.services.library.chapter(id)
        const old = this.job(id)
        if (old?.state === 'completed' || old?.state === 'downloading') continue
        const root =
          old?.storage ||
          join(this.settings.get().downloadLocation || this.dataDirectory, 'MihonPC-downloads')
        this.db.connection
          .prepare(
            "INSERT INTO download_jobs(chapter_id,state,storage,updated) VALUES(?,'queued',?,?) ON CONFLICT(chapter_id) DO UPDATE SET state='queued',error='',updated=excluded.updated"
          )
          .run(id, resolve(root), Date.now())
      }
    })()
    return this.list()
  }
  action(id: number, action: 'pause' | 'resume' | 'cancel' | 'delete'): DownloadStatus {
    const job = this.job(id)
    if (!job) throw new Error('Download not found')
    if (action === 'delete') {
      if (this.workers.has(id))
        throw new Error('Pause or cancel and wait for the current page before deleting')
      const folder = this.folder(job.storage, id)
      if (existsSync(folder)) {
        for (const name of readdirSync(folder))
          if (/^\d+\.img(?:\.[a-f0-9-]+\.tmp)?$/.test(name)) unlinkSync(join(folder, name))
        if (!readdirSync(folder).length) rmdirSync(folder)
      }
      this.db.connection.prepare('DELETE FROM cached_chapters WHERE chapter_id=?').run(id)
      this.db.connection.prepare('DELETE FROM download_jobs WHERE chapter_id=?').run(id)
    } else {
      if (job.state === 'completed') return this.list()
      this.db.connection
        .prepare("UPDATE download_jobs SET state=?,error='',updated=? WHERE chapter_id=?")
        .run(
          action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : 'queued',
          Date.now(),
          id
        )
    }
    return this.list()
  }
  all(action: 'pause' | 'resume'): DownloadStatus {
    for (const j of this.list().jobs)
      if (
        action === 'pause'
          ? ['queued', 'downloading'].includes(j.state)
          : ['paused', 'error'].includes(j.state)
      )
        this.action(j.chapter_id, action)
    return this.list()
  }
  private folder(root: string, id: number): string {
    const base = resolve(root),
      folder = resolve(base, String(id))
    if (!Number.isSafeInteger(id) || id < 1 || relative(base, folder) !== String(id))
      throw new Error('Invalid download path')
    for (const path of [base, folder])
      if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw new Error('Download directory is a symbolic link')
    if (existsSync(folder)) {
      const rel = relative(realpathSync(base), realpathSync(folder))
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Download path escaped storage')
    }
    return folder
  }
  offlinePage(id: number, index: number): string | null {
    const job = this.job(id)
    if (job?.state !== 'completed') return null
    const path = join(this.folder(job.storage, id), index + '.img')
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error('Invalid image link')
      const bytes = readFileSync(path)
      return 'data:' + imageMime(bytes) + ';base64,' + bytes.toString('base64')
    } catch {
      return null
    }
  }
  async tick(): Promise<void> {
    if (this.stopped) return
    if (this.settings.get().offlineOnly) {
      this.waiting = 'Offline mode'
      return
    }
    if (this.settings.get().wifiOnly && !(await this.canDownload())) {
      this.waiting = 'Waiting for Wi-Fi'
      return
    }
    this.waiting = ''
    const slots = this.settings.get().concurrentDownloads - this.workers.size
    for (const job of this.list()
      .jobs.filter((j) => j.state === 'queued' && !this.workers.has(j.chapter_id))
      .reverse()
      .slice(0, Math.max(0, slots))) {
      const task = this.work(job)
      this.workers.set(job.chapter_id, task)
      void task.finally(() => this.workers.delete(job.chapter_id)).catch(() => {})
    }
  }
  private async work(job: DownloadJob): Promise<void> {
    const id = job.chapter_id
    this.db.connection
      .prepare("UPDATE download_jobs SET state='downloading',error='' WHERE chapter_id=?")
      .run(id)
    try {
      const session = await this.services.reader(id, false)
      if (!session.pages.length) throw new Error('Chapter has no pages')
      const folder = this.folder(job.storage, id)
      mkdirSync(folder, { recursive: true })
      this.folder(job.storage, id)
      this.db.connection
        .prepare('UPDATE download_jobs SET total=? WHERE chapter_id=?')
        .run(session.pages.length, id)
      for (let i = 0; i < session.pages.length; i++) {
        if (this.stopped || this.job(id)?.state !== 'downloading') return
        if (
          this.settings.get().offlineOnly ||
          (this.settings.get().wifiOnly && !(await this.canDownload()))
        ) {
          this.db.connection
            .prepare("UPDATE download_jobs SET state='queued' WHERE chapter_id=?")
            .run(id)
          return
        }
        const image = session.pages[i]
        if (!image.imageUrl) throw new Error('Page has no image URL')
        const path = join(folder, i + '.img')
        let bytes: Buffer | undefined
        try {
          if (lstatSync(path).isSymbolicLink()) throw new Error('Image is a link')
          bytes = readFileSync(path)
          imageMime(bytes)
        } catch {
          bytes = await this.services.images.bytes(
            session.manga.source_id,
            image.imageUrl,
            image.headers
          )
        }
        if (this.stopped || this.job(id)?.state !== 'downloading') return
        const temp = path + '.tmp'
        writeFileSync(temp, bytes)
        renameSync(temp, path)
        this.db.connection
          .prepare('UPDATE download_jobs SET done=?,updated=? WHERE chapter_id=?')
          .run(i + 1, Date.now(), id)
      }
      this.db.connection.transaction(() => {
        this.db.connection
          .prepare(
            "UPDATE download_jobs SET state='completed',error='',updated=? WHERE chapter_id=?"
          )
          .run(Date.now(), id)
        this.db.connection
          .prepare(
            'INSERT INTO cached_chapters(chapter_id,completed) VALUES(?,?) ON CONFLICT(chapter_id) DO UPDATE SET completed=excluded.completed'
          )
          .run(id, Date.now())
      })()
    } catch (error) {
      if (this.db.connection.open && !this.stopped && this.job(id)?.state === 'downloading')
        this.db.connection
          .prepare("UPDATE download_jobs SET state='error',error=?,updated=? WHERE chapter_id=?")
          .run(String(error), Date.now(), id)
    }
  }
  async download(id: number): Promise<number> {
    this.enqueue([id])
    await this.tick()
    for (;;) {
      if (this.stopped) throw new Error('App is closing')
      const job = this.job(id)
      if (!job || job.state === 'cancelled') throw new Error('Download cancelled')
      if (job.state === 'error') throw new Error(job.error)
      if (job.state === 'completed') return job.total
      await new Promise((r) => setTimeout(r, 100))
      await this.tick()
    }
  }
  async close(): Promise<void> {
    this.stopped = true
    await Promise.allSettled(this.workers.values())
    this.db.connection
      .prepare("UPDATE download_jobs SET state='queued' WHERE state='downloading'")
      .run()
  }
  isBusy(): boolean {
    return this.workers.size > 0
  }
}
