import {
  app,
  ipcMain,
  shell,
  dialog,
  clipboard,
  ClipboardItem,
  nativeImage,
  type BrowserWindow
} from 'electron'
import { join } from 'node:path'
import type { ReleaseServices } from './release'
import type { CollectionService } from './collection'
import type { SettingsStore } from './settings'
import { CHANNELS } from '../shared/ipc'
import { createHandlers, dispatch } from './handlers'
import type { AppDatabase } from './db'
import type { ReadingServices } from './services'
import { writeFileSync } from 'node:fs'
export function registerIpc(
  db: AppDatabase,
  getWindow: () => BrowserWindow | null,
  services: ReadingServices,
  testSavePath?: string,
  collection?: CollectionService,
  settings?: SettingsStore,
  release?: ReleaseServices
): () => void {
  const window = (): BrowserWindow => {
    const value = getWindow()
    if (!value) throw new Error('Application window is closed')
    return value
  }
  const image = async (id: number, index: number): Promise<Electron.NativeImage> => {
    const image = nativeImage.createFromDataURL(await services.page(id, index))
    if (image.isEmpty()) throw new Error('Image could not be decoded')
    return image
  }
  const handlers = createHandlers(
    db,
    app.getVersion(),
    async () => {
      const error = await shell.openPath(app.getPath('userData'))
      if (error) throw new Error(error)
    },
    services,
    {
      exportBackup: async () => {
        if (!release) throw new Error('Backup service unavailable')
        const result = testSavePath
          ? { canceled: false, filePath: join(app.getPath('userData'), 'test.mihonbk') }
          : await dialog.showSaveDialog(window(), {
              title: 'Export library backup',
              defaultPath: 'MihonPC-' + Date.now() + '.mihonbk',
              filters: [{ name: 'MihonPC backup', extensions: ['mihonbk'] }]
            })
        return result.canceled || !result.filePath ? null : release.backups.export(result.filePath)
      },
      importBackup: async (includeSettings) => {
        if (!release) throw new Error('Backup service unavailable')
        const result = testSavePath
          ? { canceled: false, filePaths: [join(app.getPath('userData'), 'test.mihonbk')] }
          : await dialog.showOpenDialog(window(), {
              title: 'Restore library backup',
              properties: ['openFile'],
              filters: [
                {
                  name: 'Mihon / MihonPC backups',
                  extensions: ['tachibk', 'proto', 'gz', 'mihonbk']
                }
              ]
            })
        return result.canceled || !result.filePaths[0]
          ? null
          : release.backups.import(result.filePaths[0], includeSettings)
      },
      pickDirectory: async () => {
        const result = await dialog.showOpenDialog(window(), {
          title: 'Choose storage folder',
          properties: ['openDirectory', 'createDirectory']
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
      fullscreen: async (enabled) => {
        const target = window()
        if (target.isFullScreen() === enabled) return
        await new Promise<void>((resolve, reject) => {
          const done = (): void => {
            clearTimeout(timer)
            resolve()
          }
          const timer = setTimeout(() => {
            target.removeListener('enter-full-screen', done)
            target.removeListener('leave-full-screen', done)
            if (target.isFullScreen() === enabled) resolve()
            else reject(new Error('Full-screen transition timed out'))
          }, 5000)
          if (enabled) target.once('enter-full-screen', done)
          else target.once('leave-full-screen', done)
          target.setFullScreen(enabled)
        })
      },
      installFile: async () => {
        const result = await dialog.showOpenDialog(window(), {
          title: 'Install a Mihon extension',
          filters: [{ name: 'Mihon extension', extensions: ['apk', 'jar'] }],
          properties: ['openFile']
        })
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
      saveImage: async (id, index) => {
        const bytes = (await image(id, index)).toPNG()
        const result = testSavePath
          ? { canceled: false, filePath: testSavePath }
          : await dialog.showSaveDialog(window(), {
              title: 'Save page image',
              defaultPath: 'chapter-' + id + '-page-' + (index + 1) + '.png',
              filters: [{ name: 'PNG image', extensions: ['png'] }]
            })
        if (result.canceled || !result.filePath) return false
        writeFileSync(result.filePath, bytes)
        return true
      },
      copyImage: async (id, index) => {
        await clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array((await image(id, index)).toPNG())], {
              type: 'image/png'
            })
          })
        ])
      }
    },
    collection,
    settings,
    release
  )
  for (const channel of CHANNELS)
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      const target = getWindow()
      if (
        !target ||
        event.sender !== target.webContents ||
        event.senderFrame !== target.webContents.mainFrame
      )
        throw new Error('Untrusted IPC sender')
      return dispatch(handlers, channel, args)
    })
  return () => CHANNELS.forEach((channel) => ipcMain.removeHandler(channel))
}
