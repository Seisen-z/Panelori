import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../store/app'
import { useSettings } from '../store/settings'
import { catalogueVisibility } from '../../../shared/browse'
import { invoke } from '../ipc'
import type { SManga, Filter } from '../../../shared/source'
import { MangaCard } from '../components/MangaCard'
import styles from './Reading.module.css'
export function Catalog(): JSX.Element {
  const id = Number(useParams().sourceId),
    [params, setParams] = useSearchParams()
  const source = useAppStore((state) => state.sources.find((source) => source.id === id))
  const favorites = useAppStore((state) => state.manga)
  const hideInLibrary = useSettings((state) => state.value.hideInLibrary)
  const [query, setQuery] = useState(''),
    [submitted, setSubmitted] = useState(''),
    [items, setItems] = useState<SManga[]>([])
  const [filters, setFilters] = useState<Filter[]>([]),
    [applied, setApplied] = useState<Filter[]>([]),
    [showFilters, setShowFilters] = useState(false)
  const [busy, setBusy] = useState(false),
    [hasNext, setHasNext] = useState(true),
    [error, setError] = useState<string | null>(null),
    [number, setNumber] = useState(0)
  const generation = useRef<symbol | null>(null),
    inflight = useRef(false),
    sentinel = useRef<HTMLDivElement>(null)
  const feed = params.get('feed') === 'latest' ? 'latest' : 'popular'
  useEffect(() => {
    let active = true
    void invoke('source:getFilters', id).then(
      (value) => {
        if (active) {
          setFilters(value)
          setApplied(value)
        }
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [id])
  const load = useCallback(
    async (page: number, token: symbol | null): Promise<void> => {
      if (token === null || inflight.current) return
      inflight.current = true
      setBusy(true)
      setError(null)
      try {
        const result =
          submitted ||
          applied.some(
            (filter) => filter.type !== 'separator' && filter.type !== 'header' && !!filter.state
          )
            ? await invoke('source:search', id, page, submitted, applied)
            : feed === 'latest'
              ? await invoke('source:getLatest', id, page)
              : await invoke('source:getPopular', id, page)
        if (token !== generation.current) return
        setItems((previous) => {
          const map = new Map((page === 1 ? [] : previous).map((item) => [item.url, item]))
          result.mangas.forEach((item) => map.set(item.url, item))
          return [...map.values()]
        })
        setHasNext(result.hasNextPage)
        setNumber(page)
      } catch (error) {
        if (token === generation.current) setError(String(error))
      } finally {
        if (token === generation.current) {
          inflight.current = false
          setBusy(false)
        }
      }
    },
    [id, feed, submitted, applied]
  )
  useEffect(() => {
    const token = Symbol()
    generation.current = token
    inflight.current = false
    queueMicrotask(() => {
      if (token !== generation.current) return
      setItems([])
      setNumber(0)
      setHasNext(true)
      void load(1, token)
    })
    return () => {
      generation.current = null
    }
  }, [load])
  useEffect(() => {
    const target = sentinel.current
    if (!target || !hasNext || busy || error) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && number > 0)
          void load(number + 1, generation.current)
      },
      { rootMargin: '300px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNext, busy, error, number, load])
  const visibleItems = catalogueVisibility(items, id, favorites, hideInLibrary)
  const filter = (index: number, state: Filter['state']): void =>
    setFilters((previous) =>
      previous.map((value, i) => (i === index ? { ...value, state } : value))
    )
  return (
    <div data-testid="catalog">
      <Link className={styles.textLink} to="/browse">
        <ArrowLeft size={16} />
        Sources
      </Link>
      <header className={styles.heading}>
        <div>
          <span className={styles.metadata}>{source?.lang.toUpperCase()} · SOURCE CATALOGUE</span>
          <h1>{source?.name ?? 'Source unavailable'}</h1>
          <p>Browse titles from this source.</p>
        </div>
      </header>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(query.trim())
        }}
      >
        <Search size={17} />
        <input
          aria-label="Search this source"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search manga…"
        />
        <button className={styles.secondary}>Search</button>
        {!!filters.length && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setShowFilters((value) => !value)}
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>
        )}
      </form>
      <div className={styles.tabs}>
        <button
          aria-selected={feed === 'popular'}
          onClick={() => {
            setSubmitted('')
            setQuery('')
            setParams({ feed: 'popular' })
          }}
        >
          Popular
        </button>
        {source?.supportsLatest && (
          <button
            aria-selected={feed === 'latest'}
            onClick={() => {
              setSubmitted('')
              setQuery('')
              setParams({ feed: 'latest' })
            }}
          >
            Latest
          </button>
        )}
      </div>
      {showFilters && (
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault()
            setApplied(filters.map((value) => ({ ...value })))
            setShowFilters(false)
          }}
        >
          {filters.map((value, index) =>
            value.type === 'separator' ? (
              <hr key={index} />
            ) : value.type === 'header' ? (
              <strong key={index}>{value.name}</strong>
            ) : (
              <label key={index}>
                {value.name}
                {value.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={value.state === true}
                    onChange={(event) => filter(index, event.target.checked)}
                  />
                ) : value.type === 'select' ? (
                  <select
                    value={Number(value.state ?? 0)}
                    onChange={(event) => filter(index, Number(event.target.value))}
                  >
                    {value.values?.map((option, index) => (
                      <option key={index} value={index}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={String(value.state ?? '')}
                    onChange={(event) => filter(index, event.target.value)}
                  />
                )}
              </label>
            )
          )}
          <button className={styles.primary}>Apply filters</button>
        </form>
      )}
      <div className={styles.grid}>
        {visibleItems.map((manga) => (
          <MangaCard key={manga.url} manga={manga} sourceId={id} />
        ))}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button
            className={styles.secondary}
            onClick={() => void load(number + 1, generation.current)}
          >
            Retry
          </button>
        </div>
      )}
      {!busy && !error && !visibleItems.length && (
        <p className={styles.empty}>
          {items.length && hideInLibrary
            ? 'Titles already in your library are hidden. Load more or change Browse settings.'
            : 'No manga matched this search.'}
        </p>
      )}
      <div ref={sentinel} className={styles.loadMore}>
        {busy ? (
          'Loading manga…'
        ) : hasNext ? (
          <button
            className={styles.secondary}
            onClick={() => void load(number + 1, generation.current)}
          >
            Load more
          </button>
        ) : items.length ? (
          'You’re all caught up.'
        ) : (
          ''
        )}
      </div>
    </div>
  )
}
