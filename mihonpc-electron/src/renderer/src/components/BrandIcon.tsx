import { useEffect, useRef, useState } from 'react'
import { invoke } from '../ipc'
import styles from './BrandIcon.module.css'

/** Actual extension icon (shared by its sources), loaded only when its row is near view. */
export function BrandIcon({
  kind,
  id,
  name,
  revision = ''
}: {
  kind: 'extension' | 'repository'
  id: string
  name: string
  revision?: string
}): JSX.Element {
  const element = useRef<HTMLSpanElement>(null)
  const [image, setImage] = useState<{ key: string; data: string } | null>(null)
  const key = kind + ':' + id + ':' + revision
  useEffect(() => {
    let live = true,
      started = false
    const load = (): void => {
      if (started) return
      started = true
      const request =
        kind === 'extension' ? invoke('extensions:icon', id) : invoke('repos:icon', id)
      void request.then(
        (data) => {
          if (live && data) setImage({ key, data })
        },
        () => {
          /* retain initials */
        }
      )
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin: '100px' }
    )
    if (element.current) observer.observe(element.current)
    return () => {
      live = false
      observer.disconnect()
    }
  }, [kind, id, key])
  return (
    <span
      ref={element}
      className={styles.icon}
      aria-hidden="true"
      data-brand-kind={kind}
      data-brand-id={id}
    >
      {image?.key === key ? (
        <img src={image.data} alt="" onError={() => setImage(null)} />
      ) : (
        <span>{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
      )}
    </span>
  )
}
