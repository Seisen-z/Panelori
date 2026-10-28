export interface BackupProgress {
  running: boolean
  total: number
  done: number
  restored: number
  errors: string[]
  lastBackup: number
  format?: 'mihon' | 'mihonpc'
  warnings?: string[]
  summary?: {
    manga: number
    favorites: number
    chapters: number
    history: number
    categories: number
  }
}
export interface DownloadJob {
  chapter_id: number
  state: 'queued' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error'
  done: number
  total: number
  storage: string
  error: string
  updated: number
  title: string
  name: string
}
export interface DownloadStatus {
  jobs: DownloadJob[]
  waiting: string
}
export interface Statistics {
  titles: number
  chapters: number
  read: number
  minutes: number
  offline: number
  sessions: number
}
export interface UpdateInfo {
  state: 'manual'
  version: string
  message: string
}
export interface ReleaseContract {
  'backup:export': { args: []; result: string | null }
  'backup:import': { args: [includeSettings: boolean]; result: BackupProgress | null }
  'backup:status': { args: []; result: BackupProgress }
  'downloads:list': { args: []; result: DownloadStatus }
  'downloads:enqueue': { args: [ids: number[]]; result: DownloadStatus }
  'downloads:action': {
    args: [id: number, action: 'pause' | 'resume' | 'cancel' | 'delete']
    result: DownloadStatus
  }
  'downloads:all': { args: [action: 'pause' | 'resume']; result: DownloadStatus }
  'app:statistics': { args: []; result: Statistics }
  'app:checkUpdate': { args: []; result: UpdateInfo }
  'settings:pickDirectory': {
    args: [kind: 'downloadLocation' | 'backupLocation']
    result: string | null
  }
}
