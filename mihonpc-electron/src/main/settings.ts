import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultSettings, settingsPatch, type Settings } from '../shared/settings'
import type { AppDatabase } from './db'
export class SettingsStore {
  private value: Settings
  constructor(
    private readonly path: string,
    private readonly db: AppDatabase
  ) {
    this.value = { ...defaultSettings }
    if (existsSync(path))
      this.value = {
        ...this.value,
        ...settingsPatch(cleanLegacy(JSON.parse(readFileSync(path, 'utf8'))))
      }
    else {
      const prior = db.connection
        .prepare('SELECT mode,direction,preload FROM reader_defaults WHERE id=1')
        .get() as {
        mode: Settings['readerMode']
        direction: Settings['direction']
        preload: number
      }
      this.value = {
        ...this.value,
        readerMode: prior.mode,
        direction: prior.direction,
        preload: prior.preload
      }
    }
    this.save({})
  }
  get(): Settings {
    return { ...this.value }
  }
  save(patch: Partial<Settings>): Settings {
    const next = { ...this.value, ...settingsPatch(patch) }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + '.tmp', JSON.stringify(next, null, 2), 'utf8')
    renameSync(this.path + '.tmp', this.path)
    this.db.connection.transaction(() => {
      const insert = this.db.connection.prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      )
      Object.entries(next).forEach(([key, value]) => insert.run(key, JSON.stringify(value)))
      this.db.connection
        .prepare('UPDATE reader_defaults SET mode=?,direction=?,preload=? WHERE id=1')
        .run(next.readerMode, next.direction, next.preload)
    })()
    this.value = next
    return this.get()
  }
}

function cleanLegacy(value: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...value }
  delete copy.autoTracking
  return copy
}
