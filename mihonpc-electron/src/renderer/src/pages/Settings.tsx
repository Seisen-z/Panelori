import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { defaultSettings, type Settings } from '../../../shared/settings'
import { useSettings } from '../store/settings'
import { invoke } from '../ipc'
import { useAppStore } from '../store/app'
import s from './Collection.module.css'
import { preferenceGroups } from '../moreNavigation'
const settingsGroups = preferenceGroups.map(({ id, title, copy }) => [id, title, copy])
export function SettingsLinks(): JSX.Element {
  return (
    <div className={s.menuList}>
      {preferenceGroups.map(({ id, title, copy, icon: Icon }) => (
        <Link key={id} to={'/settings/' + id}>
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
export function SettingsPage(): JSX.Element {
  const { group = 'appearance' } = useParams(),
    { value, save } = useSettings()
  const [baseline, setBaseline] = useState(value)
  const [draft, setDraft] = useState<Settings>(value),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [cats, setCats] = useState<{ id: number; name: string }[]>([])
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof Settings] !== baseline[key as keyof Settings]
  )
  useEffect(() => {
    queueMicrotask(() => {
      if (!dirty) {
        setDraft(value)
        setBaseline(value)
      }
    })
  }, [value, dirty])
  useEffect(() => {
    const latest = useSettings.getState().value
    queueMicrotask(() => {
      setBaseline(latest)
      setDraft(latest)
      setNotice('')
    })
  }, [group])
  useEffect(() => {
    if (!dirty) return
    const leave = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    const follow = (event: MouseEvent): void => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        link &&
        link.getAttribute('href') !== location.hash &&
        !confirm('Discard unsaved settings changes?')
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', leave)
    document.addEventListener('click', follow, true)
    return () => {
      window.removeEventListener('beforeunload', leave)
      document.removeEventListener('click', follow, true)
    }
  }, [dirty])
  useEffect(() => {
    void invoke('categories:list')
      .then(setCats)
      .catch((e) => setNotice(String(e)))
  }, [])
  const field = (
    key: keyof Settings,
    label: string,
    options?: [string, string][],
    help?: string,
    disabled = false
  ): JSX.Element => (
    <label className={s.setting} key={key}>
      <span>
        {label}
        {help && <small>{help}</small>}
      </span>
      {options ? (
        <select
          aria-label={label}
          disabled={disabled}
          value={String(draft[key])}
          onChange={(e) =>
            setDraft((v) => ({
              ...v,
              [key]:
                typeof defaultSettings[key] === 'number' ? Number(e.target.value) : e.target.value
            }))
          }
        >
          {options.map(([id, title]) => (
            <option value={id} key={id}>
              {title}
            </option>
          ))}
        </select>
      ) : typeof draft[key] === 'boolean' ? (
        <input
          aria-label={label}
          disabled={disabled}
          type="checkbox"
          checked={Boolean(draft[key])}
          onChange={(e) => setDraft((v) => ({ ...v, [key]: e.target.checked }))}
        />
      ) : (
        <input
          aria-label={label}
          disabled={disabled}
          type={
            key === 'readerBackground'
              ? 'color'
              : typeof draft[key] === 'number'
                ? 'number'
                : 'text'
          }
          min={
            (
              {
                updateHours: 0,
                preload: 0,
                concurrentDownloads: 1,
                backupHours: 0,
                maxBackups: 1
              } as Record<string, number>
            )[key]
          }
          max={
            (
              {
                updateHours: 168,
                preload: 10,
                concurrentDownloads: 5,
                backupHours: 720,
                maxBackups: 100
              } as Record<string, number>
            )[key]
          }
          step={typeof draft[key] === 'number' ? 1 : undefined}
          value={String(draft[key])}
          onChange={(e) =>
            setDraft((v) => ({
              ...v,
              [key]:
                typeof defaultSettings[key] === 'number' ? Number(e.target.value) : e.target.value
            }))
          }
        />
      )}
    </label>
  )
  const action = async (task: () => Promise<unknown>, message: string): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      await task()
      setNotice(message)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={s.page} data-testid="settings">
      <div className={s.heading}>
        <div>
          <h1>{settingsGroups.find((g) => g[0] === group)?.[1] ?? 'Settings'}</h1>
          <p>
            {preferenceGroups.find((g) => g.id === group)?.copy ??
              'Preferences stay on this device.'}
          </p>
        </div>
      </div>

      <form
        className={s.settingsForm}
        data-dirty={dirty}
        onSubmit={(e) => {
          e.preventDefault()
          const patch = Object.fromEntries(
            Object.entries(draft).filter(([key, val]) => val !== baseline[key as keyof Settings])
          ) as Partial<Settings>
          void action(async () => {
            await save(patch)
            const latest = useSettings.getState().value
            setBaseline(latest)
            setDraft(latest)
          }, 'Settings saved')
        }}
      >
        {group === 'appearance' && (
          <>
            <div className={s.settingsSection}>
              <h2>Display</h2>
              <p>Choose the appearance of the desktop app.</p>
            </div>
            {field('theme', 'Theme', [
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark']
            ])}
            <p className={s.capability}>
              Interface language: English. Additional translations are not bundled.
            </p>
            <div className={s.settingsSection}>
              <h2>Cover shelf</h2>
              <p>Library covers stay compact even with a small collection.</p>
            </div>
            {field(
              'gridColumns',
              'Grid columns',
              Array.from({ length: 7 }, (_, i) => [String(i + 2), String(i + 2)])
            )}
            {field('coverRatio', 'Cover ratio', [
              ['portrait', 'Portrait'],
              ['square', 'Square']
            ])}
          </>
        )}
        {group === 'library' && (
          <>
            <div className={s.settingsSection}>
              <h2>Chapter updates</h2>
              <p>Scheduled checks run while MihonPC is open and online.</p>
            </div>
            {field(
              'updateHours',
              'Update interval (hours)',
              undefined,
              '0 disables scheduled checks; default 12. Checks run while the app is open.'
            )}
            {field('chargeOnly', 'Only check on AC power')}
            {field('notifications', 'System notifications')}
            <div className={s.settingsSection}>
              <h2>Collection</h2>
              <p>Default categories and reading-state indicators.</p>
            </div>
            {field('unreadBadge', 'Show unread badge')}
            {field('defaultShowsAll', 'Default tab shows all titles')}
            {field('defaultCategory', 'New titles category', [
              ['0', 'Uncategorized'],
              ...cats.map((c) => [String(c.id), c.name] as [string, string])
            ])}
          </>
        )}
        {group === 'reader' && (
          <>
            <div className={s.settingsSection}>
              <h2>Reading defaults</h2>
              <p>Titles with their own reader preferences keep those overrides.</p>
            </div>
            {field('readerMode', 'Default reading mode', [
              ['pager', 'Pager'],
              ['vertical', 'Vertical pager'],
              ['webtoon', 'Webtoon']
            ])}
            {field('direction', 'Reading direction', [
              ['ltr', 'Left to right'],
              ['rtl', 'Right to left']
            ])}
            {field('preload', 'Preload pages')}
            {field('tapZones', 'Enable tap zones')}
            <div className={s.settingsSection}>
              <h2>Display & desktop</h2>
              <p>Reader appearance and window behavior.</p>
            </div>
            {field(
              'imageFit',
              'Pager image fit',
              [
                ['screen', 'Fit screen'],
                ['width', 'Fit width'],
                ['height', 'Fit height'],
                ['original', 'Original size']
              ],
              'Applies to pager modes. Webtoon keeps its continuous-width layout.'
            )}
            {field(
              'showPageNumber',
              'Show page number',
              undefined,
              'Shows a small page counter when reader controls are hidden.'
            )}
            {field('readerBackground', 'Reader background')}
            {field('fullscreen', 'Open reader full screen')}
            {field(
              'keepScreenOn',
              'Keep display awake',
              undefined,
              'Keeps the display awake only while a visible reader is open. Applies within 10 seconds.'
            )}
          </>
        )}
        {group === 'downloads' && (
          <>
            <p className={s.muted}>
              Downloads are persistent and separate from the temporary image cache. Existing
              downloads stay at their original location when you choose a new folder.
            </p>
            {field('downloadLocation', 'Download location')}
            <button
              type="button"
              onClick={() =>
                void action(async () => {
                  const folder = await invoke('settings:pickDirectory', 'downloadLocation')
                  if (folder) setDraft((v) => ({ ...v, downloadLocation: folder }))
                }, 'Folder selected; save settings to apply')
              }
            >
              Choose download folder
            </button>
            {field('offlineOnly', 'Offline mode')}
            {field('wifiOnly', 'Wi-Fi only')}
            {field(
              'autoDelete',
              'Delete after reading',
              undefined,
              'Removes a completed download when you finish it in the reader. Bulk marking read does not delete files.'
            )}
            {field('concurrentDownloads', 'Concurrent downloads')}
          </>
        )}
        {group === 'backup' && (
          <>
            <p className={s.muted}>
              Automatic backups run while the app is open. Set frequency to 0 to disable.
            </p>
            {field('backupHours', 'Backup frequency (hours)')}
            {field('backupLocation', 'Backup location')}
            <button
              type="button"
              onClick={() =>
                void action(async () => {
                  const folder = await invoke('settings:pickDirectory', 'backupLocation')
                  if (folder) setDraft((v) => ({ ...v, backupLocation: folder }))
                }, 'Folder selected; save settings to apply')
              }
            >
              Choose backup folder
            </button>
            <Link to="/backup">Export or restore now</Link>
            {field('maxBackups', 'Backups to keep')}
          </>
        )}
        {group === 'browse' && (
          <>
            <div className={s.settingsSection}>
              <h2>Sources & catalogues</h2>
              <p>These preferences also apply when you return to Browse.</p>
            </div>
            {field(
              'showNsfw',
              'Show NSFW sources and extensions',
              undefined,
              'Includes adult-labelled sources and repository extensions in Browse.'
            )}
            {field(
              'hideInLibrary',
              'Hide titles already in Library',
              undefined,
              'Matches the same source and title URL. Catalogue pagination continues through hidden results.'
            )}
          </>
        )}
        {group === 'network' && (
          <>
            <div className={s.settingsSection}>
              <h2>Connection behavior</h2>
              <p>Repository extensions use the bundled JVM engine.</p>
            </div>
            <div className={s.capability}>
              <strong>System DNS</strong>
              <p>
                The system resolver is used. Custom DNS over HTTPS is not implemented for the
                desktop runtime.
              </p>
            </div>
            <div className={s.capability}>
              <strong>Extension request headers</strong>
              <p>
                Each extension controls its request headers. The app-level user-agent override only
                affects the legacy JavaScript test broker, not production repository sources, so it
                is not offered as a working source setting.
              </p>
            </div>
            <Link to="/settings/downloads">Manage offline mode in Downloads settings</Link>
          </>
        )}
        {group === 'advanced' && (
          <>
            <p>No analytics are collected.</p>
            {field('closeToTray', 'Close window to tray')}
            <div className={s.settingsSection}>
              <h2>Maintenance</h2>
              <p>Offline downloads are separate from the disposable image cache.</p>
            </div>
            <div className={s.tools}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      'Clear temporary page images? Dedicated offline downloads will be kept.'
                    )
                  )
                    void action(() => invoke('data:clearCache'), 'Image cache cleared')
                }}
              >
                Clear image cache
              </button>
              <label>
                Delete manga, chapters, history and categories:{' '}
                <input
                  aria-label="Confirm library deletion"
                  placeholder="Type DELETE"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <button
                className={s.danger}
                type="button"
                disabled={busy || confirmation !== 'DELETE'}
                onClick={() =>
                  void action(async () => {
                    await invoke('data:clearLibrary', confirmation)
                    setConfirmation('')
                    await useAppStore.getState().refresh()
                  }, 'Library data cleared; extensions and preferences retained')
                }
              >
                Clear library data
              </button>
              <button
                type="button"
                onClick={() =>
                  void action(() => invoke('app:openDataDirectory'), 'Data folder opened')
                }
              >
                Open data folder
              </button>
            </div>
          </>
        )}
        <div className={s.settingsActions}>
          <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <button disabled={busy} type="submit">
            Save settings
          </button>
          <button
            type="button"
            onClick={() => {
              setBaseline(value)
              setDraft(value)
              setNotice('Changes discarded')
            }}
          >
            Discard changes
          </button>
        </div>
        {notice && (
          <p className={s.notice} role="status">
            {notice}
          </p>
        )}
      </form>
    </section>
  )
}
