import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import type { ReleaseServices } from './release'
export function desktopMenu(
  getWindow: () => BrowserWindow | null,
  release: ReleaseServices,
  iconPath: string
): Tray {
  const show = (): void => {
    const window = getWindow()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  }
  const route = (path: string): void => {
    show()
    void getWindow()?.webContents.executeJavaScript('location.hash=' + JSON.stringify(path))
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Library',
        submenu: [
          { label: 'Library', accelerator: 'CmdOrCtrl+1', click: () => route('/library') },
          { label: 'Updates', accelerator: 'CmdOrCtrl+2', click: () => route('/updates') },
          { label: 'History', accelerator: 'CmdOrCtrl+3', click: () => route('/history') },
          { label: 'Browse', accelerator: 'CmdOrCtrl+4', click: () => route('/browse') },
          { label: 'More', accelerator: 'CmdOrCtrl+5', click: () => route('/more') },
          { type: 'separator' },
          { label: 'Backups', accelerator: 'CmdOrCtrl+B', click: () => route('/backup') },
          { label: 'Downloads', accelerator: 'CmdOrCtrl+D', click: () => route('/downloads') },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => route('/settings/appearance')
          },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'togglefullscreen' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Statistics', click: () => route('/statistics') },
          { label: 'About & Shortcuts', click: () => route('/about') }
        ]
      }
    ])
  )
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) throw new Error('Tray icon did not load')
  const tray = new Tray(icon.resize({ width: 20, height: 20 }))
  tray.setToolTip('MihonPC - personal reading space')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show MihonPC', click: show },
      { label: 'Downloads', click: () => route('/downloads') },
      { label: 'Pause downloads', click: () => release.downloads.all('pause') },
      { label: 'Resume downloads', click: () => release.downloads.all('resume') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('double-click', show)
  return tray
}
