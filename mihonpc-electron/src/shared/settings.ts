import { record, integer, text } from './source'
export const defaultSettings = {
  theme: 'system' as 'system' | 'light' | 'dark',
  language: 'en',
  gridColumns: 3,
  coverRatio: 'portrait' as 'portrait' | 'square',
  libraryView: 'grid' as 'grid' | 'list',
  historyView: 'card' as 'card' | 'list',
  updatesView: 'card' as 'card' | 'list',
  updateHours: 12,
  chargeOnly: false,
  unreadBadge: true,
  defaultCategory: 0,
  notifications: true,
  defaultShowsAll: true,
  showNsfw: false,
  hideInLibrary: false,
  readerMode: 'pager' as 'pager' | 'vertical' | 'webtoon',
  direction: 'ltr' as 'ltr' | 'rtl',
  preload: 2,
  tapZones: true,
  showPageNumber: true,
  imageFit: 'screen' as 'screen' | 'width' | 'height' | 'original',
  readerBackground: '#171a20',
  fullscreen: false,
  keepScreenOn: false,
  downloadLocation: '',
  wifiOnly: false,
  autoDelete: false,
  concurrentDownloads: 2,
  offlineOnly: false,
  closeToTray: false,
  backupHours: 24,
  backupLocation: '',
  maxBackups: 5,
  userAgent: '',
  doh: false,
  analytics: false
}
export type Settings = typeof defaultSettings
export function settingsPatch(value: unknown): Partial<Settings> {
  const data = record(value),
    result: Record<string, unknown> = {}
  const enums: Record<string, string[]> = {
    theme: ['system', 'light', 'dark'],
    language: ['en'],
    coverRatio: ['portrait', 'square'],
    libraryView: ['grid', 'list'],
    historyView: ['card', 'list'],
    updatesView: ['card', 'list'],
    readerMode: ['pager', 'vertical', 'webtoon'],
    direction: ['ltr', 'rtl'],
    imageFit: ['screen', 'width', 'height', 'original']
  }
  const ranges: Record<string, number[]> = {
    gridColumns: [2, 8],
    updateHours: [0, 168],
    defaultCategory: [0, Number.MAX_SAFE_INTEGER],
    preload: [0, 10],
    concurrentDownloads: [1, 5],
    backupHours: [0, 720],
    maxBackups: [1, 100]
  }
  for (const [key, val] of Object.entries(data)) {
    if (!Object.hasOwn(defaultSettings, key)) throw new Error('Unknown setting: ' + key)
    if (enums[key]) {
      if (!enums[key].includes(String(val))) throw new Error('Invalid ' + key)
      result[key] = val
    } else if (ranges[key]) result[key] = integer(val, ranges[key][0], ranges[key][1])
    else if (typeof defaultSettings[key as keyof Settings] === 'boolean') {
      if (typeof val !== 'boolean') throw new Error('Expected boolean')
      result[key] = val
    } else {
      result[key] = text(val, 2000)
      if (key === 'readerBackground' && !/^#[0-9a-f]{6}$/i.test(String(val)))
        throw new Error('Invalid color')
      if (key === 'userAgent' && /[\r\n]/.test(String(val))) throw new Error('Invalid user agent')
    }
  }
  return result as Partial<Settings>
}
