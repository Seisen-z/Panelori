import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Download,
  Copy,
  RefreshCw,
  Settings2,
  X
} from 'lucide-react'
import type { ReaderSession, ReaderPreferences } from '../../../shared/ipc'
import { useSettings } from '../store/settings'
import { resolveOrigin } from '../navigation'
import { pagerImageStyle } from '../readerLayout'
import { invoke } from '../ipc'
import styles from './Reader.module.css'
interface ImageState {
  url?: string
  error?: string
}
function useImages(
  session: ReaderSession | null,
  page: number,
  retry: number
): Record<number, ImageState> {
  const [images, setImages] = useState<Record<number, ImageState>>({})
  const pending = useRef(new Map<string, Promise<string>>())
  const handledRetry = useRef(retry)
  useEffect(() => {
    setImages({})
  }, [session?.chapter.id, retry])
  useEffect(() => {
    if (!session) return
    const force = retry !== handledRetry.current
    handledRetry.current = retry
    let active = true
    const targets = [
      page,
      ...Array.from({ length: session.preferences.preload }, (_, index) => page + index + 1),
      page - 1,
      page - 2
    ].filter((index) => index >= 0 && index < session.pages.length)
    setImages((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([index]) =>
            Math.abs(Number(index) - page) <= Math.max(5, session.preferences.preload + 2)
        )
      )
    )
    const load = async (index: number): Promise<void> => {
      const key = session.chapter.id + ':' + index + ':' + retry
      let request = pending.current.get(key)
      if (!request) {
        request = invoke(
          force && index === page ? 'reader:retryImage' : 'reader:image',
          session.chapter.id,
          index
        )
        pending.current.set(key, request)
      }
      try {
        const url = await request
        if (active) setImages((previous) => ({ ...previous, [index]: { url } }))
      } catch (error) {
        if (active) setImages((previous) => ({ ...previous, [index]: { error: String(error) } }))
      } finally {
        pending.current.delete(key)
      }
    }
    void (async () => {
      for (let index = 0; index < targets.length && active; index += 3)
        await Promise.all(targets.slice(index, index + 3).map(load))
    })()
    return () => {
      active = false
    }
  }, [session, page, retry])
  return images
}
interface WebtoonProps {
  session: ReaderSession
  images: Record<number, ImageState>
  command: { page: number; serial: number }
  onPage: (index: number) => void
  onDecoded: (index: number) => void
  onFailed: (index: number) => void
  errors: Set<number>
  retry: (index: number) => void
}
function Webtoon({
  session,
  images,
  command,
  onPage,
  onDecoded,
  onFailed,
  errors,
  retry
}: WebtoonProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(900),
    [heights, setHeights] = useState<Record<number, number>>({})
  const pageWidth = Math.min(900, width * 0.96) * session.preferences.zoom
  const offsets = useMemo(() => {
    const offsets = [0]
    for (let i = 0; i < session.pages.length; i++)
      offsets.push(offsets[i] + (heights[i] ?? 1.5) * pageWidth + 8)
    return offsets
  }, [session.pages.length, heights, pageWidth])
  const offsetRef = useRef(offsets)
  useLayoutEffect(() => {
    offsetRef.current = offsets
  }, [offsets])
  const [visible, setVisible] = useState({
    start: Math.max(0, command.page - 1),
    end: Math.min(session.pages.length - 1, command.page + 2)
  })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const resize = new ResizeObserver(() => setWidth(node.clientWidth))
    resize.observe(node)
    return () => resize.disconnect()
  }, [])
  useEffect(() => {
    ref.current?.scrollTo({ top: offsetRef.current[command.page] ?? 0 })
  }, [command.page, command.serial])
  const scroll = (): void => {
    const node = ref.current
    if (!node) return
    const top = node.scrollTop,
      limit = top + node.clientHeight
    let start = 0
    while (start < session.pages.length - 1 && offsets[start + 1] < top) start++
    let end = start
    while (end < session.pages.length - 1 && offsets[end] < limit) end++
    const marker = top + Math.min(200, node.clientHeight * 0.25)
    let current = start
    while (current < session.pages.length - 1 && offsets[current + 1] < marker) current++
    setVisible({ start: Math.max(0, start - 1), end: Math.min(session.pages.length - 1, end + 1) })
    onPage(current)
  }
  return (
    <div className={styles.webtoon} ref={ref} onScroll={scroll} data-testid="webtoon-scroll">
      <div style={{ height: offsets.at(-1), position: 'relative', minWidth: pageWidth }}>
        {Array.from(
          { length: visible.end - visible.start + 1 },
          (_, index) => index + visible.start
        ).map((index) => (
          <div
            key={index}
            className={styles.webtoonPage}
            style={{
              top: offsets[index],
              height: offsets[index + 1] - offsets[index] - 8,
              width: pageWidth
            }}
            data-page-index={index}
          >
            {images[index]?.url && !errors.has(index) ? (
              <img
                src={images[index].url}
                alt={'Page ' + (index + 1)}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget
                  setHeights((previous) =>
                    previous[index] === image.naturalHeight / image.naturalWidth
                      ? previous
                      : { ...previous, [index]: image.naturalHeight / image.naturalWidth }
                  )
                  onDecoded(index)
                }}
                onError={() => onFailed(index)}
              />
            ) : (
              <div className={styles.pagePlaceholder}>
                {images[index]?.error || errors.has(index) ? (
                  <>
                    <p>{images[index]?.error ?? 'Image could not be decoded.'}</p>
                    <button onClick={() => retry(index)}>Retry page {index + 1}</button>
                  </>
                ) : (
                  <p>Loading page {index + 1}…</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
export function Reader(): JSX.Element {
  const globalPrefs = useSettings((v) => v.value)
  const id = Number(useParams().chapterId),
    navigate = useNavigate(),
    location = useLocation()
  const stageRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<ReaderSession | null>(null),
    [error, setError] = useState<string | null>(null),
    [page, setPage] = useState(0)
  const [overlay, setOverlay] = useState(true),
    [settings, setSettings] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [retry, setRetry] = useState(0)
  const [command, setCommand] = useState({ page: 0, serial: 0 }),
    [decoded, setDecoded] = useState<Set<number>>(new Set()),
    [saved, setSaved] = useState<number | null>(null)
  const [context, setContext] = useState<{ x: number; y: number } | null>(null),
    [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void useSettings
      .getState()
      .load()
      .then(async () => {
        if (!active || !useSettings.getState().value.fullscreen) return
        await invoke('app:fullscreen', true)
        if (active) setFullscreen(true)
        else await invoke('app:fullscreen', false)
      })
      .catch(() => {})
    return () => {
      active = false
      void invoke('app:fullscreen', false).catch(() => {})
    }
  }, [])

  const back = resolveOrigin(location.state, {
    path: session ? '/manga/' + session.manga.id : '/library',
    label: session ? 'manga' : 'Library'
  })
  const [opening, setOpening] = useState(false)
  const [decodeErrors, setDecodeErrors] = useState<Set<number>>(new Set())
  const sequence = useRef<symbol | null>(null)
  const load = useCallback(
    async (refresh: boolean): Promise<void> => {
      const token = Symbol()
      sequence.current = token
      setOpening(true)
      setError(null)
      setSession(null)
      setDecoded(new Set())
      setDecodeErrors(new Set())
      setSaved(null)
      try {
        const value = await invoke('reader:open', id, refresh)
        if (token !== sequence.current) return
        const start = Math.min(value.chapter.last_page_read, value.pages.length - 1)
        setPage(start)
        setCommand((old) => ({ page: start, serial: old.serial + 1 }))
        setSession(value)
      } catch (error) {
        if (token === sequence.current) setError(String(error))
      } finally {
        if (token === sequence.current) setOpening(false)
      }
    },
    [id]
  )
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load(false)
    })
    return () => {
      active = false
      sequence.current = null
    }
  }, [load])
  useEffect(() => {
    const target = stageRef.current
    if (!target || !session) return
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const preferences = {
        ...session.preferences,
        zoom: Math.max(
          0.5,
          Math.min(
            3,
            Math.round((session.preferences.zoom + (event.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10
          )
        )
      }
      void invoke('reader:setPreferences', session.manga.id, preferences, false).then(
        () => setSession((value) => (value ? { ...value, preferences } : value)),
        (error) => setNotice(String(error))
      )
    }
    target.addEventListener('wheel', wheel, { passive: false })
    return () => target.removeEventListener('wheel', wheel)
  }, [session])
  const images = useImages(session, page, retry)
  const imageError =
    images[page]?.error ?? (decodeErrors.has(page) ? 'Image could not be decoded.' : undefined)
  const current = useRef({ id, page, decoded: false })
  useLayoutEffect(() => {
    current.current = { id, page, decoded: decoded.has(page) }
  }, [id, page, decoded])
  const clock = useRef(0),
    lastSaved = useRef('')
  useLayoutEffect(() => {
    clock.current = Date.now()
  }, [id])
  const save = useCallback(async (force = false): Promise<void> => {
    const value = current.current,
      key = value.id + ':' + value.page
    if (!value.decoded || (!force && lastSaved.current === key)) return
    const elapsed = Math.min(60000, Math.max(0, Date.now() - clock.current))
    clock.current = Date.now()
    try {
      await invoke('reader:progress', value.id, value.page, elapsed)
      lastSaved.current = key
      setSaved(value.page)
    } catch (error) {
      setNotice('Progress could not be saved: ' + String(error))
    }
  }, [])
  useEffect(() => {
    void save()
  }, [page, decoded, save])
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void save(true)
    }, 15000)
    return () => {
      clearInterval(timer)
      if (current.current.id === id) void save(true)
    }
  }, [save, id])
  const goto = useCallback(
    (index: number): void => {
      if (!session) return
      const next = Math.max(0, Math.min(session.pages.length - 1, index))
      setPage(next)
      setCommand((old) => ({ page: next, serial: old.serial + 1 }))
      setContext(null)
    },
    [session]
  )
  const chapterIndex = session?.chapters.findIndex((chapter) => chapter.id === id) ?? -1
  const adjacent = (delta: number): number | undefined =>
    session?.chapters[chapterIndex + delta]?.id
  const move = useCallback(
    (delta: number): void => {
      if (!session) return
      const next = page + delta
      if (next < 0 || next >= session.pages.length) {
        const chapter =
          session.chapters[session.chapters.findIndex((chapter) => chapter.id === id) + delta]
        if (chapter) navigate('/reader/' + chapter.id, { state: location.state, replace: true })
        return
      }
      goto(next)
    },
    [session, page, id, navigate, goto, location.state]
  )
  const prefs = async (patch: Partial<ReaderPreferences>, asDefault = false): Promise<void> => {
    if (!session) return
    const preferences = { ...session.preferences, ...patch }
    try {
      await invoke('reader:setPreferences', session.manga.id, preferences, asDefault)
      if (asDefault) await useSettings.getState().load()
      setSession((previous) => (previous ? { ...previous, preferences } : previous))
      setCommand((previous) => ({ ...previous, serial: previous.serial + 1 }))
      setNotice(asDefault ? 'Default reader preferences saved' : '')
    } catch (error) {
      setNotice(String(error))
    }
  }
  const full = async (): Promise<void> => {
    try {
      await invoke('app:fullscreen', !fullscreen)
      setFullscreen(!fullscreen)
    } catch (error) {
      setNotice(String(error))
    }
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea'))
        return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button') &&
        [' ', 'Enter'].includes(event.key)
      )
        return
      let delta = 0
      if (event.key === 'ArrowRight') delta = session?.preferences.direction === 'rtl' ? -1 : 1
      if (event.key === 'ArrowLeft') delta = session?.preferences.direction === 'rtl' ? 1 : -1
      if (['ArrowDown', 'PageDown', ' '].includes(event.key)) delta = 1
      if (['ArrowUp', 'PageUp'].includes(event.key)) delta = -1
      if (delta) {
        event.preventDefault()
        move(delta)
      } else if (event.key === 'Home') {
        event.preventDefault()
        goto(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        if (session) goto(session.pages.length - 1)
      } else if (event.key === 'Escape') {
        setContext(null)
        setSettings(false)
        setOverlay(true)
        if (fullscreen) {
          void invoke('app:fullscreen', false)
          setFullscreen(false)
        }
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void invoke('app:fullscreen', !fullscreen).then(
          () => setFullscreen(!fullscreen),
          (error) => setNotice(String(error))
        )
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [session, move, goto, fullscreen])
  const pointer = useRef({ x: 0, y: 0 })
  const onDecoded = useCallback(
    (index: number): void =>
      setDecoded((previous) => (previous.has(index) ? previous : new Set([...previous, index]))),
    []
  )
  const action = async (type: 'save' | 'copy'): Promise<void> => {
    setContext(null)
    try {
      if (type === 'save') {
        const done = await invoke('reader:saveImage', id, page)
        setNotice(done ? 'Page image saved' : 'Save cancelled')
      } else {
        await invoke('reader:copyImage', id, page)
        setNotice('Page image copied')
      }
    } catch (error) {
      setNotice(String(error))
    }
  }
  const retryPage = (): void => {
    setDecoded(new Set())
    setDecodeErrors(new Set())
    lastSaved.current = ''
    setRetry((value) => value + 1)
  }
  return (
    <div
      className={styles.reader}
      data-testid="reader"
      data-page={page}
      data-saved={saved ?? ''}
      data-mode={session?.preferences.mode ?? 'loading'}
      data-chapter-id={id}
      data-fullscreen={fullscreen}
    >
      {error ? (
        <div className={styles.failure}>
          <h1>This chapter could not open</h1>
          <p role="alert">{error}</p>
          <button onClick={() => void load(false)}>Retry</button>
          <Link to={back.path} state={back.state} aria-label={'Back to ' + back.label}>
            Back to {back.label}
          </Link>
        </div>
      ) : !session || opening ? (
        <div className={styles.failure}>Opening chapter…</div>
      ) : (
        <>
          <div
            className={styles.stage}
            ref={stageRef}
            onPointerDown={(event) => {
              pointer.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerUp={(event) => {
              if (
                event.button !== 0 ||
                (event.target as HTMLElement).closest('button,a,input,select') ||
                Math.abs(event.clientX - pointer.current.x) > 5 ||
                Math.abs(event.clientY - pointer.current.y) > 5
              )
                return
              const part = event.clientX / window.innerWidth
              if (
                !globalPrefs.tapZones ||
                session.preferences.mode === 'webtoon' ||
                (part > 0.33 && part < 0.67)
              )
                setOverlay((value) => !value)
              else move((part < 0.33 ? -1 : 1) * (session.preferences.direction === 'rtl' ? -1 : 1))
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              setContext({
                x: Math.min(event.clientX, window.innerWidth - 210),
                y: Math.min(event.clientY, window.innerHeight - 140)
              })
            }}
          >
            {session.preferences.mode === 'webtoon' ? (
              <Webtoon
                key={id}
                session={session}
                images={images}
                command={command}
                onPage={setPage}
                onDecoded={onDecoded}
                onFailed={(index) => setDecodeErrors((previous) => new Set([...previous, index]))}
                errors={decodeErrors}
                retry={(index) => {
                  goto(index)
                  retryPage()
                }}
              />
            ) : (
              <div className={styles.pager} data-testid="pager">
                <div className={styles.pagerFrame}>
                  {images[page]?.url && !decodeErrors.has(page) ? (
                    <img
                      key={id + ':' + page + ':' + retry}
                      src={images[page].url}
                      alt={'Page ' + (page + 1)}
                      draggable={false}
                      style={pagerImageStyle(globalPrefs.imageFit, session.preferences.zoom)}
                      onLoad={() => onDecoded(page)}
                      onError={() => setDecodeErrors((previous) => new Set([...previous, page]))}
                    />
                  ) : (
                    <div className={styles.pagePlaceholder}>
                      {imageError ? (
                        <>
                          <p role="alert">{imageError}</p>
                          <button onClick={retryPage}>Retry page {page + 1}</button>
                        </>
                      ) : (
                        <p>Loading page {page + 1}…</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!overlay && globalPrefs.showPageNumber && (
            <div
              className={styles.pageNumber}
              data-testid="reader-page-number"
              aria-label="Current page"
            >
              {page + 1} / {session.pages.length}
            </div>
          )}
          {overlay && (
            <>
              <header className={styles.top}>
                <Link
                  to={back.path}
                  state={back.state}
                  replace
                  aria-label={'Back to ' + back.label}
                >
                  <ArrowLeft size={20} />
                </Link>
                <div>
                  <strong>{session.manga.title}</strong>
                  <small>{session.chapter.name}</small>
                </div>
                <button onClick={retryPage} aria-label="Retry image">
                  <RefreshCw size={18} />
                </button>
                <button onClick={() => setSettings((value) => !value)} aria-label="Reader settings">
                  <Settings2 size={19} />
                </button>
                <button onClick={() => void full()} aria-label="Toggle full screen">
                  <Maximize2 size={19} />
                </button>
              </header>
              <footer className={styles.bottom}>
                <div className={styles.chapterControls}>
                  <button
                    disabled={!adjacent(-1)}
                    onClick={() =>
                      navigate('/reader/' + adjacent(-1), { state: location.state, replace: true })
                    }
                    aria-label="Previous chapter"
                  >
                    <ChevronLeft size={18} />
                    Previous chapter
                  </button>
                  <span data-testid="page-counter">
                    {page + 1} / {session.pages.length}
                  </span>
                  <button
                    disabled={!adjacent(1)}
                    onClick={() =>
                      navigate('/reader/' + adjacent(1), { state: location.state, replace: true })
                    }
                    aria-label="Next chapter"
                  >
                    Next chapter
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className={styles.scrubber}>
                  <button
                    aria-label="Previous page"
                    disabled={page === 0}
                    onClick={() => goto(page - 1)}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <input
                    type="range"
                    aria-label="Page progress"
                    min={1}
                    max={session.pages.length}
                    value={page + 1}
                    onChange={(event) => goto(Number(event.target.value) - 1)}
                  />
                  <button
                    aria-label="Next page"
                    disabled={page === session.pages.length - 1}
                    onClick={() => goto(page + 1)}
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
              </footer>
            </>
          )}
          {settings && (
            <aside className={styles.settings}>
              <div>
                <h2>Reader settings</h2>
                <button aria-label="Close reader settings" onClick={() => setSettings(false)}>
                  <X size={18} />
                </button>
              </div>
              <label>
                Reading mode
                <select
                  aria-label="Reading mode"
                  value={session.preferences.mode}
                  onChange={(event) =>
                    void prefs({ mode: event.target.value as ReaderPreferences['mode'] })
                  }
                >
                  <option value="pager">Horizontal pager</option>
                  <option value="vertical">Vertical pager</option>
                  <option value="webtoon">Continuous webtoon</option>
                </select>
              </label>
              <label>
                Reading direction
                <select
                  aria-label="Reading direction"
                  value={session.preferences.direction}
                  onChange={(event) =>
                    void prefs({ direction: event.target.value as ReaderPreferences['direction'] })
                  }
                >
                  <option value="ltr">Left to right</option>
                  <option value="rtl">Right to left</option>
                </select>
              </label>
              <label>
                Preload pages
                <select
                  aria-label="Preload pages"
                  value={session.preferences.preload}
                  onChange={(event) => void prefs({ preload: Number(event.target.value) })}
                >
                  {[0, 1, 2, 3, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pager image fit
                <select
                  aria-label="Pager image fit"
                  value={globalPrefs.imageFit}
                  disabled={session.preferences.mode === 'webtoon'}
                  onChange={(event) =>
                    void useSettings
                      .getState()
                      .save({ imageFit: event.target.value as typeof globalPrefs.imageFit })
                      .catch((e) => setNotice(String(e)))
                  }
                >
                  <option value="screen">Fit screen</option>
                  <option value="width">Fit width</option>
                  <option value="height">Fit height</option>
                  <option value="original">Original size</option>
                </select>
              </label>
              <label>
                <span>Show page number with controls hidden</span>
                <input
                  type="checkbox"
                  aria-label="Show page number"
                  checked={globalPrefs.showPageNumber}
                  onChange={(event) =>
                    void useSettings
                      .getState()
                      .save({ showPageNumber: event.target.checked })
                      .catch((e) => setNotice(String(e)))
                  }
                />
              </label>
              <label>
                Zoom
                <select
                  aria-label="Zoom"
                  value={session.preferences.zoom}
                  onChange={(event) => void prefs({ zoom: Number(event.target.value) })}
                >
                  {[
                    0.5,
                    0.75,
                    1,
                    1.25,
                    1.5,
                    2,
                    2.5,
                    3,
                    ...(![0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].includes(session.preferences.zoom)
                      ? [session.preferences.zoom]
                      : [])
                  ]
                    .sort((a, b) => a - b)
                    .map((value) => (
                      <option value={value} key={value}>
                        {Math.round(value * 100)}%
                      </option>
                    ))}
                </select>
              </label>
              <button onClick={() => void prefs({}, true)}>Use as global defaults</button>
              <small>
                Arrow keys · Page Up/Down · Home/End
                <br />
                Ctrl + wheel to zoom · F for full screen
                <br />
                Tap the center to hide controls.
              </small>
            </aside>
          )}
          {context && (
            <div className={styles.context} role="menu" style={{ left: context.x, top: context.y }}>
              <button role="menuitem" onClick={() => void action('save')}>
                <Download size={16} />
                Save image
              </button>
              <button role="menuitem" onClick={() => void action('copy')}>
                <Copy size={16} />
                Copy to clipboard
              </button>
              <button role="menuitem" onClick={() => setContext(null)}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <div className={styles.notice} role="status">
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss notice">
                <X size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
