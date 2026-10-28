import { offlineEnabled } from './network'
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs'

/** Owns one private, loopback-only Suwayomi child. Renderer never receives its URL. */
export class ExtensionEngine {
  private child?: ChildProcess
  private ready?: Promise<void>
  private base = ''
  private password = randomBytes(32).toString('hex')
  private auth(): Record<string, string> {
    return { Authorization: 'Basic ' + Buffer.from('mihonpc:' + this.password).toString('base64') }
  }
  constructor(
    private readonly resources: string,
    private readonly data: string
  ) {}
  start(): Promise<void> {
    return (this.ready ??= this.launch().catch((error) => {
      this.stop()
      throw error
    }))
  }
  private async launch(): Promise<void> {
    const java = join(
      this.resources,
      'jre',
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java'
    )
    const jar = join(this.resources, 'bin', 'Suwayomi-Server.jar')
    if (!existsSync(java) || !existsSync(jar))
      throw new Error('Bundled extension runtime is missing')
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer()
      socket.on('error', reject)
      socket.listen(0, '127.0.0.1', () => {
        const address = socket.address()
        if (!address || typeof address === 'string') return reject(new Error('No local port'))
        socket.close(() => resolve(address.port))
      })
    })
    mkdirSync(this.data, { recursive: true })
    const props = {
      rootDir: this.data,
      authMode: 'BASIC_AUTH',
      authUsername: 'mihonpc',
      authPassword: this.password,
      ip: '127.0.0.1',
      port: String(port),
      systemTrayEnabled: 'false',
      initialOpenInBrowserEnabled: 'false',
      webUIEnabled: 'false',
      webUIUpdateCheckInterval: '0',
      kcefEnabled: 'false'
    }
    const log = openSync(join(this.data, 'engine.log'), 'a')
    try {
      this.child = spawn(
        java,
        [
          ...Object.entries(props).map(
            ([k, v]) => '-Dsuwayomi.tachidesk.config.server.' + k + '=' + v
          ),
          '-jar',
          jar
        ],
        { windowsHide: true, stdio: ['ignore', log, log] }
      )
    } finally {
      closeSync(log)
    }
    let failure: Error | undefined
    this.child.on('error', (error) => {
      failure = error
    })
    this.base = 'http://127.0.0.1:' + port
    for (let n = 0; n < 240; n++) {
      if (failure || this.child.exitCode !== null)
        throw failure ?? new Error('Extension runtime stopped; see engine.log')
      try {
        const response = await fetch(this.base + '/api/v1/source/list', {
          signal: AbortSignal.timeout(800),
          headers: this.auth()
        })
        if (response.ok) return
      } catch {
        /* booting */
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error('Extension runtime startup timed out; see engine.log')
  }
  async response(path: string, options?: RequestInit): Promise<Response> {
    if (offlineEnabled() && !['/api/v1/source/list', '/api/v1/extension/list'].includes(path))
      throw new Error('Offline mode is enabled')
    await this.start()
    if (!path.startsWith('/api/') || path.includes('..') || path.includes('\\'))
      throw new Error('Invalid runtime route')
    const response = await fetch(this.base + path, {
      ...options,
      headers: { ...this.auth(), ...options?.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok)
      throw new Error(
        'Extension runtime HTTP ' + response.status + ': ' + (await response.text()).slice(0, 500)
      )
    return response
  }
  async json<T>(path: string, options?: RequestInit): Promise<T> {
    return (await this.response(path, options)).json() as Promise<T>
  }
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const value = await this.json<{ data: T; errors?: { message: string }[] }>('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    })
    if (value.errors?.length) throw new Error(value.errors.map((e) => e.message).join('; '))
    return value.data
  }
  stop(): void {
    this.child?.kill()
    this.child = undefined
    this.ready = undefined
  }
}
