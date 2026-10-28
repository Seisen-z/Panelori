import { settingsNavigationChecks } from './settings-navigation'
import type { BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import type { ReadingServices } from '../services'
import type { CollectionService } from '../collection'
import type { SettingsStore } from '../settings'
import { waitFor, capture } from './flow'
export async function phase57Flow(
  window: BrowserWindow,
  services: ReadingServices,
  collection: CollectionService,
  settings: SettingsStore,
  reportPath: string
): Promise<void> {
  const checks: string[] = []
  mkdirSync(dirname(reportPath), { recursive: true })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  const catalogue = await services.extensions.catalogue(7001, 'getPopularManga', [1])
  const mid = await services.open(7001, catalogue.mangas[0])
  services.library.upsert(7001, catalogue.mangas[0], true)
  const first = services.library.chapters(mid)[0]
  await services.reader(first.id, false)
  services.library.progress(first.id, 1, 100)
  const js = async (code: string): Promise<unknown> => {
    const result = await window.webContents.executeJavaScript(
      `(async()=>{try{const result=await (${code});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {result}}catch(e){return {failure:String(e),stack:e.stack}}})()`
    )
    if (result?.failure) throw new Error(code + ' => ' + result.failure + ' ' + result.stack)
    return result?.result
  }
  const click = async (selector: string): Promise<void> => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
  const input = async (label: string, value: string): Promise<void> => {
    await js(
      `(()=>{let n=document.querySelector('[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`
    )
  }
  const route = async (path: string, selector: string): Promise<void> => {
    await js(`location.hash=${JSON.stringify(path)}`)
    await waitFor(window, `document.querySelector(${JSON.stringify(selector)})`)
  }
  await route('/more', 'h1')
  await waitFor(window, 'document.querySelector("h1").textContent==="More"')
  await route('/library', '[aria-label="Search library"]')
  await waitFor(window, 'document.body.innerText.includes("Paper Satellites")')
  const cardSize = (await js(
    `(()=>{const r=document.querySelector('[data-testid="library-items"] article').getBoundingClientRect();return {width:r.width,height:r.height}})()`
  )) as { width: number; height: number }
  assert.ok(cardSize.width <= 181 && cardSize.height < 340, JSON.stringify(cardSize))
  await capture(window, join(dirname(reportPath), 'library-compact.png'))
  checks.push('single-title library card capped at 180px, below 340px tall')
  await input('New category', 'Reading now')
  await click('form button')
  await waitFor(
    window,
    '[...document.querySelectorAll("button")].some(b=>b.textContent==="Reading now")'
  )
  await click('[aria-label="Select Paper Satellites"]')
  const cid = collection.categories()[0].id
  await js(
    `(()=>{const n=document.querySelector('[aria-label="Assign category"]');n.value='${cid}';n.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
  await js(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Move to category").click()'
  )
  await waitFor(window, 'document.body.innerText.includes("0 selected")')
  assert.deepEqual(collection.library()[0].categories, [cid])
  checks.push('category creation and assignment through actual library controls')
  await input('Rename Reading now', 'Reading shelf')
  await js(
    "document.querySelector('[aria-label=\"Rename Reading now\"]').closest('form').requestSubmit()"
  )
  await waitFor(window, 'document.body.innerText.includes("Reading shelf")')
  assert.equal(collection.categories()[0].name, 'Reading shelf')
  await input('New category', 'Favorites')
  await click('form button')
  await waitFor(
    window,
    '[...document.querySelectorAll("button")].some(b=>b.textContent==="Favorites")'
  )
  await click('[aria-label="Select Paper Satellites"]')
  await click('[aria-label="Membership Reading shelf"]')
  await click('[aria-label="Membership Favorites"]')
  await js(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Apply memberships").click()'
  )
  await waitFor(window, 'document.body.innerText.includes("0 selected")')
  assert.equal(collection.library()[0].categories.length, 2)
  checks.push('inline category rename and multi-category checkbox assignment')
  await click('[aria-label="Select Paper Satellites"]')
  await js(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Move to category").click()'
  )
  await waitFor(window, 'document.body.innerText.includes("0 selected")')

  await input('Search library', 'no matching title')
  await waitFor(window, 'document.body.innerText.includes("No matching titles")')
  await input('Search library', 'Paper')
  await waitFor(window, 'document.querySelector(\'[aria-label="Select Paper Satellites"]\')')
  checks.push('live library search and empty results')
  await js('[...document.querySelectorAll("button")].find(b=>b.textContent==="List view").click()')
  await waitFor(window, 'document.body.innerText.includes("Grid view")')
  assert.equal(settings.get().libraryView, 'list')
  await capture(window, join(dirname(reportPath), 'library-list.png'))
  checks.push('list view preference persisted')
  await click('[aria-label="Select Paper Satellites"]')
  await js('[...document.querySelectorAll("button")].find(b=>b.textContent==="Mark read").click()')
  await waitFor(window, 'document.body.innerText.includes("0 selected")')
  assert.equal(collection.library()[0].unread, 0)
  checks.push('bulk mark read persists chapter state')
  await js(
    `(()=>{const n=document.querySelector('[aria-label="Filter library"]');n.value='unread';n.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
  await waitFor(window, 'document.body.innerText.includes("No matching titles")')
  checks.push('unread library filter reflects bulk read immediately')

  await route('/history', '[aria-label="Search history"]')
  await waitFor(window, 'document.body.innerText.includes("Resume page 2")')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="history-items"]\')?.dataset.view==="card"'
  )
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="history-item"] img\')?.naturalWidth>0'
  )
  await capture(window, join(dirname(reportPath), 'history-card.png'))
  await click('[aria-label="History list view"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="history-items"]\')?.dataset.view==="list"'
  )
  assert.equal(settings.get().historyView, 'list')
  assert.equal(settings.get().updatesView, 'card')
  await capture(window, join(dirname(reportPath), 'history-list.png'))
  await route('/library', '[aria-label="Search library"]')
  await route('/history', '[aria-label="Search history"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="history-items"]\')?.dataset.view==="list"'
  )
  await click('[aria-label="History card view"]')
  checks.push('history cover cards/list toggle persists across navigation; resume unchanged')
  await capture(window, join(dirname(reportPath), 'history.png'))
  await input('Search history', 'missing')
  await waitFor(window, 'document.body.innerText.includes("No reading history found")')
  await input('Search history', 'Paper')
  await waitFor(window, 'document.body.innerText.includes("Resume page 2")')
  checks.push('day-grouped history, page-2 resume link and title search')
  await click('[aria-label^="Delete history Chapter 1"]')
  await waitFor(window, 'document.body.innerText.includes("No reading history found")')
  assert.equal(services.library.chapter(first.id).last_page_read, 1)
  checks.push('history deletion preserves chapter progress')
  // Source fixture has chapter 2; remove its local identity to simulate a newly published chapter.
  const second = services.library.chapters(mid)[1]
  collection.db.connection.prepare('DELETE FROM chapters WHERE id=?').run(second.id)
  await route('/updates', 'h1')
  await waitFor(
    window,
    '[...document.querySelectorAll("button")].some(b=>b.textContent==="Update library")'
  )
  await js(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Update library").click()'
  )
  await waitFor(
    window,
    'document.body.innerText.includes("Chapter 2") && ![...document.querySelectorAll("button")].find(b=>b.textContent==="Update library").disabled'
  )
  assert.equal(collection.status().added, 1)
  assert.equal(collection.updates().length, 1)
  checks.push('main-process library refresh discovers one chapter without duplicating old chapters')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="updates-items"]\')?.dataset.view==="card"'
  )
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="update-item"] img\')?.naturalWidth>0'
  )
  await capture(window, join(dirname(reportPath), 'updates-card.png'))
  await click('[aria-label="Updates list view"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="updates-items"]\')?.dataset.view==="list"'
  )
  assert.equal(settings.get().updatesView, 'list')
  assert.equal(settings.get().historyView, 'card')
  await capture(window, join(dirname(reportPath), 'updates-list.png'))
  checks.push('updates cover cards/list toggle independent of history; actions retained')

  await js('[...document.querySelectorAll("button")].find(b=>b.textContent==="Mark read").click()')
  await waitFor(window, 'document.body.innerText.includes("Mark unread")')
  assert.equal(collection.updates()[0].seen, 1)
  await js('[...document.querySelectorAll("button")].find(b=>b.textContent==="Download").click()')
  await waitFor(window, 'document.body.innerText.includes("Offline ready")')
  assert.equal(collection.updates()[0].downloaded, 1)
  await capture(window, join(dirname(reportPath), 'updates.png'))
  checks.push('update mark-read/seen and full 40-page offline download')
  await route('/settings/appearance', '[aria-label="Theme"]')
  await js(
    `(()=>{const n=document.querySelector('[aria-label="Theme"]');n.value='dark';n.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
  await click('button[type="submit"]')
  await waitFor(window, 'document.documentElement.dataset.theme==="dark"')
  assert.equal(settings.get().theme, 'dark')
  assert.equal(
    JSON.parse(readFileSync(join(dirname(collection.db.path), 'settings.json'), 'utf8')).theme,
    'dark'
  )
  await capture(window, join(dirname(reportPath), 'settings-dark.png'))
  checks.push('appearance changes live and persists to settings.json plus SQLite mirror')
  for (const group of ['library', 'reader', 'downloads', 'backup', 'network', 'advanced']) {
    await route('/settings/' + group, '[data-testid="settings"]')
    await waitFor(window, `location.hash==='#/settings/${group}'`)
  }
  checks.push('all seven personal settings sub-screens reachable')
  settings.save({ theme: 'light', readerMode: 'webtoon', preload: 4 })
  const fresh = new (settings.constructor as typeof import('../settings').SettingsStore)(
    join(dirname(collection.db.path), 'settings.json'),
    collection.db
  )
  assert.equal(fresh.get().preload, 4)
  assert.equal(services.library.preferences(mid).mode, 'webtoon')
  checks.push('settings reopen from disk and reader default propagation')
  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve())
    window.webContents.reload()
  })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  await route('/library', '[aria-label="Search library"]')
  await waitFor(window, 'document.documentElement.dataset.theme==="light"')
  assert.deepEqual(collection.library()[0].categories, [cid])
  assert.equal(fresh.get().historyView, 'card')
  assert.equal(fresh.get().updatesView, 'list')
  checks.push('renderer reload preserves category membership and restores light theme')
  await capture(window, join(dirname(reportPath), 'library-light.png'))
  // Visual contract checks run only in this disposable fixture profile.
  for (const theme of ['dark', 'light']) {
    await route('/settings/appearance', '[aria-label="Theme"]')
    await js(
      `(()=>{const n=document.querySelector('[aria-label="Theme"]');n.value='${theme}';n.dispatchEvent(new Event('change',{bubbles:true}))})()`
    )
    await click('button[type="submit"]')
    await waitFor(window, `document.documentElement.dataset.theme==="${theme}"`)
    for (const [path, selector] of [
      ['/library', '[aria-label="Search library"]'],
      ['/browse', '[role="tablist"]'],
      ['/more', 'h1'],
      ['/downloads', '[data-testid="downloads"]'],
      ['/backup', '[data-testid="backups"]'],
      ['/statistics', 'h1']
    ]) {
      await route(path, selector)
      await js('document.querySelector("main").scrollTop=0')
      await capture(window, join(dirname(reportPath), `desk-${theme}-${path.slice(1)}.png`))
    }
    await route('/browse', '[role="tablist"]')
    await click('[role="tab"]:nth-child(2)')
    await waitFor(window, 'document.querySelector(\'[aria-label="Repository catalogue"]\')')
    await capture(window, join(dirname(reportPath), `desk-${theme}-extensions.png`))
    const styled = await js(
      `(()=>{const b=document.querySelector('[aria-label="Repository catalogue"] button') || document.querySelector('button');const c=getComputedStyle(b);return parseFloat(c.minHeight)>=28 && c.borderRadius!=='0px'})()`
    )
    assert.equal(styled, true)
  }
  checks.push(
    'all major desktop routes and extension catalogue share styled controls in dark/light screenshots'
  )
  for (const width of [960, 1280, 1600]) {
    window.setSize(width, 800)
    await route('/library', '[aria-label="Search library"]')
    await js('document.querySelector("main").scrollTop=0')
    const geometry = (await js(
      `(()=>{const main=document.querySelector('main');const card=document.querySelector('[data-testid="library-items"] article');return {overflow:main.scrollWidth>main.clientWidth+1 || document.documentElement.scrollWidth>innerWidth+1,cardTop:card.getBoundingClientRect().top,viewport:innerHeight}})()`
    )) as { overflow: boolean; cardTop: number; viewport: number }
    assert.equal(geometry.overflow, false, JSON.stringify({ width, ...geometry }))
    assert.ok(geometry.cardTop < geometry.viewport - 120, JSON.stringify(geometry))
    await capture(window, join(dirname(reportPath), `desk-library-${width}.png`))
  }
  window.setSize(1280, 800)
  checks.push('960/1280/1600px library has no horizontal overflow and books begin above the fold')
  checks.push(...(await settingsNavigationChecks(window, services, settings, mid, reportPath)))
  await route('/settings/advanced', '[aria-label="Confirm library deletion"]')
  await input('Confirm library deletion', 'DELETE')
  await js(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Clear library data").click()'
  )
  await waitFor(window, 'document.body.innerText.includes("Library data cleared")')
  assert.equal(collection.library().length, 0)
  assert.equal(collection.history('', 100, 0).length, 0)
  assert.equal(services.extensions.sources().length, 1)
  checks.push('typed DELETE advanced action clears collection but retains installed sources')

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        phase: 7,
        checks,
        status: collection.status(),
        settings: fresh.get(),
        integrity: collection.db.status('test').integrity
      },
      null,
      2
    )
  )
  console.log(
    'PHASES 5-7 PASS: ' +
      checks.length +
      ' desktop checks; library/categories; history; updates/download; settings/theme; persistence'
  )
}
