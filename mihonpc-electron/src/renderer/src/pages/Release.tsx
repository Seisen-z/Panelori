import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { makeOrigin } from '../navigation'
import type { BackupProgress, DownloadStatus, Statistics } from '../../../shared/release'
import { invoke } from '../ipc'
import { useAppStore } from '../store/app'
import { useSettings } from '../store/settings'
import s from './Collection.module.css'
import { collectionTools } from '../moreNavigation'
export function ReleaseLinks(): JSX.Element {
  return (
    <div className={s.menuList}>
      {collectionTools.map(({ path, title, copy, icon: Icon }) => (
        <Link key={path} to={path}>
          <Icon size={19} />
          <span>
            <strong>{title}</strong>
            <small>{copy}</small>
          </span>
        </Link>
      ))}
    </div>
  )
}
export function Backups(): JSX.Element {
  const [status, setStatus] = useState<BackupProgress | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [include, setInclude] = useState(false)
  useEffect(() => {
    let active = true
    const load = (): void => {
      void invoke('backup:status')
        .then((v) => {
          if (active) setStatus(v)
        })
        .catch((e) => {
          if (active) setNotice(String(e))
        })
    }
    load()
    const t = setInterval(load, 400)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [])
  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      await task()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={s.page} data-testid="backups">
      <h1>Backup & Restore</h1>
      <p className={s.muted}>
        Restore a mobile Mihon .tachibk backup or a desktop .mihonbk file. Export creates a desktop
        backup with your collection, categories, reading progress and history. Extension code and
        images are not included.
      </p>
      <div className={s.panel}>
        <h2>Your collection, kept close</h2>
        <div className={s.tools}>
          <button
            disabled={busy || status?.running}
            onClick={() =>
              void run(async () => {
                const path = await invoke('backup:export')
                setNotice(path ? 'Backup saved: ' + path : 'Export cancelled')
              })
            }
          >
            Export backup
          </button>
          <label>
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => setInclude(e.target.checked)}
            />{' '}
            Restore desktop preferences too
          </label>
          <button
            disabled={busy || status?.running}
            onClick={() => {
              if (
                confirm(
                  'Merge a backup into this library? Existing reading progress will be preserved.'
                )
              )
                void run(async () => {
                  const result = await invoke('backup:import', include)
                  if (result) {
                    setStatus(result)
                    setNotice(
                      result.restored + ' titles restored; ' + result.errors.length + ' errors'
                    )
                    await useAppStore.getState().refresh()
                    await useSettings.getState().load()
                  } else setNotice('Restore cancelled')
                })
            }}
          >
            Restore backup
          </button>
        </div>
        {status?.running && <progress value={status.done} max={status.total || 1} />}
        <p>
          {status?.running
            ? `${status.done}/${status.total} titles processed`
            : status?.lastBackup
              ? 'Last export: ' + new Date(status.lastBackup).toLocaleString()
              : 'No backup exported yet'}
        </p>
        {notice && (
          <p role="status" className={s.notice}>
            {notice}
          </p>
        )}
        {status?.summary && (
          <p>
            {status.summary.favorites} Library titles / {status.summary.manga} total titles;{' '}
            {status.summary.chapters} chapters; {status.summary.history} history entries.
          </p>
        )}
        {status?.warnings?.map((warning, i) => (
          <p className={s.capability} key={'warning' + i}>
            {warning}
          </p>
        ))}
        {status?.errors.map((error, i) => (
          <p key={i} role="alert">
            {error}
          </p>
        ))}
      </div>
      <Link to="/settings/backup">Automatic backup schedule →</Link>
    </section>
  )
}
export function Downloads(): JSX.Element {
  const origin = makeOrigin(useLocation(), 'Downloads')
  const [data, setData] = useState<DownloadStatus>({ jobs: [], waiting: '' }),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const load = useCallback(async (): Promise<void> => setData(await invoke('downloads:list')), [])
  useEffect(() => {
    let active = true
    const poll = (): void => {
      void invoke('downloads:list')
        .then((v) => {
          if (active) setData(v)
        })
        .catch((e) => {
          if (active) setNotice(String(e))
        })
    }
    poll()
    const t = setInterval(poll, 400)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [])
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
  const offline = useSettings((v) => v.value.offlineOnly)
  return (
    <section className={s.page} data-testid="downloads">
      <h1>Downloads</h1>
      <p className={s.muted}>
        Jobs survive app restarts. Pause and cancel take effect at the next page boundary.
      </p>
      <div className={s.tools}>
        <button disabled={busy} onClick={() => void run(() => invoke('downloads:all', 'pause'))}>
          Pause all
        </button>
        <button disabled={busy} onClick={() => void run(() => invoke('downloads:all', 'resume'))}>
          Resume all
        </button>
        <button
          aria-pressed={offline}
          onClick={() => void run(() => useSettings.getState().save({ offlineOnly: !offline }))}
        >
          {offline ? 'Disable offline mode' : 'Enable offline mode'}
        </button>
        <Link to="/settings/downloads">Storage & concurrency →</Link>
      </div>
      {data.waiting && <p className={s.notice}>{data.waiting}</p>}
      {notice && <p role="alert">{notice}</p>}
      {data.jobs.map((j) => (
        <article className={s.panel} key={j.chapter_id} data-state={j.state}>
          <div className={s.heading}>
            <div>
              <Link to={'/reader/' + j.chapter_id} state={origin}>
                <strong>{j.title}</strong>
                <p>{j.name}</p>
              </Link>
              <small>
                {j.state} · {j.done}/{j.total || '?'} pages
              </small>
            </div>
            <span>{j.total ? Math.round((j.done / j.total) * 100) : 0}%</span>
          </div>
          <progress value={j.done} max={j.total || 1} />
          {j.error && <p role="alert">{j.error}</p>}
          <div className={s.tools}>
            {['queued', 'downloading'].includes(j.state) && (
              <button
                disabled={busy}
                onClick={() => void run(() => invoke('downloads:action', j.chapter_id, 'pause'))}
              >
                Pause
              </button>
            )}
            {['paused', 'error', 'cancelled'].includes(j.state) && (
              <button
                disabled={busy}
                onClick={() => void run(() => invoke('downloads:action', j.chapter_id, 'resume'))}
              >
                Resume
              </button>
            )}
            {['queued', 'downloading', 'paused', 'error'].includes(j.state) && (
              <button
                disabled={busy}
                onClick={() => void run(() => invoke('downloads:action', j.chapter_id, 'cancel'))}
              >
                Cancel
              </button>
            )}
            {!['queued', 'downloading'].includes(j.state) && (
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm('Remove this job and its downloaded page files?'))
                    void run(() => invoke('downloads:action', j.chapter_id, 'delete'))
                }}
              >
                Delete download
              </button>
            )}
            {j.state === 'completed' && (
              <Link to={'/reader/' + j.chapter_id} state={origin}>
                Read offline →
              </Link>
            )}
          </div>
        </article>
      ))}
      {!data.jobs.length && (
        <div className={s.empty}>
          <h2>No downloads queued</h2>
          <p>Use Download unread on a manga or Download in Updates.</p>
          <Link to="/library">Open library →</Link>
        </div>
      )}
    </section>
  )
}
export function Stats(): JSX.Element {
  const [stats, setStats] = useState<Statistics | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    void invoke('app:statistics')
      .then(setStats)
      .catch((e) => setError(String(e)))
  }, [])
  return (
    <section className={s.page}>
      <h1>Statistics</h1>
      <p className={s.muted}>A local reading record. No analytics are sent anywhere.</p>
      {error && <p role="alert">{error}</p>}
      {stats && (
        <div className={s.groups}>
          {Object.entries({
            Titles: stats.titles,
            'Stored chapters': stats.chapters,
            'Chapters read': stats.read,
            'Reading minutes': stats.minutes,
            'Offline chapters': stats.offline,
            'History entries': stats.sessions
          }).map(([label, value]) => (
            <div className={s.panel} key={label}>
              <span className={s.eyebrow}>{label}</span>
              <h2>{value}</h2>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
export function About(): JSX.Element {
  const version = useAppStore((v) => v.status?.version),
    [message, setMessage] = useState('')
  return (
    <section className={s.page}>
      <h1>About MihonPC</h1>
      <div className={s.panel}>
        <h2>Personal edition · {version}</h2>
        <p>
          Your library, backups and downloads stay on your device. No tracker accounts, OAuth
          connections or telemetry.
        </p>
        <button
          onClick={() =>
            void invoke('app:checkUpdate')
              .then((v) => setMessage(v.message))
              .catch((e) => setMessage(String(e)))
          }
        >
          Check for updates
        </button>
        {message && (
          <p role="status" className={s.notice}>
            {message}
          </p>
        )}
      </div>
      <div className={s.panel}>
        <h2>Keyboard shortcuts</h2>
        <p>Ctrl+1 Library · Ctrl+2 Updates · Ctrl+3 History · Ctrl+4 Browse · Ctrl+5 More</p>
        <p>Ctrl+D Downloads · Ctrl+B Backups · Ctrl+, Settings</p>
        <p>Reader: Arrow keys / Page Up / Page Down · Home / End · F Full screen · Escape Back</p>
        <p>
          The menu bar appears with Alt. The tray menu provides Show, Pause downloads and Quit.
          Close-to-tray is optional in Advanced settings.
        </p>
      </div>
    </section>
  )
}
