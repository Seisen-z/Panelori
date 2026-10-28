import type { CSSProperties } from 'react'
import type { Settings } from '../../shared/settings'
export function pagerImageStyle(fit: Settings['imageFit'], zoom: number): CSSProperties {
  const height = 'calc(' + 100 * zoom + 'vh - ' + 64 * zoom + 'px)'
  if (fit === 'width')
    return { width: 96 * zoom + 'vw', height: 'auto', maxWidth: 'none', maxHeight: 'none' }
  if (fit === 'height') return { height, width: 'auto', maxWidth: 'none', maxHeight: 'none' }
  if (fit === 'original')
    return { width: 'auto', height: 'auto', maxWidth: 'none', maxHeight: 'none', zoom }
  return { height, maxWidth: zoom <= 1 ? '96vw' : 'none', width: 'auto' }
}
