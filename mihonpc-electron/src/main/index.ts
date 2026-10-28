import { mobileBackupFlow } from './testing/mobile'
import {
  app,
  BrowserWindow,
  dialog,
  session,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  type Tray
} from 'electron'
import { join, resolve, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { ReleaseServices } from './release'
import { desktopMenu } from './desktop'
import { onWifi } from './platform'
import { shouldKeepDisplayAwake } from './reader-power'
import { runtimeFlow } from './testing/runtime'
import { phase811Flow } from './testing/release'
import { setUserAgentProvider, setOfflineProvider } from './extensions/network'
import { SettingsStore } from './settings'
import { CollectionService } from './collection'
import { UpdateScheduler } from './scheduler'
import { phase57Flow } from './testing/collection'
import { AppDatabase } from './db'
import { registerIpc } from './ipc'
import { testExtensions } from './testing/extensions'
import { ExtensionManager } from './extensions/manager'
import { RepositoryExtensionManager } from './extensions/repository-manager'
import { ImageCache } from './images'
import { LibraryRepository } from './library'
import { ReadingServices } from './services'
import { startFixture, phase3Flow, phase4Flow, waitFor, type Fixture } from './testing/flow'

const portableCheck = process.argv.includes('--portable-check')
if (portableCheck && (!process.argv.includes('--portable') || !process.env.MIHONPC_SMOKE_REPORT))
  throw new Error('Portable check requires --portable and a report path')
const runtimeTest = process.argv.includes('--runtime-test')
const extensionTest = process.argv.includes('--extension-test')
const flowPhase = process.argv.find((arg) => arg.startsWith('--flow-test='))?.split('=')[1]
const smoke = process.argv.includes('--smoke-test') || extensionTest || !!flowPhase || runtimeTest
let fixture: Fixture | null = null
let readingServices: ReadingServices | null = null
if (smoke && !process.env.MIHONPC_SMOKE_DATA)
  throw new Error('Smoke tests require an isolated data directory')
app.setName('MihonPC')
app.setPath(
  'userData',
  smoke
    ? resolve(process.env.MIHONPC_SMOKE_DATA!)
    : process.env.PORTABLE_EXECUTABLE_DIR
      ? join(process.env.PORTABLE_EXECUTABLE_DIR, 'MihonPC-data')
      : process.argv.includes('--portable')
        ? join(dirname(process.execPath), 'MihonPC-data')
        : join(app.getPath('appData'), 'MihonPC')
)
let mainWindow: BrowserWindow | null = null
let database: AppDatabase | null = null
let extensions: ExtensionManager | null = null
let schedulerTimer: ReturnType<typeof setInterval> | undefined
let awake: number | undefined
let collection: CollectionService | undefined
let settings: SettingsStore | undefined
let release: ReleaseServices | undefined
let releaseTimer: ReturnType<typeof setInterval> | undefined
let tray: Tray | undefined
let quitting = false
let disposeIpc: (() => void) | null = null
const devUrl = !app.isPackaged && !smoke ? process.env.ELECTRON_RENDERER_URL : undefined
const rendererUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href
const consoleErrors: string[] = []
let smokeTimer: ReturnType<typeof setTimeout> | undefined

function createWindow(): void {
  const preferences: Electron.WebPreferences = {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    backgroundThrottling: !smoke
  }

  const window = new BrowserWindow({
    title: 'MihonPC',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f7f8fa',
    show: false,
    autoHideMenuBar: true,
    webPreferences: preferences
  })
  mainWindow = window
  window.on('close', (event) => {
    if ((!smoke || flowPhase === '11') && !quitting && tray && settings?.get().closeToTray) {
      event.preventDefault()
      window.hide()
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    if (!smoke && process.platform !== 'darwin') app.quit()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl
      ? new URL(url).origin === new URL(devUrl).origin
      : url.split('#')[0] === rendererUrl
    if (!allowed) event.preventDefault()
  })
  window.webContents.on(
    'console-message',
    (_event, details: number | { level: number; message: string }, message?: string) => {
      if (typeof details === 'number') {
        if (details === 3) consoleErrors.push(message ?? '')
      } else if (details.level === 3) consoleErrors.push(details.message)
    }
  )
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer stopped:', details.reason)
    if (smoke) app.exit(1)
  })
  if (smoke) {
    smokeTimer = setTimeout(
      () => {
        console.error('SMOKE FAIL: renderer timed out')
        extensions?.dispose()
        app.exit(1)
      },
      runtimeTest ? 300000 : 60_000
    )
    window.webContents.once('did-finish-load', () => {
      const run =
        runtimeTest && readingServices
          ? runtimeFlow(window, readingServices, process.env.MIHONPC_SMOKE_REPORT!).then(() => {
              clearTimeout(smokeTimer)
              app.quit()
            })
          : flowPhase && readingServices && fixture
            ? (flowPhase === '12'
                ? mobileBackupFlow(window, release!, process.env.MIHONPC_SMOKE_REPORT!)
                : flowPhase === '11'
                  ? phase811Flow(
                      window,
                      readingServices,
                      release!,
                      process.env.MIHONPC_SMOKE_REPORT!
                    )
                  : flowPhase === '7'
                    ? phase57Flow(
                        window,
                        readingServices,
                        collection!,
                        settings!,
                        process.env.MIHONPC_SMOKE_REPORT!
                      )
                    : flowPhase === '4'
                      ? phase4Flow(
                          window,
                          readingServices,
                          process.env.MIHONPC_SMOKE_REPORT!,
                          fixture
                        )
                      : phase3Flow(
                          window,
                          readingServices,
                          process.env.MIHONPC_SMOKE_REPORT!,
                          fixture
                        )
              ).then(() => {
                clearTimeout(smokeTimer)
                app.quit()
              })
            : runSmoke(window)
      void run.catch((error: unknown) => {
        console.error('SMOKE FAIL:', error)
        extensions?.dispose()
        app.exit(1)
      })
    })
  }
  if (portableCheck)
    window.webContents.once('did-finish-load', () => {
      void (async () => {
        await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
        const report = process.env.MIHONPC_SMOKE_REPORT!,
          prefs = preferences
        const nodeExposed = await window.webContents.executeJavaScript(
          'typeof window.require!=="undefined" || typeof window.process!=="undefined"'
        )
        if (nodeExposed || !prefs.sandbox || !prefs.contextIsolation || prefs.nodeIntegration)
          throw new Error('Portable renderer isolation failed')
        if (extensions!.sources().length !== 0)
          throw new Error('Portable check expects a fresh data directory')
        mkdirSync(dirname(report), { recursive: true })
        writeFileSync(
          report,
          JSON.stringify(
            {
              version: app.getVersion(),
              dataDirectory: app.getPath('userData'),
              schema: database!.status(app.getVersion()),
              sources: extensions!.sources(),
              nodeExposed,
              sandbox: prefs.sandbox,
              contextIsolation: prefs.contextIsolation,
              normalDesktop: true
            },
            null,
            2
          )
        )
        writeFileSync(
          join(dirname(report), 'portable-library.png'),
          (await window.webContents.capturePage()).toPNG()
        )
        console.log(
          'PORTABLE PASS: normal desktop launch; local data directory; SQLite v4; isolated renderer; no bundled sources'
        )
        app.quit()
      })().catch((error) => {
        console.error('PORTABLE FAIL:', error)
        app.exit(1)
      })
    })
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

async function runSmoke(window: BrowserWindow): Promise<void> {
  // Integration test in this app's own sandboxed renderer.
  const result: unknown = await window.webContents.executeJavaScript(`(async () => {
    await new Promise((resolve, reject) => {
      if (document.querySelector('[data-ready="true"]')) return resolve();
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('React did not become ready')); }, 10000);
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-ready="true"]')) { clearTimeout(timeout); observer.disconnect(); resolve(); }
      });
      observer.observe(document.body, { attributes: true, subtree: true, childList: true });
    });
    let unknownRejected = false, invalidRejected = false;
    try { await window.electron.invoke('not:allowed'); } catch { unknownRejected = true; }
    try { await window.electron.invoke('history:getRecent', -1, 0); } catch { invalidRejected = true; }
    return {
      ping: await window.electron.invoke('app:ping'), status: await window.electron.invoke('app:status'),
      favorites: await window.electron.invoke('library:getFavorites'), sources: await window.electron.invoke('source:getAll'),
      history: await window.electron.invoke('history:getRecent', 50, 0),
      nodeExposed: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
      bridgeKeys: Object.keys(window.electron), unknownRejected, invalidRejected,
      title: document.querySelector('h1')?.textContent
    };
  })()`)
  const data = result as {
    ping: string
    status: { schemaVersion: number; integrity: string }
    nodeExposed: boolean
    unknownRejected: boolean
    invalidRejected: boolean
    bridgeKeys: string[]
    title: string
  }
  if (
    data.ping !== 'pong' ||
    data.status.schemaVersion !== 4 ||
    data.status.integrity !== 'ok' ||
    data.nodeExposed ||
    !data.unknownRejected ||
    !data.invalidRejected ||
    data.bridgeKeys.join() !== 'invoke' ||
    data.title !== 'Library' ||
    consoleErrors.length
  ) {
    throw new Error(JSON.stringify({ result, consoleErrors }))
  }
  const output = process.env.MIHONPC_SMOKE_REPORT
  if (!output) throw new Error('Smoke report path is missing')
  mkdirSync(dirname(resolve(output)), { recursive: true })
  await window.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  writeFileSync(
    join(dirname(output), 'library.png'),
    (await window.webContents.capturePage()).toPNG()
  )
  const routes: Record<string, string> = {}
  for (const [route, title] of [
    ['browse', 'Browse'],
    ['history', 'History'],
    ['updates', 'Updates'],
    ['more', 'More']
  ]) {
    const rendered: string = await window.webContents.executeJavaScript(`(async () => {
      location.hash = '/${route}';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.querySelector('h1')?.textContent;
    })()`)
    if (rendered !== title) throw new Error('Route failed: ' + route)
    routes[route] = rendered
  }
  await new Promise((resolve) => setTimeout(resolve, 200))
  writeFileSync(join(dirname(output), 'more.png'), (await window.webContents.capturePage()).toPNG())
  const foreign = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  let senderRejected: boolean
  try {
    await foreign.loadURL('about:blank')
    senderRejected = await foreign.webContents.executeJavaScript(`(async () => {
      try { await window.electron.invoke('app:ping'); return false; }
      catch (error) { return String(error).includes('Untrusted IPC sender'); }
    })()`)
  } finally {
    foreign.destroy()
  }
  if (!senderRejected) throw new Error('Foreign IPC sender was accepted')
  if (consoleErrors.length) throw new Error(JSON.stringify(consoleErrors))
  writeFileSync(
    output,
    JSON.stringify(
      {
        result,
        routes,
        senderRejected,
        consoleErrors,
        launchPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      },
      null,
      2
    )
  )
  clearTimeout(smokeTimer)
  console.log(
    'SMOKE PASS: React rendered; ping=pong; SQLite v4=ok; 5 routes passed; foreign sender rejected; Node hidden; renderer console errors=0'
  )
  app.quit()
}

if (!smoke) {
  if (!app.requestSingleInstanceLock()) app.exit(0)
  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}
app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId('app.mihonpc.desktop')
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    )
    session.defaultSession.setPermissionCheckHandler(() => false)
    // Local-only renderer. Development permits only its Vite origin and HMR socket.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url)
      const remote = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      const development =
        devUrl && url.host === new URL(devUrl).host && ['http:', 'ws:'].includes(url.protocol)
      callback({ cancel: remote && !development })
    })
    const migrations = app.isPackaged
      ? join(process.resourcesPath, 'migrations')
      : join(app.getAppPath(), 'migrations')
    database = new AppDatabase(join(app.getPath('userData'), 'mihonpc.db'), migrations)
    if (extensionTest) {
      await testExtensions(
        database,
        join(__dirname, '../preload'),
        process.env.MIHONPC_SMOKE_REPORT!
      )
      app.quit()
      return
    }
    settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), database)
    setUserAgentProvider(() => settings!.get().userAgent)
    setOfflineProvider(() => settings!.get().offlineOnly)
    mkdirSync(join(app.getPath('userData'), 'extensions'), { recursive: true })
    if (flowPhase) {
      if (!process.env.MIHONPC_TEST_FIXTURES)
        throw new Error('Flow tests require a fixture directory')
      fixture = await startFixture(
        join(app.getPath('userData'), 'extensions'),
        process.env.MIHONPC_TEST_FIXTURES
      )
    }
    extensions =
      smoke && !runtimeTest
        ? new ExtensionManager(
            join(app.getPath('userData'), 'extensions'),
            join(__dirname, '../preload'),
            database,
            !!flowPhase
          )
        : new RepositoryExtensionManager(
            join(app.getPath('userData'), 'extensions'),
            join(__dirname, '../preload'),
            database,
            app.isPackaged
              ? join(process.resourcesPath, 'runtime')
              : join(app.getAppPath(), 'runtime')
          )
    await extensions.reload()
    const services = new ReadingServices(
      new LibraryRepository(database),
      extensions,
      new ImageCache(join(app.getPath('userData'), 'cache'), extensions)
    )
    readingServices = services

    setUserAgentProvider(() => settings!.get().userAgent)
    setOfflineProvider(() => settings!.get().offlineOnly)
    release = new ReleaseServices(database, settings, services, app.getPath('userData'), onWifi)
    releaseTimer = setInterval(() => {
      void release!.downloads.tick().catch((error) => console.error('Download queue:', error))
      if (!smoke) {
        try {
          release!.backups.tick()
        } catch (error) {
          console.error('Automatic backup:', error)
        }
      }
    }, 500)
    collection = new CollectionService(database, services, settings)
    const scheduler = new UpdateScheduler(
      collection,
      settings,
      () => powerMonitor.isOnBatteryPower(),
      (count) => {
        if (Notification.isSupported())
          new Notification({
            title: 'MihonPC library updated',
            body: count + ' new chapters'
          }).show()
      }
    )
    schedulerTimer = setInterval(() => {
      void scheduler.tick().catch((error) => console.error('Update check:', error))
      const keep = shouldKeepDisplayAwake(
        settings!.get().keepScreenOn,
        mainWindow?.webContents.getURL() ?? '',
        Boolean(mainWindow?.isVisible() && !mainWindow.isMinimized())
      )
      if (keep && awake === undefined) awake = powerSaveBlocker.start('prevent-display-sleep')
      else if (!keep && awake !== undefined) {
        powerSaveBlocker.stop(awake)
        awake = undefined
      }
    }, 10000)
    void scheduler.tick()
    disposeIpc = registerIpc(
      database,
      () => mainWindow,
      services,
      flowPhase ? join(app.getPath('userData'), 'saved-page.png') : undefined,
      collection,
      settings,
      release
    )
    createWindow()
    if (!smoke || flowPhase === '11')
      tray = desktopMenu(
        () => mainWindow,
        release,
        app.isPackaged
          ? join(process.resourcesPath, 'icon.png')
          : join(app.getAppPath(), 'build/icon.png')
      )
    app.on('activate', () => {
      if (!mainWindow) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Startup failed:', error)
    if (!smoke)
      dialog.showErrorBox(
        'MihonPC could not start',
        error instanceof Error ? error.message : String(error)
      )
    app.exit(1)
  })
// Host windows may be recycled with no visible window during tests/reload.
app.on('window-all-closed', () => {})
app.on('before-quit', (event) => {
  if (release && !quitting) {
    event.preventDefault()
    quitting = true
    clearInterval(releaseTimer)
    void release.downloads.close().finally(() => app.quit())
  }
})
app.on('will-quit', () => {
  tray?.destroy()
  clearInterval(releaseTimer)
  clearTimeout(smokeTimer)
  clearInterval(schedulerTimer)
  if (awake !== undefined) powerSaveBlocker.stop(awake)
  disposeIpc?.()
  extensions?.dispose()
  void fixture?.close()
  database?.close()
})
