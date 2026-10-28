import { useEffect, useState } from 'react'
import { invoke } from '../ipc'
import { BrandIcon } from './BrandIcon'
import type { ExtensionInfo } from '../../../shared/source'
import type { ExtensionRepository, RepositoryExtension } from '../../../shared/repositories'
import styles from '../pages/Reading.module.css'

export function RepositoryBrowser({
  revision,
  onInstalled,
  showNsfw
}: {
  showNsfw: boolean
  revision: ExtensionInfo[]
  onInstalled: () => Promise<void>
}): JSX.Element {
  const [repos, setRepos] = useState<ExtensionRepository[]>([]),
    [entries, setEntries] = useState<RepositoryExtension[]>([])
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const refresh = async (): Promise<void> => {
    const [r, e] = await Promise.all([invoke('repos:list'), invoke('repos:extensions')])
    setRepos(r)
    setEntries(e)
  }
  useEffect(() => {
    let live = true
    void Promise.all([invoke('repos:list'), invoke('repos:extensions')]).then(
      ([r, e]) => {
        if (live) {
          setRepos(r)
          setEntries(e)
        }
      },
      (e) => {
        if (live) setError(String(e))
      }
    )
    return () => {
      live = false
    }
  }, [revision])
  const act = async (run: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await run()
      await onInstalled()
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const visible = entries.filter(
    (e) =>
      (showNsfw || !e.isNsfw) && (e.name + ' ' + e.lang).toLowerCase().includes(query.toLowerCase())
  )
  return (
    <section className={styles.extensionList} aria-label="Repository catalogue">
      <h2>Repositories</h2>
      {repos.map((repo) => (
        <article key={repo.indexUrl}>
          <BrandIcon kind="repository" id={repo.indexUrl} name={repo.name} />
          <div>
            <strong>{repo.name}</strong>
            <p>{repo.indexUrl}</p>
          </div>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm('Remove repository ' + repo.name + '? Installed extensions stay.'))
                void act(() => invoke('repos:remove', repo.indexUrl))
            }}
          >
            Remove repository
          </button>
        </article>
      ))}
      {!repos.length && <p>No repositories added. Paste the published index URL above.</p>}
      <div className={styles.sectionHeading}>
        <h2>Available extensions ({visible.length})</h2>
        <input
          aria-label="Search repository extensions"
          placeholder="Search extensions or language"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {visible.slice(0, 80).map((e) => (
        <article key={e.pkgName}>
          <BrandIcon kind="extension" id={e.pkgName} name={e.name} revision={e.versionName} />
          <div>
            <strong>{e.name}</strong>
            <p>
              {e.lang.toUpperCase()} · {e.versionName} {e.installed ? '· Installed' : ''}
            </p>
          </div>
          <button
            disabled={busy || (e.installed && !e.hasUpdate)}
            onClick={() => {
              if (
                confirm(
                  'Install executable extension ' + e.name + ' from your configured repository?'
                )
              )
                void act(() => invoke('repos:install', e.pkgName))
            }}
          >
            {e.installed ? (e.hasUpdate ? 'Update' : 'Installed') : 'Install'}
          </button>
        </article>
      ))}
      {visible.length > 80 && <p>Showing the first 80. Search to narrow the catalogue.</p>}
    </section>
  )
}
