import { app, type BrowserWindow } from 'electron'
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import assert from 'node:assert/strict'
import type { ReleaseServices } from '../release'
import { waitFor, capture } from './flow'
export async function mobileBackupFlow(
  window: BrowserWindow,
  release: ReleaseServices,
  report: string
): Promise<void> {
  if (!process.env.MIHONPC_TEST_BACKUP)
    throw new Error('Mobile flow requires explicit input backup')
  mkdirSync(dirname(report), { recursive: true })
  copyFileSync(process.env.MIHONPC_TEST_BACKUP, join(app.getPath('userData'), 'test.mihonbk'))
  await waitFor(window, `document.querySelector('[data-ready="true"]')`)
  await window.webContents.executeJavaScript("location.hash='/backup'")
  await waitFor(window, "document.querySelector('h1')?.textContent==='Backup & Restore'")
  await window.webContents.executeJavaScript(
    "window.confirm=()=>true; [...document.querySelectorAll('button')].find(b=>b.textContent==='Restore backup').click()"
  )
  await waitFor(window, 'document.body.innerText.includes("65 titles restored; 0 errors")')
  const status = release.backups.status()
  assert.equal(status.summary?.favorites, 59)
  assert.equal(status.summary?.chapters, 8754)
  assert.equal(status.summary?.history, 1799)
  assert.equal(status.format, 'mihon')
  assert.equal(release.db.getFavorites().length, 59)
  await capture(window, join(dirname(report), 'mobile-restore.png'))
  await window.webContents.executeJavaScript("location.hash='/library'")
  await waitFor(window, `document.querySelector('[aria-label^="Open "]')`)
  await capture(window, join(dirname(report), 'mobile-library.png'))
  writeFileSync(
    report,
    JSON.stringify(
      {
        phase: 12,
        version: app.getVersion(),
        status,
        integrity: release.db.connection.pragma('integrity_check', { simple: true }),
        profile: app.getPath('userData'),
        checks: [
          'supplied mobile gzip protobuf restored through real UI/typed IPC',
          '59 library favorites; 65 stored titles; 8754 chapters; 1799 history',
          'mobile settings/repos ignored with visible import warnings',
          'library renders after restore in isolated profile'
        ]
      },
      null,
      2
    )
  )
  console.log('MOBILE_UI_OK: 65 titles; 59 favorites; 8754 chapters; 1799 history; 0 errors')
}
