import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Plug, Star, RefreshCw, FilePlus2, Download, Search, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/app'
import { useSettings } from '../store/settings'
import { catalogueVisibility } from '../../../shared/browse'
import { invoke } from '../ipc'
import { BrandIcon } from '../components/BrandIcon'
import { RepositoryBrowser } from '../components/RepositoryBrowser'
import type { ExtensionInfo, SourceInfo, MangasPage } from '../../../shared/source'
import { MangaCard } from '../components/MangaCard'
import styles from './Reading.module.css'
function savedPins(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('sourcePins') ?? '[]')
    return Array.isArray(value) ? value.filter(Number.isSafeInteger) : []
  } catch {
    return []
  }
}
export function Browse(): JSX.Element {
  const { sources, refresh, manga: favorites } = useAppStore(),
    { value: prefs, save: saveSettings } = useSettings(),
    [tab, setTab] = useState<'sources' | 'extensions'>('sources'),
    [extensions, setExtensions] = useState<ExtensionInfo[]>([])
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState('')
  const showNsfw = prefs.showNsfw
  const [pins, setPins] = useState<number[]>(savedPins)
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<{ source: SourceInfo; page?: MangasPage; error?: string }[]>(
      []
    )
  useEffect(() => {
    void invoke('extensions:getAll').then(setExtensions, (error) => setError(String(error)))
  }, [])
  const act = async (run: () => Promise<ExtensionInfo[]>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setExtensions(await run())
      await refresh()
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  const pin = (id: number): void => {
    const next = pins.includes(id) ? pins.filter((value) => value !== id) : [...pins, id]
    setPins(next)
    localStorage.setItem('sourcePins', JSON.stringify(next))
  }
  const visible = sources.filter(
    (source) => showNsfw || !extensions.find((e) => e.id === source.extensionId)?.nsfw
  )
  const search = async (): Promise<void> => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const targets = visible.filter((source) => pins.includes(source.id))
    if (!targets.length) {
      setError('Pin at least one source to use global search.')
      return
    }
    setBusy(true)
    setError(null)
    const pages = await Promise.all(
      targets.map(async (source) => {
        try {
          return { source, page: await invoke('source:search', source.id, 1, query, []) }
        } catch (error) {
          return { source, error: String(error) }
        }
      })
    )
    setResults(pages)
    setBusy(false)
  }
  return (
    <div data-testid="browse">
      <header className={styles.heading}>
        <div>
          <h1>Browse</h1>
          <p>Find a source, then choose your next read.</p>
        </div>
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void act(() => invoke('extensions:reload'))}
        >
          <RefreshCw size={16} />
          Reload extensions
        </button>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Browse sections">
        {(['sources', 'extensions'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'sources' ? 'Sources' : 'Extensions'}{' '}
            <span>{value === 'sources' ? visible.length : extensions.length}</span>
          </button>
        ))}
        <label className={styles.nsfw}>
          <input
            type="checkbox"
            checked={showNsfw}
            onChange={(event) => {
              void saveSettings({ showNsfw: event.target.checked }).catch((error) =>
                setError(String(error))
              )
            }}
          />
          Show NSFW
        </label>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {tab === 'extensions' ? (
        <>
          <section className={styles.install}>
            <div>
              <Plug size={23} />
              <div>
                <h2>Mihon extension repositories</h2>
                <p>
                  Add a published repository, then install its extensions below. The bundled
                  Suwayomi JVM runtime loads compatible extensions; no custom source JS is required.
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (url.trim()) void act(() => invoke('extensions:installUrl', url.trim()))
              }}
            >
              <input
                type="url"
                aria-label="Extension URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/OWNER/extensions/raw/repo/index.pb"
                required
              />
              <button className={styles.primary} disabled={busy}>
                <Download size={15} />
                Add repository
              </button>
            </form>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => void act(() => invoke('extensions:installFile'))}
            >
              <FilePlus2 size={16} />
              Install from file
            </button>
            <small>
              Repository extensions run as JVM code in the local Suwayomi runtime, not in the
              JavaScript sandbox. Add only repositories you trust. Some APK conversions may fail;
              repository-provided JVM builds are preferred when available.
            </small>
          </section>
          <RepositoryBrowser
            revision={extensions}
            showNsfw={showNsfw}
            onInstalled={async () => {
              await act(() => invoke('extensions:reload'))
            }}
          />
          <section className={styles.extensionList}>
            <h2>Installed extensions ({extensions.length})</h2>
            {extensions
              .filter((e) => showNsfw || !e.nsfw)
              .map((entry) => (
                <article key={entry.filename}>
                  <BrandIcon
                    kind="extension"
                    id={entry.id}
                    name={entry.name}
                    revision={entry.version}
                  />
                  <div>
                    <strong>{entry.name}</strong>
                    <p>
                      {entry.lang.toUpperCase()} · v{entry.version || 'unknown'}{' '}
                      {entry.nsfw ? '· NSFW' : ''} · {entry.sources.length} sources
                    </p>
                    {entry.error && (
                      <p role="alert" className={styles.inlineError}>
                        {entry.error}
                      </p>
                    )}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={'Enable ' + entry.name}
                      checked={entry.enabled && !entry.error}
                      disabled={busy || !!entry.error}
                      onChange={(event) =>
                        void act(() =>
                          invoke('extensions:setEnabled', entry.id, event.target.checked)
                        )
                      }
                    />
                    Enabled
                  </label>
                  <button
                    className={styles.iconButton}
                    aria-label={'Uninstall ' + entry.name}
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          'Uninstall ' + entry.name + '? Your library and progress will stay.'
                        )
                      )
                        void act(() => invoke('extensions:uninstall', entry.id))
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
          </section>
        </>
      ) : (
        <>
          {!!visible.length && (
            <form
              className={styles.search}
              onSubmit={(event) => {
                event.preventDefault()
                void search()
              }}
            >
              <Search size={17} />
              <input
                aria-label="Search pinned sources"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search across pinned sources…"
              />
              <button className={styles.secondary} disabled={busy}>
                Search
              </button>
            </form>
          )}
          {results
            .filter((result) => visible.some((source) => source.id === result.source.id))
            .map((result) => (
              <section key={result.source.id}>
                <h2>{result.source.name}</h2>
                {result.error ? (
                  <p role="alert">{result.error}</p>
                ) : (
                  <div className={styles.grid}>
                    {catalogueVisibility(
                      result.page?.mangas ?? [],
                      result.source.id,
                      favorites,
                      prefs.hideInLibrary
                    ).map((manga) => (
                      <MangaCard key={manga.url} manga={manga} sourceId={result.source.id} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          {!visible.length ? (
            <section className={styles.empty}>
              <Compass size={40} strokeWidth={1.3} />
              <h2>No sources installed yet</h2>
              <p>
                MihonPC ships with zero built-in sources. Add a repository and install an extension
                to begin.
              </p>
              <button className={styles.primary} onClick={() => setTab('extensions')}>
                Manage extensions
              </button>
            </section>
          ) : (
            Object.entries(Object.groupBy(visible, (source) => source.lang))
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([language, group]) => (
                <section className={styles.sourceGroup} key={language}>
                  <h2>{language.toUpperCase()}</h2>
                  {group?.map((source) => (
                    <article key={source.id}>
                      <BrandIcon
                        kind="extension"
                        id={source.extensionId}
                        name={source.name}
                        revision={extensions.find((e) => e.id === source.extensionId)?.version}
                      />
                      <div>
                        <strong>{source.name}</strong>
                        <small>{new URL(source.baseUrl).hostname}</small>
                      </div>
                      <button
                        className={styles.iconButton}
                        aria-label={(pins.includes(source.id) ? 'Unpin ' : 'Pin ') + source.name}
                        onClick={() => pin(source.id)}
                      >
                        <Star size={18} fill={pins.includes(source.id) ? 'currentColor' : 'none'} />
                      </button>
                      <Link to={'/source/' + source.id} className={styles.secondary}>
                        Browse
                      </Link>
                      {source.supportsLatest && (
                        <Link
                          to={'/source/' + source.id + '?feed=latest'}
                          className={styles.textLink}
                        >
                          Latest
                        </Link>
                      )}
                    </article>
                  ))}
                </section>
              ))
          )}
        </>
      )}
    </div>
  )
}
