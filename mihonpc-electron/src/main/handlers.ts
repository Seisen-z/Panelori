import type { Channel, IpcContract } from '../shared/ipc'
import { isChannel, validateArgs } from '../shared/ipc'
import type { AppDatabase } from './db'
import type { ReadingServices } from './services'
import type { ReleaseServices } from './release'
import { CollectionService } from './collection'
import type { SettingsStore } from './settings'
import { LibraryRepository } from './library'
export type Handlers = {
  [C in Channel]: (
    ...args: IpcContract[C]['args']
  ) => IpcContract[C]['result'] | Promise<IpcContract[C]['result']>
}
export interface DesktopActions {
  fullscreen: (enabled: boolean) => void | Promise<void>
  installFile: () => Promise<string | null>
  saveImage: (id: number, index: number) => Promise<boolean>
  copyImage: (id: number, index: number) => Promise<void>
  exportBackup?: () => Promise<string | null>
  importBackup?: (
    includeSettings: boolean
  ) => Promise<import('../shared/release').BackupProgress | null>
  pickDirectory?: (kind: 'downloadLocation' | 'backupLocation') => Promise<string | null>
}
export function createHandlers(
  db: AppDatabase,
  version: string,
  openDirectory: () => Promise<void>,
  services?: ReadingServices,
  desktop?: DesktopActions,
  collection = new CollectionService(db, services),
  settings?: SettingsStore,
  release?: ReleaseServices
): Handlers {
  const library = services?.library ?? new LibraryRepository(db)
  const get = (): ReadingServices => {
    if (!services) throw new Error('Extension runtime not initialized')
    return services
  }
  const actions = (): DesktopActions => {
    if (!desktop) throw new Error('Desktop actions not initialized')
    return desktop
  }
  const rel = (): ReleaseServices => {
    if (!release) throw new Error('Release services not initialized')
    return release
  }
  return {
    'backup:export': () => {
      if (!desktop?.exportBackup) throw new Error('Backup dialog not initialized')
      return desktop.exportBackup()
    },
    'backup:import': (includeSettings) => {
      if (!desktop?.importBackup) throw new Error('Backup dialog not initialized')
      return desktop.importBackup(includeSettings)
    },
    'backup:status': () => rel().backups.status(),
    'downloads:list': () => rel().downloads.list(),
    'downloads:enqueue': (ids) => rel().downloads.enqueue(ids),
    'downloads:action': (id, action) => rel().downloads.action(id, action),
    'downloads:all': (action) => rel().downloads.all(action),
    'app:statistics': () => rel().statistics(),
    'app:checkUpdate': () => ({
      state: 'manual',
      version,
      message: 'Personal build: update checking is manual. No update server is configured.'
    }),
    'settings:pickDirectory': (kind) => {
      if (!desktop?.pickDirectory) throw new Error('Directory dialog not initialized')
      return desktop.pickDirectory(kind)
    },
    'collection:library': () => collection.library(),
    'categories:list': () => collection.categories(),
    'categories:save': (id, name) => collection.category(id, name),
    'categories:delete': (id) => collection.deleteCategory(id),
    'categories:assign': (ids, categories) => collection.assign(ids, categories),
    'collection:bulk': (ids, action) => collection.bulk(ids, action),
    'history:search': (q, l, o) => collection.history(q, l, o),
    'history:delete': (id) => collection.deleteHistory(id),
    'updates:list': () => collection.updates(),
    'updates:check': () => collection.check(),
    'updates:status': () => collection.status(),
    'updates:mark': (id, read) => collection.mark(id, read),
    'chapters:download': (id) =>
      release ? release.downloads.download(id) : collection.download(id),
    'settings:get': () => {
      if (!settings) throw new Error('Settings not initialized')
      return settings.get()
    },
    'settings:set': (patch) => {
      if (!settings) throw new Error('Settings not initialized')
      if (
        patch.defaultCategory &&
        !collection.categories().some((c) => c.id === patch.defaultCategory)
      )
        throw new Error('Category not found')
      return settings.save(patch)
    },
    'data:clearCache': () => {
      get().images.clear()
      db.connection
        .prepare(
          "DELETE FROM cached_chapters WHERE chapter_id NOT IN (SELECT chapter_id FROM download_jobs WHERE state='completed')"
        )
        .run()
    },
    'data:clearLibrary': (confirmation) => {
      if (
        release?.downloads.isBusy() ||
        collection.status().running ||
        release?.backups.status().running
      )
        throw new Error('Wait for active transfers, refresh or restore to finish')
      if (confirmation !== 'DELETE') throw new Error('Type DELETE to confirm')
      db.connection.transaction(() => {
        db.connection.exec('DELETE FROM mangas; DELETE FROM categories;')
        settings?.save({ defaultCategory: 0 })
      })()
    },
    'app:ping': () => 'pong',
    'app:status': () => db.status(version),
    'app:openDataDirectory': openDirectory,
    'app:fullscreen': (enabled) => actions().fullscreen(enabled),
    'library:getFavorites': () => db.getFavorites(),
    'library:addFavorite': (value, id) => {
      const mid = library.upsert(id, value, true),
        category = settings?.get().defaultCategory
      if (category && !collection.library().find((m) => m.id === mid)?.categories.length)
        collection.assign([mid], [category])
      return mid
    },
    'library:removeFavorite': (id) => library.removeFavorite(id),
    'source:getAll': () => services?.extensions.sources() ?? [],
    'source:getPopular': (id, page) => get().extensions.catalogue(id, 'getPopularManga', [page]),
    'source:getLatest': (id, page) => get().extensions.catalogue(id, 'getLatestUpdates', [page]),
    'source:search': (id, page, query, filters) =>
      get().extensions.catalogue(id, 'searchManga', [page, query, filters]),
    'source:getFilters': (id) => get().extensions.filters(id),
    'source:getMangaDetails': (id, value) => get().extensions.details(id, value),
    'source:getChapterList': (id, value) => get().extensions.chapters(id, value),
    'source:getPageList': (id, value) => get().extensions.pages(id, value),
    'source:fetchImage': (url, id) => get().images.dataUrl(id, url),
    'source:cover': (url, id, width, height) => get().images.coverDataUrl(id, url, width, height),
    'extensions:icon': (id) => get().extensions.extensionIcon(id),
    'repos:icon': (url) => get().extensions.repositoryIcon(url),
    'repos:list': () => get().extensions.repositories(),
    'repos:add': (url) => get().extensions.addRepository(url),
    'repos:remove': (url) => get().extensions.removeRepository(url),
    'repos:extensions': () => get().extensions.available(),
    'repos:install': (pkg) => get().extensions.installPackage(pkg),
    'extensions:getAll': () => get().extensions.all(),
    'extensions:reload': () => get().extensions.reload(),
    'extensions:installFile': async () => {
      const path = await actions().installFile()
      return path ? get().extensions.installFile(path) : get().extensions.all()
    },
    'extensions:installUrl': (url) => get().extensions.installUrl(url),
    'extensions:uninstall': (id) => get().extensions.uninstall(id),
    'extensions:setEnabled': (id, enabled) => get().extensions.setEnabled(id, enabled),
    'manga:open': (id, value) => get().open(id, value),
    'manga:getDetail': (id) => library.detail(id),
    'manga:refresh': (id) => get().refresh(id),
    'chapters:getByManga': (id) => library.chapters(id),
    'reader:open': (id, refresh) => get().reader(id, refresh),
    'reader:image': (id, index) => get().page(id, index),
    'reader:retryImage': (id, index) => get().retryPage(id, index),
    'reader:progress': (id, page, elapsed) => {
      library.progress(id, page, elapsed)
      if (
        settings?.get().autoDelete &&
        library.chapter(id).read &&
        release?.downloads.list().jobs.some((j) => j.chapter_id === id && j.state === 'completed')
      )
        release.downloads.action(id, 'delete')
    },
    'reader:setPreferences': (id, prefs, asDefault) => {
      const result = library.setPreferences(id, prefs, asDefault)
      if (asDefault)
        settings?.save({
          readerMode: prefs.mode,
          direction: prefs.direction,
          preload: prefs.preload
        })
      return result
    },
    'reader:saveImage': (id, index) => actions().saveImage(id, index),
    'reader:copyImage': (id, index) => actions().copyImage(id, index),
    'history:getRecent': (limit, offset) => db.getHistory(limit, offset)
  }
}
export function dispatch(handlers: Handlers, channel: unknown, args: unknown[]): unknown {
  if (!isChannel(channel)) throw new Error('Unknown IPC channel')
  validateArgs(channel, args)
  return (handlers[channel] as (...args: unknown[]) => unknown)(...args)
}
