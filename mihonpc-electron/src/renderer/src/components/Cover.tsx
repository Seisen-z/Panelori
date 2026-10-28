import { useEffect, useRef, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { invoke } from '../ipc'
import styles from '../pages/Reading.module.css'
export function Cover({
  url,
  sourceId,
  title
}: {
  url?: string | null
  sourceId: number
  title: string
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(false)
  const [image, setImage] = useState<{ key: string; data: string } | null>(null)
  const key = sourceId + ':' + (url ?? '')
  useEffect(() => {
    const node = box.current
    if (!node) return
    const measure = (): void => {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      // Keep a 2x cover rendition even on a 1x display: browser-only 11x reductions
      // alias fine line art, while an exact 1x raster is visibly softer when cropped.
      const pixels = Math.max(2, window.devicePixelRatio || 1)
      // Physical-pixel buckets keep DPR sharp without one cached variant per layout pixel.
      const width = Math.min(2048, Math.ceil((rect.width * pixels) / 32) * 32)
      const height = Math.min(2048, Math.ceil((rect.height * pixels) / 32) * 32)
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }))
    }
    const observer = new ResizeObserver(measure)
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          visibility.disconnect()
        }
      },
      { rootMargin: '240px' }
    )
    visibility.observe(node)
    observer.observe(node)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      visibility.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  useEffect(() => {
    let active = true
    if (visible && url && size.width && size.height) {
      void invoke('source:cover', url, sourceId, size.width, size.height).then(
        (value) => {
          if (active) setImage({ key, data: value })
        },
        () => {}
      )
    }
    return () => {
      active = false
    }
  }, [url, sourceId, key, size, visible])
  return (
    <div className={styles.cover} ref={box}>
      {image?.key === key ? (
        <img src={image.data} alt={title} draggable={false} decoding="async" />
      ) : (
        <BookOpen aria-label={title} size={36} strokeWidth={1} />
      )}
    </div>
  )
}
