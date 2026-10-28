import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExtensionManager } from '../extensions/manager'
import { ExtensionHost } from '../extensions/host'
import { HttpBroker } from '../extensions/network'
import type { AppDatabase } from '../db'

export async function testExtensions(
  db: AppDatabase,
  preload: string,
  reportPath: string
): Promise<void> {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url ?? '')
    if (req.url === '/extension.js') {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(code.replace("version:'1.0.0'", "version:'1.2.0'"))
      return
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/cookie', 'Set-Cookie': 'test=yes; Path=/' })
      res.end()
      return
    }
    if (req.url === '/cookie') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ cookie: req.headers.cookie, custom: req.headers['x-test'] }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  const base = 'http://127.0.0.1:' + address.port
  const directory = mkdtempSync(join(tmpdir(), 'mihon-extensions-'))
  const code = `
    module.exports.extensionMeta = {id:'test.phase2',name:'Test Extension',version:'1.0.0',lang:'en',nsfw:false};
    module.exports.default = class Test {
      id=123; name='Test Source'; lang='en'; baseUrl=${JSON.stringify(base)}; supportsLatest=true;
      async getPopularManga(page){ return {mangas:[{url:'/manga/a',title:'Test',status:1}],hasNextPage:page===1} }
      async getLatestUpdates(page){ return this.getPopularManga(page) }
      async searchManga(page,query){ const data=await fetch(this.baseUrl+'/redirect',{headers:{'X-Test':'present'}}).then(r=>r.json());return {mangas:[{url:'/test',title:JSON.stringify({data,node:typeof require,process:typeof process,bridge:typeof window.electron,buffer:Buffer.from('hello').toString('base64')}),status:0}],hasNextPage:false} }
      async getMangaDetails(manga){return {...manga,description:'Details'} }
      async getChapterList(){return [{url:'/chapter/1',name:'Chapter 1',dateUpload:1,chapterNumber:1}]}
      async getPageList(){return [{index:0,url:this.baseUrl+'/1.png',imageUrl:this.baseUrl+'/1.png'}]}
      getFilters(){return [{type:'text',name:'Author',state:''}]}
    }`
  writeFileSync(join(directory, 'valid.js'), code)
  writeFileSync(join(directory, 'broken.js'), 'throw new Error("broken fixture")')
  const manager = new ExtensionManager(directory, preload, db, true)
  const checks: string[] = []
  try {
    await manager.reload()
    assert.equal(manager.all().length, 2)
    assert.equal(manager.sources().length, 1, JSON.stringify(manager.all()))
    assert.ok(manager.all().some((e) => e.error?.includes('broken fixture')))
    checks.push('broken extension skipped; valid extension loaded')
    assert.equal((await manager.catalogue(123, 'getPopularManga', [1])).hasNextPage, true)
    assert.equal((await manager.catalogue(123, 'getLatestUpdates', [2])).hasNextPage, false)
    assert.equal(
      (await manager.details(123, { url: '/manga/a', title: 'Test', status: 1 })).description,
      'Details'
    )
    assert.equal(
      (await manager.chapters(123, { url: '/manga/a', title: 'Test', status: 1 })).length,
      1
    )
    assert.equal(
      (
        await manager.pages(123, {
          url: '/chapter/1',
          name: 'Chapter 1',
          dateUpload: 1,
          chapterNumber: 1
        })
      ).length,
      1
    )
    assert.equal((await manager.filters(123))[0].name, 'Author')
    checks.push('all Source methods and pagination')
    const search = await manager.catalogue(123, 'searchManga', [1, 'test', []])
    const proof = JSON.parse(search.mangas[0].title) as {
      data: { cookie: string; custom: string }
      node: string
      process: string
      bridge: string
      buffer: string
    }
    assert.equal(proof.data.cookie, 'test=yes')
    assert.equal(proof.data.custom, 'present')
    assert.equal(proof.node, 'undefined')
    assert.equal(proof.process, 'undefined')
    assert.equal(proof.bridge, 'undefined')
    assert.equal(proof.buffer, 'aGVsbG8=')
    checks.push('fetch shim redirects/cookies/custom headers; Node and app IPC hidden')
    await manager.setEnabled('test.phase2', false)
    assert.equal(manager.sources().length, 0)
    await assert.rejects(() => manager.catalogue(123, 'getPopularManga', [1]), /unavailable/)
    writeFileSync(
      join(directory, 'valid.js'),
      'throw new Error("disabled extension must not execute")'
    )
    await manager.reload()
    assert.equal(manager.sources().length, 0)
    assert.equal(manager.all().find((entry) => entry.id === 'test.phase2')?.error, undefined)
    writeFileSync(join(directory, 'valid.js'), code)
    await manager.setEnabled('test.phase2', true)
    assert.equal(manager.sources().length, 1)
    checks.push('disable/enable persists across reload; disabled code is not executed')
    const local = new HttpBroker(false)
    await assert.rejects(() => local.request(base), /Private network/)
    await assert.rejects(
      () => new HttpBroker(true).request(base, {}, ['not-this-host.invalid']),
      /not declared/
    )
    checks.push('private networks and undeclared hosts blocked')
    const invalid = join(directory, 'invalid.tmp')
    writeFileSync(invalid, 'module.exports={extensionMeta:{id:"../bad"}}')
    await assert.rejects(() => manager.installFile(invalid))
    assert.equal(manager.sources().length, 1)
    checks.push('invalid install preserves live source')
    const replacement = join(directory, 'replacement.tmp')
    writeFileSync(replacement, code.replace("version:'1.0.0'", "version:'1.1.0'"))
    await manager.installFile(replacement)
    assert.equal(manager.all().find((e) => e.id === 'test.phase2')?.version, '1.1.0')
    checks.push('validated atomic install/update')
    await manager.installUrl(base + '/extension.js')
    assert.equal(manager.all().find((entry) => entry.id === 'test.phase2')?.version, '1.2.0')
    checks.push('URL download and validated installation')
    const factory = new ExtensionHost(preload, true)
    try {
      const loaded = await factory.load(
        code +
          ';const Source=module.exports.default;module.exports.default=()=>[Object.assign(new Source(),{id:124}),Object.assign(new Source(),{id:125})];'
      )
      assert.equal(loaded.sources.length, 2)
      assert.equal(
        ((await factory.call(124, 'getPopularManga', [1])) as { hasNextPage: boolean }).hasNextPage,
        true
      )
    } finally {
      factory.dispose()
    }
    checks.push('multi-source factory export')
    const host = new ExtensionHost(preload, true)
    try {
      await assert.rejects(() => host.load('while(true){}'), /timed out/)
    } finally {
      host.dispose()
    }
    checks.push('infinite-loop extension terminated on deadline')
    await manager.uninstall('test.phase2')
    assert.equal(manager.sources().length, 0)
    checks.push('uninstall removes source')
    writeFileSync(reportPath, JSON.stringify({ checks, requests, passed: checks.length }, null, 2))
    assert.ok(readFileSync(reportPath, 'utf8').includes('passed'))
    console.log(
      'PHASE 2 PASS: ' +
        checks.length +
        ' extension integration checks; isolated runtime, all source methods, HTTP broker, reload/install/uninstall and timeout'
    )
  } finally {
    manager.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
