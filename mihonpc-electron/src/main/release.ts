import { join } from 'node:path'
import type { AppDatabase } from './db'
import type { SettingsStore } from './settings'
import type { ReadingServices } from './services'
import { BackupService } from './backups'
import { DownloadQueue } from './downloads'
import type { Statistics } from '../shared/release'
export class ReleaseServices {
  readonly backups: BackupService
  readonly downloads: DownloadQueue
  constructor(
    readonly db: AppDatabase,
    readonly settings: SettingsStore,
    services: ReadingServices,
    dataDirectory: string,
    canDownload?: () => Promise<boolean>
  ) {
    this.backups = new BackupService(db, settings, dataDirectory, (remote) =>
      services.extensions.importSourceId(remote)
    )
    this.downloads = new DownloadQueue(
      db,
      services,
      settings,
      join(dataDirectory, 'downloads'),
      canDownload
    )
    services.offlinePage = (id, index) => this.downloads.offlinePage(id, index)
  }
  statistics(): Statistics {
    const count = (sql: string): number =>
      (this.db.connection.prepare(sql).get() as { n: number }).n
    return {
      titles: count('SELECT count(*) n FROM mangas WHERE favorite=1'),
      chapters: count('SELECT count(*) n FROM chapters'),
      read: count('SELECT count(*) n FROM chapters WHERE read=1'),
      minutes: Math.round(count('SELECT coalesce(sum(time_read),0) n FROM history') / 60000),
      offline: count('SELECT count(*) n FROM cached_chapters'),
      sessions: count('SELECT count(*) n FROM history')
    }
  }
}
