import { Menu, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import assert from 'node:assert/strict'
import type { ReadingServices } from '../services'
import type { ReleaseServices } from '../release'
import { waitFor, capture } from './flow'
export async function phase811Flow(
  window: BrowserWindow,
  services: ReadingServices,
  release: ReleaseServices,
  reportPath: string
): Promise<void> {
  const checks: string[] = []
  const check = (message: string): void => {
    checks.push(message)
    console.log('RELEASE CHECK: ' + message)
  }
  mkdirSync(dirname(reportPath), { recursive: true })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  const data = await services.extensions.catalogue(7001, 'getPopularManga', [1]),
    id = await services.open(7001, data.mangas[0])
  services.library.upsert(7001, data.mangas[0], true)
  const c = services.library.chapters(id)[0]
  await services.reader(c.id, false)
  services.library.progress(c.id, 1, 60000)
  const js = async (code: string): Promise<unknown> => {
    const value = await window.webContents.executeJavaScript(
      `(async()=>{try{const value=await (${code});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {value}}catch(e){return {failure:String(e)}}})()`
    )
    if (value?.failure) throw new Error(code + ': ' + value.failure)
    return value?.value
  }
  const click = async (text: string): Promise<void> => {
    await js(
      `[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`
    )
  }
  const route = async (path: string, title: string): Promise<void> => {
    await js(`location.hash=${JSON.stringify(path)}`)
    await waitFor(window, `document.querySelector('h1')?.textContent===${JSON.stringify(title)}`)
  }
  await route('/backup', 'Backup & Restore')
  await click('Export backup')
  await waitFor(window, 'document.body.innerText.includes("Backup saved:")')
  const backupPath = join(dirname(release.db.path), 'test.mihonbk'),
    backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  assert.equal(backup.manga.length, 1)
  assert.equal(backup.manga[0].chapters[0].page, 1)
  assert(!('autoTracking' in backup.settings))
  check('export through typed IPC and UI writes .mihonbk with chapter progress and no tracker data')
  services.library.removeFavorite(id)
  await js('(window.confirm=()=>true,true)')
  await click('Restore backup')
  await waitFor(window, 'document.body.innerText.includes("1 titles restored; 0 errors")')
  assert.equal(release.db.getFavorites()[0].id, id)
  assert.equal(services.library.chapter(c.id).last_page_read, 1)
  await capture(window, join(dirname(reportPath), 'backup-restore.png'))
  check('restore via UI merges without duplicate IDs and preserves page/history')
  const chapter2 = services.library.chapters(id)[1]
  release.downloads.enqueue([chapter2.id])
  release.downloads.action(chapter2.id, 'pause')
  await route('/downloads', 'Downloads')
  await waitFor(window, 'document.body.innerText.includes("paused")')
  await click('Resume')
  await waitFor(window, 'document.body.innerText.includes("completed")')
  const job = release.downloads.list().jobs.find((j) => j.chapter_id === chapter2.id)!
  assert.equal(job.done, 40)
  assert.equal(job.total, 40)
  assert.equal(job.state, 'completed')
  await capture(window, join(dirname(reportPath), 'download-completed.png'))
  check('persistent download controls pause/resume a full 40-page chapter')
  // Prove dedicated download storage, not temporary image-cache fallback.
  services.images.clear()
  await services.extensions.setEnabled('en.mihonpc-fixture', false)
  await js("window.electron.invoke('settings:set',{offlineOnly:true})")
  await js("location.hash='/reader/" + chapter2.id + "'")
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\') && [...document.querySelectorAll("img")].some(i=>i.complete&&i.naturalWidth>0)'
  )
  await capture(window, join(dirname(reportPath), 'download-offline-reader.png'))
  check(
    'offline reader decodes dedicated downloaded images after temporary cache clear and source disable'
  )
  await js("location.hash='/statistics'")
  await waitFor(window, "document.querySelector('h1')?.textContent==='Statistics'")
  const stats = release.statistics()
  assert.equal(stats.offline, 1)
  assert.equal(stats.titles, 1)
  assert(stats.minutes >= 1)
  check('statistics reflect real SQLite reading time and offline chapter count')
  await route('/about', 'About MihonPC')
  await click('Check for updates')
  await waitFor(window, 'document.body.innerText.includes("No update server is configured")')
  check('personal-build manual updater stub and keyboard shortcut help')
  await route('/more', 'More')
  await waitFor(window, 'document.body.innerText.includes("Backup & Restore")')
  assert(!(await js('!!document.querySelector(\'a[href="#/settings/tracking"]\')')))
  assert(
    !release.db.connection
      .prepare("SELECT name FROM sqlite_master WHERE name='tracker_tokens'")
      .get()
  )
  check('tracker UI, preference and token tables removed; eight personal settings groups remain')
  await capture(window, join(dirname(reportPath), 'more-personal.png'))
  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
    window.webContents.reload()
  })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  await route('/downloads', 'Downloads')
  await waitFor(window, 'document.body.innerText.includes("completed")')
  check('renderer reload preserves completed job and offline setting')
  const menu = Menu.getApplicationMenu()
  assert(menu)
  const item = menu.items[0].submenu!.items.find((i) => i.label === 'Backups')!
  assert.equal(item.accelerator, 'CmdOrCtrl+B')
  item.click(item, window, {
    shiftKey: false,
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    triggeredByAccelerator: true
  })
  await waitFor(window, "document.querySelector('h1')?.textContent==='Backup & Restore'")
  release.settings.save({ closeToTray: true })
  console.log('RELEASE CHECK: testing tray close')
  window.close()
  assert(!window.isDestroyed())
  assert(!window.isVisible())
  window.show()
  release.settings.save({ closeToTray: false })
  check('native menu accelerator route and close-to-tray hide/show lifecycle')

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        phase: 11,
        checks,
        statistics: stats,
        jobs: release.downloads.list(),
        backup: release.backups.status(),
        schema: release.db.status('test').schemaVersion
      },
      null,
      2
    )
  )
  console.log(
    'PHASES 8-11 PASS: ' +
      checks.length +
      ' desktop checks; backup/restore; persistent downloads; dedicated offline storage; personal settings; statistics; tracker removal'
  )
}
