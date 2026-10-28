import type { BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import type { ReadingServices } from '../services'
import type { SettingsStore } from '../settings'
import { waitFor, capture } from './flow'
export async function settingsNavigationChecks(
  window: BrowserWindow,
  services: ReadingServices,
  settings: SettingsStore,
  mid: number,
  reportPath: string
): Promise<string[]> {
  const checks: string[] = []
  const js = async (code: string): Promise<unknown> =>
    window.webContents.executeJavaScript(
      `(async()=>{const v=await (${code});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return v})()`
    )
  const click = async (selector: string): Promise<void> => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
  const route = async (path: string, title: string): Promise<void> => {
    await js(`location.hash=${JSON.stringify(path)}`)
    await waitFor(window, `document.querySelector('h1')?.textContent===${JSON.stringify(title)}`)
    await js('document.querySelector("main").scrollTop=0')
  }
  const set = async (label: string, value: string): Promise<void> => {
    await js(
      `(()=>{const n=document.querySelector('[aria-label="${label}"]');const proto=n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`
    )
  }
  const groups = [
    ['appearance', 'Appearance'],
    ['library', 'Library'],
    ['reader', 'Reader'],
    ['downloads', 'Downloads'],
    ['backup', 'Backup'],
    ['browse', 'Browse'],
    ['network', 'Network'],
    ['advanced', 'Advanced']
  ]
  for (const [id, title] of groups) {
    await route('/settings/' + id, title)
    assert.equal(await js(`!!document.querySelector('[aria-label="Back to More"]')`), true)
    assert.equal(
      await js(
        `document.querySelector('nav[aria-label="More navigation"] a[aria-current="page"]')?.textContent`
      ),
      title
    )
    await capture(window, join(dirname(reportPath), 'settings-' + id + '.png'))
  }
  checks.push(
    'eight settings pages have common More Back control, active section rail and screenshots'
  )
  for (const [path, title] of [
    ['/backup', 'Backup & Restore'],
    ['/downloads', 'Downloads'],
    ['/statistics', 'Statistics'],
    ['/about', 'About MihonPC']
  ]) {
    await route(path, title)
    await click('[aria-label="Back to More"]')
    await waitFor(window, `document.querySelector('h1')?.textContent==='More'`)
  }
  await capture(window, join(dirname(reportPath), 'more-relayout.png'))
  checks.push('backup, downloads, statistics and about each return to More')
  await route('/settings/appearance', 'Appearance')
  const nextTheme = settings.get().theme === 'dark' ? 'light' : 'dark'
  await set('Theme', nextTheme)
  await js('(window.confirm=()=>false,true)')
  await click('[aria-label="Back to More"]')
  assert.equal(await js('location.hash'), '#/settings/appearance')
  await js(`window.electron.invoke('settings:set',{preload:9})`)
  await click('button[type="submit"]')
  await waitFor(window, 'document.body.innerText.includes("Settings saved")')
  assert.equal(settings.get().theme, nextTheme)
  assert.equal(settings.get().preload, 9)
  await js('(window.confirm=()=>true,true)')
  checks.push(
    'unsaved navigation is guarded; saving edited Theme does not overwrite an externally changed preload setting'
  )
  // Return to Library with its actual search/filter/category state rather than hardcoded Browse.
  await route('/library', 'Library')
  await set('Search library', 'Paper')
  await set('Filter library', 'all')
  await click('[aria-label="Open Paper Satellites"]')
  await waitFor(
    window,
    `document.querySelector('[data-testid="manga-detail"]') && document.querySelector('h1')?.textContent==='Paper Satellites'`
  )
  assert.equal(
    await js(`document.querySelector('[aria-label="Back to Library"]')?.getAttribute('href')`),
    '#/library'
  )
  await click('[aria-label="Back to Library"]')
  await waitFor(window, '!!document.querySelector(\'[aria-label="Search library"]\')')
  assert.equal(await js(`document.querySelector('[aria-label="Search library"]').value`), 'Paper')
  checks.push('Library detail Back returns to Library and preserves search/filter state')
  await route('/source/7001?feed=latest', 'Paper Shelf')
  await waitFor(window, '!!document.querySelector(\'button[aria-label^="Open "]\')')
  await click('button[aria-label^="Open "]')
  await waitFor(window, '!!document.querySelector(\'[data-testid="manga-detail"]\')')
  assert.equal(
    await js(`document.querySelector('[aria-label="Back to catalogue"]')?.getAttribute('href')`),
    '#/source/7001?feed=latest'
  )
  await click('[aria-label="Back to catalogue"]')
  await waitFor(window, `location.hash==='#/source/7001?feed=latest'`)
  checks.push('source detail Back preserves catalogue origin and Latest feed query')
  await route('/settings/browse', 'Browse')
  await click('[aria-label="Hide titles already in Library"]')
  await click('button[type="submit"]')
  await waitFor(window, 'document.body.innerText.includes("Settings saved")')
  assert.equal(settings.get().hideInLibrary, true)
  await route('/source/7001', 'Paper Shelf')
  await waitFor(
    window,
    'document.body.innerText.includes("already in your library") || document.querySelector(\'button[aria-label^="Open "]\')'
  )
  assert.equal(
    await js(`!!document.querySelector('button[aria-label="Open Paper Satellites"]')`),
    false
  )
  await route('/settings/browse', 'Browse')
  await click('[aria-label="Hide titles already in Library"]')
  await click('button[type="submit"]')
  await waitFor(window, 'document.body.innerText.includes("Settings saved")')
  checks.push(
    'Browse Hide in Library preference filters actual catalogue without removing saved manga'
  )
  await route('/settings/browse', 'Browse')
  await click('[aria-label="Show NSFW sources and extensions"]')
  await click('button[type="submit"]')
  await waitFor(window, 'document.body.innerText.includes("Settings saved")')
  await route('/browse', 'Browse')
  assert.equal(
    await js(`document.querySelector('[role="tablist"] input[type="checkbox"]').checked`),
    true
  )
  await route('/library', 'Library')
  await route('/browse', 'Browse')
  assert.equal(
    await js(`document.querySelector('[role="tablist"] input[type="checkbox"]').checked`),
    true
  )
  await click('[role="tablist"] input[type="checkbox"]')
  await waitFor(
    window,
    '!document.querySelector(\'[role="tablist"] input[type="checkbox"]\').checked'
  )
  assert.equal(settings.get().showNsfw, false)
  checks.push(
    'NSFW visibility saves from settings, survives Browse navigation and updates from the Browse toggle'
  )
  await route('/settings/reader', 'Reader')
  await set('Default reading mode', 'pager')
  await set('Pager image fit', 'width')
  await click('[aria-label="Open reader full screen"]')
  await click('button[type="submit"]')
  await waitFor(window, 'document.body.innerText.includes("Settings saved")')
  services.library.setPreferences(
    mid,
    { mode: 'pager', direction: 'ltr', preload: 2, zoom: 1 },
    false
  )
  await route('/library', 'Library')
  await click('[aria-label="Open Paper Satellites"]')
  await waitFor(window, '!!document.querySelector(\'[data-testid="manga-detail"]\')')
  const chapter = services.library.chapters(mid)[0]
  await click('a[href="#/reader/' + chapter.id + '"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.dataset.fullscreen==="true"'
  )
  await waitFor(window, 'document.querySelector(\'[data-testid="pager"] img\')?.naturalWidth>0')
  assert.equal(await js(`document.querySelector('[data-testid="pager"] img').style.width`), '96vw')
  await click('[aria-label="Toggle full screen"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.dataset.fullscreen==="false"'
  )
  await click('[aria-label="Toggle full screen"]')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.dataset.fullscreen==="true"'
  )
  await click('[aria-label="Next chapter"]')
  await waitFor(
    window,
    `document.querySelector('[data-testid="reader"]')?.dataset.chapterId!=='${chapter.id}' && document.querySelector('[data-testid="pager"] img')?.naturalWidth>0`
  )
  assert.equal(
    await js(`document.querySelector('[data-testid="reader"]').dataset.fullscreen`),
    'true'
  )
  await click('[aria-label="Toggle full screen"]')
  const toggle = async (): Promise<void> => {
    await js(
      `(()=>{const n=document.querySelector('[data-testid="pager"]');for(const type of ['pointerdown','pointerup'])n.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,clientX:innerWidth/2,clientY:innerHeight/2}))})()`
    )
  }
  await toggle()
  await waitFor(window, '!!document.querySelector(\'[data-testid="reader-page-number"]\')')
  await toggle()
  await click('[aria-label="Reader settings"]')
  await click('[aria-label="Show page number"]')
  await click('[aria-label="Close reader settings"]')
  await toggle()
  assert.equal(await js(`!!document.querySelector('[data-testid="reader-page-number"]')`), false)
  await toggle()
  await capture(window, join(dirname(reportPath), 'reader-fit-width.png'))
  await click('[aria-label="Back to manga"]')
  await waitFor(window, '!!document.querySelector(\'[data-testid="manga-detail"]\')')
  await click('[aria-label="Back to Library"]')
  await waitFor(window, '!!document.querySelector(\'[aria-label="Search library"]\')')
  assert.equal(window.isFullScreen(), false)
  checks.push(
    'saved fullscreen first toggle, adjacent chapter persistence, fit width, hidden-controls page number and reader-detail-Library return chain work'
  )
  // Restore test defaults before the caller's final cleanup.
  settings.save({
    fullscreen: false,
    imageFit: 'screen',
    showPageNumber: true,
    hideInLibrary: false
  })
  await route('/history', 'History')
  await waitFor(window, '!!document.querySelector(\'[aria-label="Resume Paper Satellites"]\')')
  await click('[aria-label="Resume Paper Satellites"]')
  await waitFor(window, '!!document.querySelector(\'[aria-label="Back to History"]\')')
  await click('[aria-label="Back to History"]')
  await waitFor(window, 'document.querySelector("h1")?.textContent==="History"')
  checks.push('History reader shortcut returns to History rather than forcing manga or Browse')
  for (const width of [960, 1280]) {
    window.setSize(width, 800)
    await route('/settings/appearance', 'Appearance')
    assert.equal(
      await js(
        `document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+1`
      ),
      false
    )
    const size = (await js(
      `document.querySelector('form').getBoundingClientRect().width`
    )) as number
    assert.ok(size <= 861, 'bounded settings content: ' + size)
    await capture(window, join(dirname(reportPath), 'settings-width-' + width + '.png'))
  }
  checks.push('More settings remain bounded to860px and do not overflow at960/1280px')
  return checks
}
