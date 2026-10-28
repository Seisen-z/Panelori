import { useEffect, useState } from 'react'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, LibraryBig, RefreshCw, Check, Bookmark } from 'lucide-react'
import type { MangaDetail as Detail } from '../../../shared/ipc'
import { invoke } from '../ipc'
import { useAppStore } from '../store/app'
import { Cover } from '../components/Cover'
import { BackLink } from '../components/BackLink'
import { makeOrigin } from '../navigation'
import styles from './Reading.module.css'
export function MangaDetail(): JSX.Element {
  const location = useLocation(),
    navigate = useNavigate()
  const readerOrigin = makeOrigin(location, 'manga')
  const id = Number(useParams().mangaId),
    [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('')
  const refresh = useAppStore((state) => state.refresh)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        setData(null)
        setError(null)
      }
    })
    void invoke('manga:getDetail', id).then(
      (value) => {
        if (active) setData(value)
      },
      (error) => {
        if (active) setError(String(error))
      }
    )
    return () => {
      active = false
    }
  }, [id])
  const update = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setData(await invoke('manga:refresh', id))
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  const favorite = async (): Promise<void> => {
    if (!data) return
    setBusy(true)
    setError(null)
    try {
      const manga = data.manga
      if (manga.favorite) await invoke('library:removeFavorite', manga.id)
      else
        await invoke(
          'library:addFavorite',
          {
            url: manga.url,
            title: manga.title,
            status: manga.status,
            author: manga.author ?? undefined,
            artist: manga.artist ?? undefined,
            description: manga.description ?? undefined,
            genre: manga.genre ?? undefined,
            thumbnailUrl: manga.thumbnail_url ?? undefined,
            initialized: true
          },
          manga.source_id
        )
      setData(await invoke('manga:getDetail', id))
      await refresh()
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  const queueUnread = async (): Promise<void> => {
    if (!data) return
    try {
      await invoke(
        'downloads:enqueue',
        data.chapters.filter((c) => !c.read).map((c) => c.id)
      )
      setError(null)
      navigate('/downloads', { state: makeOrigin(location, 'manga') })
    } catch (e) {
      setError(String(e))
    }
  }
  const resume = data?.chapters.find((chapter) => !chapter.read) ?? data?.chapters[0]
  return (
    <div data-testid="manga-detail">
      <BackLink
        to={
          data?.manga.favorite ? '/library' : data ? '/source/' + data.manga.source_id : '/library'
        }
        label={data?.manga.favorite ? 'Library' : 'catalogue'}
      />

      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <button onClick={() => void update()}>Retry</button>
        </div>
      )}
      {!data ? (
        <p>Loading manga…</p>
      ) : (
        <>
          <section className={styles.detailHero}>
            <Cover
              url={data.manga.thumbnail_url}
              sourceId={data.manga.source_id}
              title={data.manga.title}
            />
            <div>
              <span className={styles.metadata}>
                {
                  [
                    'Unknown',
                    'Ongoing',
                    'Completed',
                    'Licensed',
                    'Publishing finished',
                    'Cancelled',
                    'On hiatus'
                  ][data.manga.status]
                }
              </span>
              <h1>{data.manga.title}</h1>
              <p>
                {data.manga.author ?? 'Unknown author'}
                {data.manga.artist && data.manga.artist !== data.manga.author
                  ? ' · ' + data.manga.artist
                  : ''}
              </p>
              <div className={styles.tags}>
                {data.manga.genre?.split(',').map((genre) => (
                  <span key={genre}>{genre.trim()}</span>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void favorite()}
                >
                  {data.manga.favorite ? <Check size={17} /> : <LibraryBig size={17} />}
                  <span>{data.manga.favorite ? 'In library' : 'Add to library'}</span>
                </button>
                {resume && (
                  <Link className={styles.primary} to={'/reader/' + resume.id} state={readerOrigin}>
                    <BookOpen size={17} />
                    {resume.last_page_read ? 'Resume reading' : 'Start reading'}
                  </Link>
                )}
                <button
                  className={styles.iconButton}
                  aria-label="Refresh manga and chapters"
                  disabled={busy}
                  onClick={() => void update()}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <p className={styles.description}>
                {data.manga.description ?? 'No description available.'}
              </p>
            </div>
          </section>
          <div className={styles.chapterHeading}>
            <h2>{data.chapters.length} chapters</h2>
            <button onClick={() => void queueUnread()}>Download unread</button>
            <input
              aria-label="Filter chapters"
              placeholder="Find a chapter…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className={styles.chapters}>
            {data.chapters
              .filter((chapter) => chapter.name.toLowerCase().includes(search.toLowerCase()))
              .map((chapter) => (
                <Link
                  className={chapter.read ? styles.readChapter : styles.chapter}
                  key={chapter.id}
                  to={'/reader/' + chapter.id}
                  state={readerOrigin}
                >
                  <span>{chapter.read ? <Check size={17} /> : <BookOpen size={17} />}</span>
                  <div>
                    <strong>{chapter.name}</strong>
                    <small>
                      {chapter.scanlator ?? 'Unknown scanlator'}
                      {chapter.date_upload
                        ? ' · ' + new Date(chapter.date_upload).toLocaleDateString()
                        : ''}
                    </small>
                  </div>
                  {!!chapter.bookmark && <Bookmark size={16} />}
                  <small>
                    {chapter.last_page_read
                      ? 'Page ' + (chapter.last_page_read + 1)
                      : chapter.read
                        ? 'Read'
                        : 'Unread'}
                  </small>
                </Link>
              ))}
          </div>
          {!data.chapters.length && <p>No chapters available. Try refreshing this source.</p>}
        </>
      )}
    </div>
  )
}
