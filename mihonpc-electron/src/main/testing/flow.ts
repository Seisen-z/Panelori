import { app, clipboard, ClipboardItem, nativeImage, type BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join, dirname } from 'node:path'
import type { ReadingServices } from '../services'
export interface Fixture {
  server: Server
  requests: string[]
  failures: Set<string>
  close: () => Promise<void>
}
export async function startFixture(directory: string, fixturePath: string): Promise<Fixture> {
  const requests: string[] = []
  const failures = new Set<string>()
  const server = createServer((req, res) => {
    requests.push(req.url ?? '')
    if (failures.has(req.url ?? '')) {
      res.writeHead(503)
      res.end('Fixture retry test')
      return
    }
    const path = new URL(req.url ?? '/', 'http://fixture').pathname
    if (!path.startsWith('/images/') || req.headers['x-image-key'] !== 'fixture') {
      res.writeHead(403)
      res.end('Missing image header')
      return
    }
    try {
      res.setHeader('Content-Type', 'image/png')
      res.end(readFileSync(join(fixturePath, 'images', basename(path))))
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture address')
  const code = readFileSync(join(fixturePath, 'demo.js'), 'utf8').replaceAll(
    '__BASE_URL__',
    'http://127.0.0.1:' + address.port
  )
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'demo.js'), code)
  return {
    server,
    requests,
    failures,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
export async function waitFor(window: BrowserWindow, expression: string): Promise<void> {
  await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
    const limit=Date.now()+20000;
    const check=()=>{try{if(${expression})return resolve()}catch{}
      if(Date.now()>limit)return reject(new Error('UI wait timed out: '+${JSON.stringify(expression)}));setTimeout(check,40)};
    check();
  })`)
}
export async function capture(window: BrowserWindow, path: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150))
  writeFileSync(path, (await window.webContents.capturePage()).toPNG())
}
async function searchInput(window: BrowserWindow, label: string, value: string): Promise<void> {
  const selector = JSON.stringify('[aria-label="' + label + '"]')
  await window.webContents.executeJavaScript(
    `(()=>{const node=document.querySelector(${selector});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}))})()`
  )
  await window.webContents.executeJavaScript(
    'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'
  )
  await window.webContents.executeJavaScript(
    `document.querySelector(${selector}).closest('form').requestSubmit()`
  )
}
export async function phase3Flow(
  window: BrowserWindow,
  services: ReadingServices,
  reportPath: string,
  fixture: Fixture
): Promise<{ mangaId: number; chapterId: number; checks: string[] }> {
  mkdirSync(dirname(reportPath), { recursive: true })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  await window.webContents.executeJavaScript("location.hash='/browse'")
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="browse"]\') && document.body.innerText.includes("Paper Shelf")'
  )
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[aria-label="Pin Paper Shelf"]\').click()'
  )
  await searchInput(window, 'Search pinned sources', 'Paper')
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Paper Satellites"]\')')
  await window.webContents.executeJavaScript(
    'document.querySelector(\'a[href="#/source/7001"]\').click()'
  )
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Paper Satellites"]\')')
  await window.webContents.executeJavaScript(
    'document.querySelector("main").scrollTop=document.querySelector("main").scrollHeight'
  )
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Harbor Light"]\')')
  await searchInput(window, 'Search this source', 'Harbor')
  await waitFor(
    window,
    'document.querySelector(\'[aria-label="Open Harbor Light"]\') && !document.querySelector(\'[aria-label="Open Paper Satellites"]\')'
  )
  await searchInput(window, 'Search this source', '')
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Paper Satellites"]\')')
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Filters").click()'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("label")].find(label=>label.textContent.includes("Only Harbor")).querySelector("input").click()'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Apply filters").click()'
  )
  await waitFor(
    window,
    'document.querySelector(\'[aria-label="Open Harbor Light"]\') && !document.querySelector(\'[aria-label="Open Paper Satellites"]\')'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Filters").click()'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("label")].find(label=>label.textContent.includes("Only Harbor")).querySelector("input").click()'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Apply filters").click()'
  )
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Paper Satellites"]\')')
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Latest").click()'
  )
  await waitFor(
    window,
    'document.querySelector(\'[aria-label="Open Harbor Light"]\') && !document.querySelector(\'[aria-label="Open Paper Satellites"]\')'
  )
  await window.webContents.executeJavaScript(
    '[...document.querySelectorAll("button")].find(button=>button.textContent==="Popular").click();document.querySelector("main").scrollTop=0'
  )
  await waitFor(window, 'document.querySelector(\'[aria-label="Open Paper Satellites"]\')')
  await capture(window, join(dirname(reportPath), 'catalog.png'))
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[aria-label="Open Paper Satellites"]\').click()'
  )
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="manga-detail"]\') && document.querySelector("h1")?.textContent==="Paper Satellites"'
  )
  await window.webContents.executeJavaScript(
    "[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Add to library')).click()"
  )
  await waitFor(window, 'document.body.innerText.includes("In library")')
  const manga = services.library.manga(1),
    chapters = services.library.chapters(manga.id)
  assert.equal(manga.favorite, 1)
  assert.equal(chapters.length, 2)
  await services.refresh(manga.id)
  assert.equal(services.library.manga(manga.id).favorite, 1)
  assert.equal(services.library.chapters(manga.id)[0].id, chapters[0].id)
  await waitFor(
    window,
    'document.querySelectorAll("img").length>0 && [...document.querySelectorAll("img")].every(image=>image.complete&&image.naturalWidth>0)'
  )
  await capture(window, join(dirname(reportPath), 'manga-detail.png'))
  const checks = [
    'Browse lists installed source',
    'catalogue renders source results',
    'pinned global search, infinite pagination, source search, filters and latest/popular controls',
    'manga detail opens via real card click',
    'Add to library persists',
    'chapters persisted with stable IDs across refresh',
    'cover image decoded through main-process proxy'
  ]
  assert.ok(fixture.requests.some((url) => url.includes('cover-a.png')))
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        phase: 3,
        checks,
        mangaId: manga.id,
        chapterId: chapters[0].id,
        requests: fixture.requests
      },
      null,
      2
    )
  )
  console.log(
    'PHASE 3 PASS: Browse → Manga Detail → Add to library; stable chapter IDs; proxied cover decoded'
  )
  return { mangaId: manga.id, chapterId: chapters[0].id, checks }
}

export async function phase4Flow(
  window: BrowserWindow,
  services: ReadingServices,
  reportPath: string,
  fixture: Fixture
): Promise<void> {
  const { mangaId, chapterId, checks } = await phase3Flow(window, services, reportPath, fixture)
  const run = async (code: string): Promise<unknown> => window.webContents.executeJavaScript(code)
  const click = async (selector: string): Promise<void> => {
    await run('document.querySelector(' + JSON.stringify(selector) + ').click()')
  }
  const key = async (value: string): Promise<void> => {
    await run(
      'document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:' +
        JSON.stringify(value) +
        ',bubbles:true}))'
    )
  }
  const select = async (label: string, value: string): Promise<void> => {
    await run(
      '(()=>{const node=document.querySelector(' +
        JSON.stringify('[aria-label="' + label + '"]') +
        ');node.value=' +
        JSON.stringify(value) +
        ';node.dispatchEvent(new Event("change",{bubbles:true}))})()'
    )
    await new Promise((resolve) => setTimeout(resolve, 70))
  }
  const seek = async (value: number): Promise<void> => {
    await run(
      `(()=>{const node=document.querySelector('[aria-label="Page progress"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${value});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))})()`
    )
  }
  const saved = async (page: number, chapter = chapterId): Promise<void> =>
    waitFor(
      window,
      'document.querySelector(\'[data-testid="reader"]\')?.getAttribute("data-chapter-id")===' +
        JSON.stringify(String(chapter)) +
        ' && document.querySelector(\'[data-testid="reader"]\')?.getAttribute("data-saved")===' +
        JSON.stringify(String(page))
    )
  await click('a[href="#/reader/' + chapterId + '"]')
  await saved(0)
  await capture(window, join(dirname(reportPath), 'reader-pager.png'))
  await run('document.querySelector(\'[aria-label="Next page"]\').focus()')
  await key('ArrowRight')
  await saved(1)
  assert.equal(services.library.chapter(chapterId).last_page_read, 1)
  checks.push('pager keyboard navigation and progress saved after image decode')
  await click('[aria-label="Back to manga"]')
  await waitFor(window, 'document.querySelector(\'[data-testid="manga-detail"]\')')
  await click('a[href="#/reader/' + chapterId + '"]')
  await saved(1)
  checks.push('reader resume restores saved page')
  await click('[aria-label="Reader settings"]')
  await select('Reading mode', 'vertical')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.getAttribute("data-mode")==="vertical"'
  )
  await key('ArrowDown')
  await saved(2)
  await select('Reading direction', 'rtl')
  await click('[aria-label="Close reader settings"]')
  await key('ArrowLeft')
  await saved(3)
  assert.equal(services.library.chapter(chapterId).read, 1)
  checks.push('vertical pager, RTL keys and chapter completion')
  const chapter2 = services.library.chapters(mangaId)[1].id
  await click('[aria-label="Next chapter"]')
  await saved(0, chapter2)
  await click('[aria-label="Previous chapter"]')
  await saved(3)
  checks.push('previous/next chapter navigation')
  await click('[aria-label="Reader settings"]')
  await select('Reading mode', 'webtoon')
  await select('Reading direction', 'ltr')
  await select('Zoom', '1.25')
  await run(
    "[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Use as global defaults')).click()"
  )
  await waitFor(window, 'document.body.innerText.includes("Default reader preferences saved")')
  await click('[aria-label="Close reader settings"]')
  await key('Home')
  await saved(0)
  await capture(window, join(dirname(reportPath), 'reader-webtoon.png'))
  assert.equal(services.library.preferences(mangaId).mode, 'webtoon')
  assert.equal(services.library.preferences(mangaId).zoom, 1.25)
  checks.push('webtoon mode and per-manga/global reader preferences persist')
  await click('[aria-label="Next chapter"]')
  await saved(0, chapter2)
  await key('End')
  await saved(39, chapter2)
  const rendered = (await run('document.querySelectorAll("[data-page-index]").length')) as number
  assert.ok(rendered < 10, 'webtoon should virtualize its 40-page chapter')
  checks.push('40-page continuous reader virtualizes its visible pages')
  await click('[aria-label="Reader settings"]')
  await select('Preload pages', '0')
  await click('[aria-label="Close reader settings"]')
  fixture.failures.add('/images/page-1.png?i=20')
  await seek(21)
  await waitFor(
    window,
    '[...document.querySelectorAll("button")].some(button=>button.textContent==="Retry page 21")'
  )
  fixture.failures.clear()
  await run(
    "[...document.querySelectorAll('button')].find(button=>button.textContent==='Retry page 21').click()"
  )
  await saved(20, chapter2)
  assert.ok(fixture.requests.filter((url) => url === '/images/page-1.png?i=20').length >= 2)
  checks.push('failed image displays retry and recovers')
  await run('window.electron.invoke("reader:saveImage",' + chapter2 + ',20)')
  const savedBytes = readFileSync(join(app.getPath('userData'), 'saved-page.png'))
  assert.ok(savedBytes.length > 1000 && !nativeImage.createFromBuffer(savedBytes).isEmpty())
  const original: Electron.ClipboardItem[] = []
  for (const item of await clipboard.read()) {
    const data: Record<string, Blob | Electron.ClipboardBookmark> = {}
    for (const type of item.types) data[type] = await item.getType(type)
    original.push(new ClipboardItem(data))
  }
  try {
    await run('window.electron.invoke("reader:copyImage",' + chapter2 + ',20)')
    const items = await clipboard.read()
    assert.ok(items.some((item) => item.types.includes('image/png')))
  } finally {
    await clipboard.write(original)
  }
  checks.push('page save handler and PNG clipboard copy (clipboard restored)')
  await key('f')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.getAttribute("data-fullscreen")==="true"'
  )
  assert.equal(window.isFullScreen(), true)
  await key('f')
  await waitFor(
    window,
    'document.querySelector(\'[data-testid="reader"]\')?.getAttribute("data-fullscreen")==="false"'
  )
  assert.equal(window.isFullScreen(), false)
  checks.push('full-screen toggle')
  await fixture.close()
  await services.extensions.setEnabled('en.mihonpc-fixture', false)
  const requests = fixture.requests.length
  await click('[aria-label="Back to manga"]')
  await waitFor(window, 'document.querySelector(\'[data-testid="manga-detail"]\')')
  await click('a[href="#/reader/' + chapter2 + '"]')
  await saved(20, chapter2)
  await waitFor(
    window,
    '[...document.querySelectorAll("img")].some(image=>image.complete&&image.naturalWidth>0)'
  )
  assert.equal(fixture.requests.length, requests)
  checks.push('offline reopen uses persisted page list and disk images with extension disabled')
  await capture(window, join(dirname(reportPath), 'reader-offline.png'))
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        phase: 4,
        checks,
        mangaId,
        chapterId,
        chapter2,
        renderedWebtoonPages: rendered,
        lastPage: services.library.chapter(chapter2).last_page_read,
        preferences: services.library.preferences(mangaId),
        offline: true,
        requests: fixture.requests
      },
      null,
      2
    )
  )
  console.log(
    'PHASE 4 PASS: pager/vertical/RTL/webtoon; resume/history; 40-page virtualization; retry; save/copy; full screen; offline disk cache'
  )
}
