import { BrowserWindow, nativeImage } from 'electron'

let decoder: BrowserWindow | null = null
let ready: Promise<void> | null = null
let users = 0
let queue: Promise<unknown> = Promise.resolve()

/** Chromium decodes WebP/GIF covers that nativeImage's buffer decoder does not support. */
async function browserCover(bytes: Buffer, width: number, height: number): Promise<string> {
  if (users >= 16) throw new Error('Cover decoder queue is busy')
  if (!decoder || decoder.isDestroyed()) {
    decoder = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true
      }
    })
    decoder.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    ready = decoder.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; connect-src \'none\'">'
        )
    )
  }
  const worker = decoder
  users++
  const task = queue
    .catch(() => {})
    .then(async () => {
      await ready
      const data =
        'data:image/' +
        (bytes.subarray(0, 4).toString() === 'RIFF' ? 'webp' : 'gif') +
        ';base64,' +
        bytes.toString('base64')
      return worker.webContents.executeJavaScript(`(async () => {
      const image = new Image(); image.src = ${JSON.stringify(data)}; await image.decode();
      const w = image.naturalWidth, h = image.naturalHeight;
      if (!w || !h || w*h > 67108864) throw new Error('Cover exceeds the pixel limit');
      const scale = Math.min(1, 4096/w, 4096/h, Math.max(${width}/w, ${height}/h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w*scale)); canvas.height = Math.max(1, Math.round(h*scale));
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    })()`) as Promise<string>
    })
  queue = task
  try {
    return await task
  } finally {
    users--
    if (!users) {
      worker.destroy()
      if (decoder === worker) {
        decoder = null
        ready = null
      }
    }
  }
}

/** Fit the physical cover box without enlarging a source or changing its aspect ratio. */
export function coverSize(
  source: { width: number; height: number },
  box: { width: number; height: number }
): { width: number; height: number } {
  const scale = Math.min(
    1,
    4096 / source.width,
    4096 / source.height,
    Math.max(box.width / source.width, box.height / source.height)
  )
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  }
}

/** Originals stay untouched. Resample once with the best filter, not a giant raster per card. */
export async function renderCover(bytes: Buffer, width: number, height: number): Promise<string> {
  const original = nativeImage.createFromBuffer(bytes)
  if (original.isEmpty()) return browserCover(bytes, width, height)
  const source = original.getSize()
  if (source.width * source.height > 64 * 1024 * 1024)
    throw new Error('Cover image exceeds the pixel limit')
  const size = coverSize(source, { width, height })
  const image =
    size.width === source.width && size.height === source.height
      ? original
      : original.resize({ ...size, quality: 'best' })
  return image.toDataURL()
}
