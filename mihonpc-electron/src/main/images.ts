import {
  readdirSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { ExtensionManager } from './extensions/manager'
import { renderCover } from './covers'
export function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (
    bytes
      .subarray(0, 6)
      .toString()
      .match(/^GIF8[79]a$/)
  )
    return 'image/gif'
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp'
  throw new Error('Source returned an unsupported image (PNG, JPEG, GIF or WebP required)')
}
export class ImageCache {
  clear(): void {
    if (this.pending.size || this.coverPending.size)
      throw new Error('Wait for image requests to finish')
    this.covers.clear()
    mkdirSync(this.directory, { recursive: true })
    for (const entry of readdirSync(this.directory))
      if (/^[0-9]+$/.test(entry))
        rmSync(join(this.directory, entry), { recursive: true, force: true })
  }
  invalidate(sourceId: number, url: string): void {
    try {
      unlinkSync(this.path(sourceId, url))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  private pending = new Map<string, Promise<Buffer>>()
  private covers = new Map<string, string>()
  private coverPending = new Map<string, Promise<string>>()
  constructor(
    private readonly directory: string,
    private readonly extensions: ExtensionManager
  ) {}
  private path(sourceId: number, url: string): string {
    const dir = join(this.directory, String(sourceId))
    mkdirSync(dir, { recursive: true })
    return join(dir, createHash('sha256').update(url).digest('hex') + '.img')
  }
  async bytes(sourceId: number, url: string, headers?: Record<string, string>): Promise<Buffer> {
    const path = this.path(sourceId, url)
    try {
      const bytes = readFileSync(path)
      imageMime(bytes)
      return bytes
    } catch {
      /* cache miss or corruption */
    }
    const existing = this.pending.get(path)
    if (existing) return existing
    const request = (async () => {
      const response = await this.extensions.request(sourceId, url, headers)
      if (response.status < 200 || response.status >= 300)
        throw new Error('Image request failed: HTTP ' + response.status)
      imageMime(response.bytes)
      const temp = path + '.tmp'
      writeFileSync(temp, response.bytes)
      renameSync(temp, path)
      return response.bytes
    })()
    this.pending.set(path, request)
    try {
      return await request
    } finally {
      this.pending.delete(path)
    }
  }
  async dataUrl(sourceId: number, url: string, headers?: Record<string, string>): Promise<string> {
    const bytes = await this.bytes(sourceId, url, headers)
    return 'data:' + imageMime(bytes) + ';base64,' + bytes.toString('base64')
  }
  async coverDataUrl(
    sourceId: number,
    url: string,
    width: number,
    height: number
  ): Promise<string> {
    const bytes = await this.bytes(sourceId, url)
    const key = createHash('sha256').update(bytes).digest('hex') + ':' + width + ':' + height
    const existing = this.covers.get(key)
    if (existing) return existing
    const pending = this.coverPending.get(key)
    if (pending) return pending
    const request = this.renderCover(bytes, width, height, key)
    this.coverPending.set(key, request)
    try {
      return await request
    } finally {
      this.coverPending.delete(key)
    }
  }
  private async renderCover(
    bytes: Buffer,
    width: number,
    height: number,
    key: string
  ): Promise<string> {
    let result: string
    try {
      result = await renderCover(bytes, width, height)
    } catch {
      // A decoder failure must not hide a valid source cover. No invented upscaling.
      return 'data:' + imageMime(bytes) + ';base64,' + bytes.toString('base64')
    }
    this.covers.set(key, result)
    // Derived images are disposable; original source files remain in the disk cache.
    let size = 0
    for (const value of this.covers.values()) size += value.length
    while (this.covers.size > 64 || size > 32 * 1024 * 1024) {
      const first = this.covers.entries().next().value
      if (!first) break
      this.covers.delete(first[0])
      size -= first[1].length
    }
    return result
  }
}
