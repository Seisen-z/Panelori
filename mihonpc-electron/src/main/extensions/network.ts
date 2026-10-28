import http from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import { headers, httpUrl, record, text, type FetchOptions } from '../../shared/source'

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, '')
  if (ip.includes(':'))
    return ip === '::' || ip === '::1' || /^(fc|fd|fe[89ab]|ff)/.test(ip) || !/^[23]/.test(ip)
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  )
}
interface Cookie {
  name: string
  value: string
  path: string
  secure: boolean
  expires: number
}
let userAgent = (): string => ''
let offline = (): boolean => false
export function offlineEnabled(): boolean {
  return offline()
}
export function setOfflineProvider(provider: () => boolean): void {
  offline = provider
}
export function setUserAgentProvider(provider: () => string): void {
  userAgent = provider
}
export class HttpBroker {
  private cookies = new Map<string, Cookie[]>()
  constructor(private readonly testLocal = false) {}
  async request(
    input: string,
    options: FetchOptions = {},
    allowedHosts?: string[],
    maxBytes = 8 * 1024 * 1024,
    redirects = 0
  ): Promise<{
    bytes: Buffer
    status: number
    statusText: string
    url: string
    headers: Record<string, string>
  }> {
    if (offline()) throw new Error('Offline mode is enabled')
    const url = new URL(httpUrl(input))
    if (allowedHosts && !allowedHosts.includes(url.hostname))
      throw new Error('Extension host is not declared: ' + url.hostname)
    if (redirects > 5) throw new Error('Too many redirects')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true })
    if (
      !addresses.length ||
      (!this.testLocal && addresses.some((a) => isPrivateAddress(a.address)))
    )
      throw new Error('Private network addresses are blocked')
    const values = headers(options.headers)
    const method = (options.method ?? 'GET').toUpperCase()
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
      throw new Error('Unsupported HTTP method')
    const body = options.body == null ? undefined : text(options.body, 2 * 1024 * 1024)
    const cookies = (this.cookies.get(host) ?? []).filter(
      (c) =>
        c.expires > Date.now() &&
        url.pathname.startsWith(c.path) &&
        (!c.secure || url.protocol === 'https:')
    )
    if (cookies.length && !Object.keys(values).some((k) => k.toLowerCase() === 'cookie'))
      values.Cookie = cookies.map((c) => c.name + '=' + c.value).join('; ')
    if (!Object.keys(values).some((k) => k.toLowerCase() === 'user-agent'))
      values['User-Agent'] = userAgent() || 'MihonPC/0.7'
    const response = await new Promise<{
      bytes: Buffer
      status: number
      statusText: string
      url: string
      headers: Record<string, string>
    }>((resolve, reject) => {
      const address = addresses[0]
      const request = (url.protocol === 'https:' ? https : http).request(
        url,
        {
          method,
          headers: values,
          family: address.family,
          lookup: (_name, _options, callback) => callback(null, address.address, address.family),
          timeout: 15000
        },
        (res) => {
          const chunks: Buffer[] = []
          let total = 0
          res.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > maxBytes) {
              res.destroy(new Error('Response size limit exceeded'))
              return
            }
            chunks.push(chunk)
          })
          res.on('error', reject)
          res.on('end', () => {
            try {
              const responseHeaders: Record<string, string> = {}
              for (const [key, value] of Object.entries(res.headers))
                if (value !== undefined)
                  responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value)
              for (const cookie of res.headers['set-cookie'] ?? []) this.setCookie(host, cookie)
              let bytes = Buffer.concat(chunks)
              const encoding = responseHeaders['content-encoding']?.toLowerCase()
              if (encoding === 'gzip') bytes = gunzipSync(bytes, { maxOutputLength: maxBytes })
              else if (encoding === 'deflate')
                bytes = inflateSync(bytes, { maxOutputLength: maxBytes })
              else if (encoding === 'br')
                bytes = brotliDecompressSync(bytes, { maxOutputLength: maxBytes })
              resolve({
                bytes,
                status: res.statusCode ?? 0,
                statusText: res.statusMessage ?? '',
                url: url.href,
                headers: responseHeaders
              })
            } catch (error) {
              reject(error)
            }
          })
        }
      )
      request.on('timeout', () => request.destroy(new Error('HTTP request timed out')))
      request.on('error', reject)
      if (body) request.write(body)
      request.end()
    })
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      const next = new URL(response.headers.location, url)
      const nextHeaders = { ...headers(options.headers) }
      if (next.origin !== url.origin)
        for (const key of Object.keys(nextHeaders))
          if (/^(authorization|cookie)$/i.test(key)) delete nextHeaders[key]
      const change =
        response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')
      return this.request(
        next.href,
        {
          ...options,
          headers: nextHeaders,
          method: change ? 'GET' : method,
          body: change ? undefined : body
        },
        allowedHosts,
        maxBytes,
        redirects + 1
      )
    }
    return response
  }
  private setCookie(host: string, input: string): void {
    const [pair, ...attributes] = input.split(';')
    const equal = pair.indexOf('=')
    if (equal < 1) return
    const cookie: Cookie = {
      name: pair.slice(0, equal).trim(),
      value: pair.slice(equal + 1).trim(),
      path: '/',
      secure: false,
      expires: Infinity
    }
    for (const attr of attributes) {
      const [key, ...value] = attr.trim().split('=')
      const val = value.join('=')
      if (key.toLowerCase() === 'path' && val.startsWith('/')) cookie.path = val
      if (key.toLowerCase() === 'secure') cookie.secure = true
      if (key.toLowerCase() === 'max-age') cookie.expires = Date.now() + Number(val) * 1000
      if (key.toLowerCase() === 'expires') cookie.expires = Date.parse(val)
    }
    const list = (this.cookies.get(host) ?? []).filter(
      (c) => !(c.name === cookie.name && c.path === cookie.path)
    )
    if (list.length < 100 && (Number.isFinite(cookie.expires) || cookie.expires === Infinity))
      list.push(cookie)
    this.cookies.set(host, list)
  }
}
export function fetchOptions(input: unknown): FetchOptions {
  if (input === undefined) return {}
  const data = record(input)
  return {
    method: data.method === undefined ? undefined : text(data.method, 10),
    body: data.body === undefined ? undefined : text(data.body, 2 * 1024 * 1024),
    headers: headers(data.headers)
  }
}
