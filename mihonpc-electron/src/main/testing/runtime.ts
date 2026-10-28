import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { ReadingServices } from '../services'
import type { SourceInfo, MangasPage } from '../../shared/source'
import { waitFor, capture } from './flow'

/** Opt-in LIVE network proof, deliberately separate from offline fixture tests. */
export async function runtimeFlow(
  window: BrowserWindow,
  services: ReadingServices,
  report: string
): Promise<void> {
  mkdirSync(dirname(report), { recursive: true })
  await waitFor(window, 'document.querySelector(\'[data-ready="true"]\')')
  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> =>
    window.webContents.executeJavaScript(
      `window.electron.invoke(${JSON.stringify(channel)},...${JSON.stringify(args)})`
    ) as Promise<T>
  const repo = 'https://github.com/keiyoushi/extensions/raw/repo/index.pb',
    pkg = 'eu.kanade.tachiyomi.extension.all.xkcd'
  await invoke('repos:add', repo)
  await invoke('repos:install', pkg)
  const sources = await invoke<SourceInfo[]>('source:getAll'),
    source = sources.find((s) => s.lang === 'en' && s.name === 'xkcd')
  assert.ok(source)
  assert.ok(Number.isSafeInteger(source.id))
  assert.ok(source.id >= 4000000000000)
  const catalogue = await invoke<MangasPage>('source:getPopular', source.id, 1)
  assert.ok(catalogue.mangas.length)
  const id = await invoke<number>('manga:open', source.id, catalogue.mangas[0])
  const detail = services.library.detail(id)
  assert.ok(detail.chapters.length)
  const first = detail.chapters[detail.chapters.length - 1]
  const session = await services.reader(first.id, true)
  assert.ok(session.pages.length)
  const image = await invoke<string>('reader:image', first.id, 0)
  assert.match(image, /^data:image\//)
  for (let index = 1; index < session.pages.length; index++) await services.page(first.id, index)
  await window.webContents.executeJavaScript("location.hash='/browse'")
  await waitFor(window, 'document.querySelector(\'[data-testid="browse"]\')')
  await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role="tab"]')].find(t=>t.textContent.trim().startsWith('Sources')).click();[...document.querySelectorAll('button')].find(t=>t.textContent.includes('Reload extensions')).click();document.querySelector('main').scrollTop=0`
  )
  await waitFor(window, `document.querySelector('a[href="#/source/${source.id}"]')`)

  await waitFor(
    window,
    'document.querySelector(\'[data-brand-kind="extension"] img\')?.naturalWidth>0'
  )
  assert.equal(
    await window.webContents.executeJavaScript(
      `document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim().startsWith('Sources')`
    ),
    true
  )
  await capture(window, join(dirname(report), 'live-sources.png'))
  const logo = await invoke<string | null>('extensions:icon', pkg)
  assert.match(logo ?? '', /^data:image\//)
  assert.equal(await invoke('extensions:icon', 'not.configured.package'), null)
  await window.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role="tab"]')].find(t=>t.textContent.trim().startsWith('Extensions')).click()`
  )
  await waitFor(window, 'document.querySelector(\'[aria-label="Search repository extensions"]\')')
  await window.webContents.executeJavaScript(
    `(()=>{const n=document.querySelector('[aria-label="Search repository extensions"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'xkcd');n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Repository catalogue"]').scrollIntoView()})()`
  )
  await waitFor(
    window,
    'document.querySelector(\'[data-brand-kind="repository"] img\')?.naturalWidth>0'
  )
  await waitFor(
    window,
    'document.querySelector(\'[aria-label="Repository catalogue"] [data-brand-kind="extension"] img\')?.naturalWidth>0'
  )
  await capture(window, join(dirname(report), 'live-extension-icons.png'))
  const available =
    await invoke<{ pkgName: string; name: string; installed: boolean; isNsfw: boolean }[]>(
      'repos:extensions'
    )
  const uninstalled = available.find(
    (e) =>
      !e.installed && !e.isNsfw && e.name.toLowerCase().replace(/\s/g, '').includes('comicgrowl')
  )
  assert.ok(uninstalled)
  assert.match(await invoke<string>('extensions:icon', uninstalled.pkgName), /^data:image\//)
  await window.webContents.executeJavaScript(
    `(()=>{const n=document.querySelector('[aria-label="Search repository extensions"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(uninstalled.name)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`
  )
  await waitFor(
    window,
    `document.querySelector('[data-brand-id="${uninstalled.pkgName}"] img')?.naturalWidth>0`
  )
  await capture(window, join(dirname(report), 'live-available-icon.png'))
  console.log(
    'ICONS PASS: source, repository, installed and uninstalled extension logos decoded; unknown package rejected'
  )
  await window.webContents.executeJavaScript(`location.hash='/source/${source.id}'`)
  await waitFor(window, 'document.querySelector(\'[aria-label="Open xkcd"]\')')
  await capture(window, join(dirname(report), 'live-catalogue.png'))
  await window.webContents.executeJavaScript(`location.hash='/reader/${first.id}'`)
  await waitFor(
    window,
    '[...document.querySelectorAll("img")].some(i=>i.src.startsWith("data:image/")&&i.naturalWidth>0)'
  )
  await capture(window, join(dirname(report), 'live-reader.png'))
  writeFileSync(
    report,
    JSON.stringify(
      {
        runtime: 'Suwayomi v2.4.2366',
        repository: repo,
        extension: pkg,
        source,
        catalogue,
        chapters: detail.chapters.length,
        pageCount: session.pages.length,
        imagePrefix: image.slice(0, 40),
        imageBytes: Buffer.from(image.split(',')[1], 'base64').length,
        checks: [
          'real repository protobuf index',
          'repository-provided JVM extension installed',
          '64-bit source ID preserved via persistent alias',
          'live catalogue and chapters',
          'real image through isolated preload',
          'reader rendered real comic',
          'actual source, repository and available extension icons decoded; unconfigured package rejected'
        ],
        note: 'Repository installation uses its published JVM artifact when available. Raw xkcd APK conversion separately failed JVM VerifyError; no universal APK compatibility claimed.'
      },
      null,
      2
    )
  )
  console.log(
    'RUNTIME PASS: real repository; xkcd installed; live catalogue/chapters/image; Electron reader rendered'
  )
}
