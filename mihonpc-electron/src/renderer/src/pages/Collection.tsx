import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { makeOrigin } from '../navigation'
import type {
  Category,
  LibraryItem,
  HistoryEntry,
  UpdateEntry,
  UpdateStatus
} from '../../../shared/ipc'
import { invoke } from '../ipc'
import { Cover } from '../components/Cover'
import { useSettings } from '../store/settings'
import { useAppStore } from '../store/app'
import s from './Collection.module.css'
function Heading({ title, copy }: { title: string; copy: string }): JSX.Element {
  return (
    <div className={s.heading}>
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
    </div>
  )
}
function ActivityLayout({
  section,
  value,
  onChange
}: {
  section: 'History' | 'Updates'
  value: 'card' | 'list'
  onChange: (value: 'card' | 'list') => void
}): JSX.Element {
  return (
    <div className={s.viewToggle} role="group" aria-label={section + ' layout'}>
      <button
        type="button"
        aria-label={section + ' card view'}
        aria-pressed={value === 'card'}
        onClick={() => onChange('card')}
      >
        <LayoutGrid size={15} /> Cards
      </button>
      <button
        type="button"
        aria-label={section + ' list view'}
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <List size={15} /> List
      </button>
    </div>
  )
}
const libraryViewState = { query: '', sort: 'title', filter: 'all', source: 'all', category: -1 }
export function Library(): JSX.Element {
  const location = useLocation()
  const origin = makeOrigin(location, 'Library')
  const sources = useAppStore((v) => v.sources)
  const prefs = useSettings((v) => v.value),
    save = useSettings((v) => v.save)
  const [items, setItems] = useState<LibraryItem[]>([]),
    [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState(libraryViewState.query),
    [sort, setSort] = useState(libraryViewState.sort),
    [filter, setFilter] = useState(libraryViewState.filter),
    [source, setSource] = useState(libraryViewState.source),
    [category, setCategory] = useState(libraryViewState.category)
  useEffect(() => {
    Object.assign(libraryViewState, { query, sort, filter, source, category })
  }, [query, sort, filter, source, category])
  const [selected, setSelected] = useState<number[]>([]),
    [name, setName] = useState(''),
    [target, setTarget] = useState(''),
    [targets, setTargets] = useState<number[]>([]),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const load = useCallback(async (): Promise<void> => {
    const [rows, cats] = await Promise.all([
      invoke('collection:library'),
      invoke('categories:list')
    ])
    setItems(rows)
    setCategories(cats)
  }, [])
  useEffect(() => {
    queueMicrotask(() => void load().catch((e) => setNotice(String(e))))
  }, [load])
  const run = async (task: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      await task()
      await load()
      await useSettings.getState().load()
      setSelected([])
      await useAppStore.getState().refresh()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  const visible = items.filter(
    (m) =>
      m.title.toLowerCase().includes(query.toLowerCase()) &&
      (source === 'all' || m.source_id === Number(source)) &&
      (category === -1 ||
        (category === 0
          ? prefs.defaultShowsAll || m.categories.length === 0
          : m.categories.includes(category))) &&
      (filter === 'all' ||
        (filter === 'unread' && m.unread > 0) ||
        (filter === 'downloaded' && m.downloaded > 0) ||
        (filter === 'completed' && m.status === 2))
  )
  visible.sort((a, b) =>
    sort === 'title'
      ? a.title.localeCompare(b.title)
      : Number(b[sort as 'last_read'] ?? 0) - Number(a[sort as 'last_read'] ?? 0) ||
        a.title.localeCompare(b.title)
  )
  const toggle = (id: number): void =>
    setSelected((v) => (v.includes(id) ? v.filter((n) => n !== id) : [...v, id]))
  const bulk = (action: 'read' | 'unread' | 'remove'): void => {
    if (
      action === 'remove' &&
      !confirm('Remove selected titles from the library? Reading progress stays on this device.')
    )
      return
    void run(() => invoke('collection:bulk', selected, action))
  }
  return (
    <section className={s.page} data-testid="collection">
      <Heading
        title="Library"
        copy={`${items.length} ${items.length === 1 ? 'title' : 'titles'}, arranged your way.`}
      />
      <div className={s.tabs} role="tablist" aria-label="Library categories">
        {[{ id: -1, name: 'All titles' }, { id: 0, name: 'Default' }, ...categories].map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className={s.tools}>
        <input
          aria-label="Search library"
          placeholder="Search your library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Sort library" value={sort} onChange={(e) => setSort(e.target.value)}>
          {[
            ['title', 'Alphabetical'],
            ['last_read', 'Last read'],
            ['last_updated', 'Last updated'],
            ['unread', 'Unread count'],
            ['date_added', 'Date added']
          ].map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter library"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {['all', 'unread', 'downloaded', 'completed'].map((v) => (
            <option key={v} value={v}>
              {v === 'all' ? 'All titles' : v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Source filter"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">All sources</option>
          {[...new Set(items.map((m) => m.source_id))].map((id) => (
            <option key={id} value={id}>
              {sources.find((s) => s.id === id)?.name || 'Unavailable source'}
            </option>
          ))}
        </select>
        <button
          aria-pressed={prefs.libraryView === 'list'}
          onClick={() =>
            void run(() => save({ libraryView: prefs.libraryView === 'grid' ? 'list' : 'grid' }))
          }
        >
          {prefs.libraryView === 'grid' ? 'List view' : 'Grid view'}
        </button>
        <Link to="/updates">Check updates</Link>
      </div>
      <div className={s.libraryActions}>
        <details className={s.management}>
          <summary>Manage categories</summary>
          <form
            className={s.tools}
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await invoke('categories:save', 0, name)
                setName('')
              })
            }}
          >
            <input
              aria-label="New category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New category name"
              required
            />
            <button disabled={busy}>Create category</button>
          </form>
          {categories.map((c) => (
            <form
              className={s.tools}
              key={c.id + ':' + c.name}
              onSubmit={(e) => {
                e.preventDefault()
                const form = new FormData(e.currentTarget)
                void run(() => invoke('categories:save', c.id, String(form.get('name'))))
              }}
            >
              <input name="name" aria-label={'Rename ' + c.name} defaultValue={c.name} required />
              <button disabled={busy}>Save category</button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete category ' + c.name + '? Titles remain in your library.'))
                    void run(() => invoke('categories:delete', c.id))
                }}
              >
                Delete {c.name}
              </button>
            </form>
          ))}
        </details>
        <div className={s.selectionTools}>
          <button onClick={() => setSelected(visible.map((m) => m.id))}>Select visible</button>
          <button onClick={() => setSelected([])}>Clear selection</button>
          <span>{selected.length} selected</span>
          {selected.length > 0 && (
            <>
              <button disabled={busy} onClick={() => bulk('read')}>
                Mark read
              </button>
              <button disabled={busy} onClick={() => bulk('unread')}>
                Mark unread
              </button>
              <button disabled={busy} onClick={() => bulk('remove')}>
                Remove
              </button>
              <select
                aria-label="Assign category"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    invoke('categories:assign', selected, target ? [Number(target)] : [])
                  )
                }
              >
                Move to category
              </button>
              <details>
                <summary>Multiple categories</summary>
                {categories.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      aria-label={'Membership ' + c.name}
                      checked={targets.includes(c.id)}
                      onChange={() =>
                        setTargets((v) =>
                          v.includes(c.id) ? v.filter((id) => id !== c.id) : [...v, c.id]
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
                <button
                  disabled={busy}
                  onClick={() => void run(() => invoke('categories:assign', selected, targets))}
                >
                  Apply memberships
                </button>
              </details>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    for (const id of selected) {
                      const detail = await invoke('manga:getDetail', id)
                      await invoke(
                        'downloads:enqueue',
                        detail.chapters.filter((c) => !c.read).map((c) => c.id)
                      )
                    }
                    setNotice('Unread chapters added to the download queue')
                  })
                }
              >
                Download unread
              </button>
            </>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      <div
        className={prefs.libraryView === 'grid' ? s.grid : s.list}
        data-testid="library-items"
        data-view={prefs.libraryView}
      >
        {visible.map((m) => (
          <article
            className={s.card}
            key={m.id}
            onContextMenu={(e) => {
              e.preventDefault()
              toggle(m.id)
            }}
          >
            <input
              className={s.select}
              type="checkbox"
              aria-label={'Select ' + m.title}
              checked={selected.includes(m.id)}
              onChange={() => toggle(m.id)}
            />
            {prefs.unreadBadge && m.unread > 0 && (
              <span className={s.badge}>{m.unread} unread</span>
            )}
            <Link to={'/manga/' + m.id} state={origin} aria-label={'Open ' + m.title}>
              <Cover sourceId={m.source_id} url={m.thumbnail_url} title={m.title} />
              <div>
                <strong>{m.title}</strong>
                <small>
                  {m.downloaded > 0
                    ? m.downloaded + ' offline chapters'
                    : sources.find((source) => source.id === m.source_id)?.name ||
                      'Unavailable source'}
                </small>
              </div>
            </Link>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className={s.empty}>
          <h2>{items.length ? 'No matching titles' : 'Your library starts with a discovery.'}</h2>
          <Link to="/browse">Explore sources →</Link>
        </div>
      )}
    </section>
  )
}
export function History(): JSX.Element {
  const location = useLocation()
  const origin = makeOrigin(location, 'History')
  const view = useSettings((v) => v.value.historyView),
    save = useSettings((v) => v.save)
  const [rows, setRows] = useState<HistoryEntry[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0)
  const limit = 100
  const load = useCallback(async (): Promise<void> => {
    setRows(await invoke('history:search', query, limit, offset))
  }, [query, offset])
  useEffect(() => {
    let active = true
    void invoke('history:search', query, limit, offset)
      .then((v) => {
        if (active) setRows(v)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
    }
  }, [query, offset])
  const remove = async (id: number): Promise<void> => {
    try {
      await invoke('history:delete', id)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <section className={s.page}>
      <Heading title="History" copy="Pick up exactly where you left off." />
      <div className={s.tools}>
        <input
          aria-label="Search history"
          placeholder="Search by manga title"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOffset(0)
          }}
        />
        <button
          onClick={() => {
            if (confirm('Clear all reading history? Chapter progress will remain.')) void remove(0)
          }}
        >
          Clear all history
        </button>
        <ActivityLayout
          section="History"
          value={view}
          onChange={(value) => void save({ historyView: value }).catch((e) => setError(String(e)))}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {Object.entries(Object.groupBy(rows, (r) => new Date(r.last_read).toLocaleDateString())).map(
        ([day, entries]) => (
          <section className={s.activityGroup} key={day}>
            <h2>{day}</h2>
            <div
              className={view === 'card' ? s.activityGrid : s.activityList}
              data-testid="history-items"
              data-view={view}
            >
              {entries?.map((r) => (
                <article className={s.activityCard} key={r.chapter_id} data-testid="history-item">
                  <Link
                    className={s.activityLink}
                    to={'/reader/' + r.chapter_id}
                    state={origin}
                    aria-label={'Resume ' + r.title}
                  >
                    <div className={s.activityCover}>
                      <Cover sourceId={r.source_id} url={r.thumbnail_url} title={r.title} />
                    </div>
                    <div className={s.activityCopy}>
                      <strong>{r.title}</strong>
                      <p>{r.name}</p>
                      <span className={s.resume}>Resume page {r.last_page_read + 1}</span>
                      <small>
                        {new Date(r.last_read).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </small>
                    </div>
                  </Link>
                  <div className={s.activityActions}>
                    <button
                      aria-label={'Delete history ' + r.name}
                      onClick={() => void remove(r.chapter_id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      )}
      <div className={s.tools}>
        {offset > 0 && (
          <button onClick={() => setOffset((v) => Math.max(0, v - limit))}>Newer history</button>
        )}
        {rows.length === limit && (
          <button onClick={() => setOffset((v) => v + limit)}>Older history</button>
        )}
      </div>
      {!rows.length && <div className={s.empty}>No reading history found.</div>}
    </section>
  )
}
export function Updates(): JSX.Element {
  const location = useLocation()
  const origin = makeOrigin(location, 'Updates')
  const view = useSettings((v) => v.value.updatesView),
    save = useSettings((v) => v.save)
  const [rows, setRows] = useState<UpdateEntry[]>([]),
    [status, setStatus] = useState<UpdateStatus | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const load = useCallback(async (): Promise<void> => {
    setRows(await invoke('updates:list'))
    setStatus(await invoke('updates:status'))
  }, [])
  useEffect(() => {
    queueMicrotask(() => void load().catch((e) => setNotice(String(e))))
    const t = setInterval(() => void load().catch((e) => setNotice(String(e))), 1000)
    return () => clearInterval(t)
  }, [load])
  const run = async (task: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await task()
      await load()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={s.page}>
      <Heading title="Updates" copy="New chapters from the titles on your shelf." />
      <div className={s.tools}>
        <button
          disabled={busy || status?.running}
          onClick={() => void run(() => invoke('updates:check'))}
        >
          Update library
        </button>
        <span>
          {status?.running
            ? `${status.done}/${status.total} · ${status.current}`
            : status?.lastCheck
              ? 'Last checked ' + new Date(status.lastCheck).toLocaleString()
              : 'No library check yet'}
        </span>
        <ActivityLayout
          section="Updates"
          value={view}
          onChange={(value) => void save({ updatesView: value }).catch((e) => setNotice(String(e)))}
        />
      </div>
      {status?.running && <progress value={status.done} max={status.total || 1} />}
      {status?.errors.map((e) => (
        <p role="alert" key={e}>
          {e}
        </p>
      ))}
      {notice && (
        <p className={s.notice} role="status">
          {notice}
        </p>
      )}
      <div
        className={view === 'card' ? s.activityGrid : s.activityList}
        data-testid="updates-items"
        data-view={view}
      >
        {rows.map((r) => (
          <article key={r.id} className={s.activityCard} data-testid="update-item">
            <Link
              className={s.activityLink}
              to={'/reader/' + r.id}
              state={origin}
              aria-label={'Read ' + r.title + ' ' + r.name}
            >
              <div className={s.activityCover}>
                <Cover url={r.thumbnail_url} sourceId={r.source_id} title={r.title} />
              </div>
              <div className={s.activityCopy}>
                <strong>{r.title}</strong>
                <p>{r.name}</p>
                <span className={r.read ? s.readState : s.resume}>
                  {r.read ? 'Read' : !r.seen ? 'New chapter' : 'Unread'}
                </span>
                <small>
                  {new Date(r.discovered).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </small>
              </div>
            </Link>
            <div className={s.activityActions}>
              <button
                disabled={busy}
                onClick={() => void run(() => invoke('updates:mark', r.id, !r.read))}
              >
                {r.read ? 'Mark unread' : 'Mark read'}
              </button>
              <button
                disabled={busy || !!r.downloaded}
                onClick={() =>
                  void run(async () => {
                    const n = await invoke('chapters:download', r.id)
                    setNotice(n + ' pages cached for offline reading')
                  })
                }
              >
                {r.downloaded ? 'Offline ready' : 'Download'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className={s.empty}>
          <h2>Nothing to catch up on</h2>
          <p>Check your library to discover new chapters.</p>
        </div>
      )}
    </section>
  )
}
