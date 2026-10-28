import { imageMime } from '../images'

export const MAX_ICON_BYTES = 512 * 1024

export function iconData(bytes: Buffer): string {
  if (!bytes.length || bytes.length > MAX_ICON_BYTES) throw new Error('Invalid icon size')
  return 'data:' + imageMime(bytes) + ';base64,' + bytes.toString('base64')
}

export async function readIcon(response: Response): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > MAX_ICON_BYTES)
    throw new Error('Icon exceeds size limit')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty icon response')
  const chunks: Buffer[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_ICON_BYTES) throw new Error('Icon exceeds size limit')
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks)
}

/** Bounded, deduplicated cache; failures expire quickly so reloads can recover. */
export class IconCache {
  private entries = new Map<string, { expires: number; result: Promise<string | null> }>()
  clear(): void {
    this.entries.clear()
  }
  load(key: string, fetch: () => Promise<Buffer>): Promise<string | null> {
    const previous = this.entries.get(key)
    if (previous && previous.expires > Date.now()) return previous.result
    if (this.entries.size >= 128) this.entries.delete(this.entries.keys().next().value!)
    const entry = { expires: Date.now() + 300000, result: Promise.resolve<string | null>(null) }
    entry.result = fetch()
      .then(iconData)
      .catch(() => {
        entry.expires = Date.now() + 15000
        return null
      })
    this.entries.set(key, entry)
    return entry.result
  }
}

export function githubRepositoryAvatar(index: string): string | null {
  const url = new URL(index)
  if (
    url.protocol !== 'https:' ||
    !['github.com', 'raw.githubusercontent.com'].includes(url.hostname)
  )
    return null
  const owner = url.pathname.split('/')[1]
  return /^[a-zA-Z0-9-]{1,39}$/.test(owner) ? 'https://github.com/' + owner + '.png?size=80' : null
}
