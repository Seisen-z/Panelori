import { BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HttpBroker, fetchOptions } from './network'
import {
  headers,
  httpUrl,
  integer,
  record,
  text,
  type ExtensionMeta,
  type SourceInfo,
  type SourceMethod
} from '../../shared/source'

export class ExtensionHost {
  private window: BrowserWindow
  private hosts: string[] = []
  private active = 0
  readonly id: string
  readonly broker: HttpBroker
  readonly sourceHeaders = new Map<number, Record<string, string>>()
  get stopped(): boolean {
    return this.window.isDestroyed() || this.window.webContents.isDestroyed()
  }
  constructor(preload: string, testLocal = false) {
    this.id = 'extension-fetch:' + randomUUID()
    this.broker = new HttpBroker(testLocal)
    const partition = session.fromPartition('extension-' + randomUUID())
    partition.setPermissionRequestHandler((_web, _permission, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
    partition.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: /^(https?|wss?|file):/.test(details.url) })
    )
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(preload, 'index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        session: partition,
        additionalArguments: ['--mihonpc-extension-host', '--extension-fetch-channel=' + this.id]
      }
    })
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window.webContents.on('will-navigate', (event) => event.preventDefault())
    this.window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    ipcMain.handle(this.id, async (event, url: unknown, options: unknown) => {
      if (
        this.window.isDestroyed() ||
        event.sender !== this.window.webContents ||
        event.senderFrame !== this.window.webContents.mainFrame
      )
        throw new Error('Invalid extension sender')
      if (this.active >= 6) throw new Error('Extension request concurrency limit reached')
      this.active++
      try {
        const result = await this.broker.request(httpUrl(url), fetchOptions(options), this.hosts)
        return { ...result, bytes: undefined, body: result.bytes.toString('utf8') }
      } finally {
        this.active--
      }
    })
  }
  async load(code: string): Promise<{ meta: ExtensionMeta; sources: SourceInfo[] }> {
    await this.window.loadURL(
      'data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; script-src %27unsafe-eval%27; connect-src %27none%27"><title>Extension host</title>'
    )
    const raw: unknown = await this.evaluate(
      `(() => {
      const bridge = globalThis.extensionHost;
      class BrowserBuffer extends Uint8Array {
        static from(value,encoding='utf8') {
          if(typeof value==='string') {
            if(encoding==='base64')return new BrowserBuffer(Uint8Array.from(atob(value),char=>char.charCodeAt(0)));
            if(encoding==='hex')return new BrowserBuffer(Uint8Array.from(value.match(/.{1,2}/g)||[],pair=>parseInt(pair,16)));
            return new BrowserBuffer(new TextEncoder().encode(value));
          }
          return new BrowserBuffer(value);
        }
        static alloc(size){if(!Number.isSafeInteger(size)||size<0||size>8388608)throw new Error('Buffer allocation limit');return new BrowserBuffer(size)}
        static isBuffer(value){return value instanceof BrowserBuffer}
        static concat(list){const length=list.reduce((total,value)=>total+value.length,0);const result=BrowserBuffer.alloc(length);let offset=0;for(const value of list){result.set(value,offset);offset+=value.length}return result}
        toString(encoding='utf8'){
          if(encoding==='hex')return Array.from(this,value=>value.toString(16).padStart(2,'0')).join('');
          if(encoding==='base64'){let text='';for(let index=0;index<this.length;index+=8192)text+=String.fromCharCode(...this.subarray(index,index+8192));return btoa(text)}
          return new TextDecoder().decode(this);
        }
      }
      globalThis.Buffer=BrowserBuffer;
      globalThis.fetch = async (url, options = {}) => {
        const data = await bridge.fetch(String(url), options);
        return { ok: data.status >= 200 && data.status < 300, status: data.status, statusText: data.statusText,
          url: data.url, headers: new Headers(data.headers),
          text: async () => data.body, json: async () => JSON.parse(data.body) };
      };
      const module = { exports: {} };
      new Function('module','exports', ${JSON.stringify(code)})(module, module.exports);
      const output = module.exports;
      const meta = output.extensionMeta;
      const exported = output.default ?? output.sources ?? output;
      let sources;
      if (Array.isArray(exported)) sources = exported;
      else if (typeof exported === 'function') {
        sources = exported.prototype ? new exported() : exported();
        if (!Array.isArray(sources)) sources = [sources];
      } else sources = [exported];
      const required = ['getPopularManga','getLatestUpdates','searchManga','getMangaDetails','getChapterList','getPageList'];
      for (const source of sources) for (const method of required) if (typeof source[method] !== 'function') throw new Error('Missing source method: ' + method);
      globalThis.__sources = new Map(sources.map(s => [s.id,s]));
      globalThis.__callSource = async (id, method, args) => {
        const source = globalThis.__sources.get(id);
        if (!source) throw new Error('Source is missing');
        if (method === 'getFilters' && typeof source.getFilters !== 'function') return '[]';
        if (method === 'getImageUrl' && typeof source.getImageUrl !== 'function') throw new Error('Source did not resolve an image URL');
        return JSON.stringify(await source[method](...args));
      };
      return JSON.stringify({ meta, sources: sources.map(s => ({ id:s.id, name:s.name, lang:s.lang, baseUrl:s.baseUrl, supportsLatest:s.supportsLatest, headers:s.headers })) });
    })()`,
      6000
    )
    const data = record(JSON.parse(text(raw, 2 * 1024 * 1024)))
    const input = record(data.meta)
    const id = text(input.id, 100)
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error('Invalid extension id')
    const meta: ExtensionMeta = {
      id,
      name: text(input.name, 200),
      lang: text(input.lang, 30),
      version: text(input.version, 60),
      nsfw: input.nsfw === true
    }
    if (!Array.isArray(data.sources) || !data.sources.length || data.sources.length > 100)
      throw new Error('Extension must export 1–100 sources')
    const sources = data.sources.map((value) => {
      const source = record(value)
      const result: SourceInfo = {
        id: integer(source.id, 1),
        name: text(source.name, 200),
        lang: text(source.lang, 30),
        baseUrl: httpUrl(source.baseUrl),
        supportsLatest: source.supportsLatest === true,
        extensionId: id
      }
      this.sourceHeaders.set(result.id, headers(source.headers))
      return result
    })
    if (new Set(sources.map((s) => s.id)).size !== sources.length)
      throw new Error('Duplicate source id')
    if (input.hosts !== undefined && (!Array.isArray(input.hosts) || input.hosts.length > 50))
      throw new Error('Invalid extension hosts')
    this.hosts = [
      ...new Set([
        ...sources.map((s) => new URL(s.baseUrl).hostname),
        ...((input.hosts ?? []) as unknown[]).map((value) => {
          const host = text(value, 253)
          if (
            !host ||
            [...host].some(
              (char) => !'abcdefghijklmnopqrstuvwxyz0123456789.:-[]'.includes(char.toLowerCase())
            )
          )
            throw new Error('Hosts must be exact hostnames, not URLs or wildcards')
          return host.toLowerCase()
        })
      ])
    ]
    meta.hosts = this.hosts
    return { meta, sources }
  }
  async call(id: number, method: SourceMethod, args: unknown[]): Promise<unknown> {
    const raw = await this.evaluate(
      'globalThis.__callSource(' +
        JSON.stringify(id) +
        ',' +
        JSON.stringify(method) +
        ',' +
        JSON.stringify(args) +
        ')',
      20000
    )
    return JSON.parse(text(raw, 8 * 1024 * 1024))
  }
  private async evaluate(code: string, milliseconds: number): Promise<unknown> {
    if (this.window.isDestroyed()) throw new Error('Extension stopped; reload it')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        this.window.webContents.executeJavaScript(
          '(async()=>{try{return {ok:true,value:await (' +
            code +
            ')}}catch(error){return {ok:false,error:String(error)}}})()'
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            this.dispose(true)
            reject(new Error('Extension timed out and was stopped'))
          }, milliseconds)
        })
      ])
      const response = record(result)
      if (response.ok !== true) throw new Error(text(response.error, 2000))
      return response.value
    } finally {
      clearTimeout(timer)
    }
  }
  async request(
    url: string,
    options: unknown,
    maxBytes?: number
  ): Promise<Awaited<ReturnType<HttpBroker['request']>>> {
    return this.broker.request(url, fetchOptions(options), this.hosts, maxBytes)
  }
  dispose(force = false): void {
    ipcMain.removeHandler(this.id)
    if (!this.window.isDestroyed()) {
      if (force && !this.window.webContents.isDestroyed())
        this.window.webContents.forcefullyCrashRenderer()
      if (!this.window.isDestroyed()) this.window.destroy()
    }
  }
}
