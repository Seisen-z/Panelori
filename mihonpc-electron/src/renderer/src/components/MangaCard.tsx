import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { SManga } from '../../../shared/source'
import { invoke } from '../ipc'
import { Cover } from './Cover'
import { makeOrigin } from '../navigation'
import styles from '../pages/Reading.module.css'
export function MangaCard({ manga, sourceId }: { manga: SManga; sourceId: number }): JSX.Element {
  const navigate = useNavigate(),
    location = useLocation(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null)
  const open = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const id = await invoke('manga:open', sourceId, manga)
      navigate('/manga/' + id, {
        state: makeOrigin(
          location,
          location.pathname.startsWith('/source/') ? 'catalogue' : 'Browse'
        )
      })
    } catch (error) {
      setError(String(error))
    } finally {
      setLoading(false)
    }
  }
  return (
    <article className={styles.card}>
      <button onClick={() => void open()} disabled={loading} aria-label={'Open ' + manga.title}>
        <Cover url={manga.thumbnailUrl} sourceId={sourceId} title={manga.title} />
        <strong>{manga.title}</strong>
        <small>{loading ? 'Opening…' : (manga.author ?? 'View chapters')}</small>
      </button>
      {error && (
        <p className={styles.inlineError} role="alert">
          {error}
          <button onClick={() => void open()}>Retry</button>
        </p>
      )}
    </article>
  )
}
