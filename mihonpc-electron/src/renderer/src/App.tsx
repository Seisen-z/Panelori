import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  LibraryBig,
  Compass,
  Clock3,
  Bell,
  Ellipsis,
  FolderOpen,
  RefreshCw,
  Check,
  ChevronRight,
  Database,
  ShieldCheck,
  Laptop
} from 'lucide-react'
import { useAppStore } from './store/app'
import { invoke } from './ipc'
import styles from './App.module.css'
import { Browse } from './pages/Browse'
import { Catalog } from './pages/Catalog'
import { MangaDetail } from './pages/MangaDetail'
import { Library, History, Updates } from './pages/Collection'
import { SettingsPage, SettingsLinks } from './pages/Settings'
import { useSettings } from './store/settings'
import { Backups, Downloads, Stats, About, ReleaseLinks } from './pages/Release'
import { Reader } from './pages/Reader'
import { MoreLayout } from './components/MoreLayout'
import { useRouteScroll } from './scrollMemory'

const navigation = [
  { path: '/library', label: 'Library', icon: LibraryBig },
  { path: '/updates', label: 'Updates', icon: Bell },
  { path: '/history', label: 'History', icon: Clock3 },
  { path: '/browse', label: 'Browse', icon: Compass },
  { path: '/more', label: 'More', icon: Ellipsis }
]

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error.message, info.componentStack)
  }
  render(): ReactNode {
    return this.state.failed ? (
      <main className={styles.fatal}>
        <h1>Something interrupted the reader.</h1>
        <p>Reload the app to reconnect to your local library.</p>
        <button onClick={() => location.reload()}>Reload MihonPC</button>
      </main>
    ) : (
      this.props.children
    )
  }
}

function More(): JSX.Element {
  const { status, ping, refresh, loading } = useAppStore()
  const [folderError, setFolderError] = useState<string | null>(null)
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <h1>More</h1>
          <p>Settings, downloads and your local data.</p>
        </div>
        <span className={styles.count}>v{status?.version ?? '—'}</span>
      </div>
      <div className={styles.moreGrid}>
        <section>
          <h2>Preferences</h2>
          <p className={styles.sectionCopy}>Make the reader work your way.</p>
          <SettingsLinks />
        </section>
        <section>
          <h2>Collection tools</h2>
          <p className={styles.sectionCopy}>Offline reading, backups and your reading record.</p>
          <ReleaseLinks />
        </section>
      </div>
      <details className={styles.systemPanel}>
        <summary>Storage & diagnostics</summary>
        <div className={styles.panelTitle}>
          <Database size={20} />
          <h2>Local storage</h2>
          <span className={styles.success}>
            {status?.integrity === 'ok' ? 'Healthy' : 'Checking'}
          </span>
        </div>
        <dl>
          <div>
            <dt>Database</dt>
            <dd>SQLite · schema {status?.schemaVersion ?? '—'}</dd>
          </div>
          <div>
            <dt>Integrity check</dt>
            <dd>{status?.integrity ?? '—'}</dd>
          </div>
          <div>
            <dt>Renderer ↔ main</dt>
            <dd>{ping === 'pong' ? 'ping → pong' : 'Checking'}</dd>
          </div>
          <div>
            <dt>Stored data</dt>
            <dd>
              {status?.mangaCount ?? 0} manga · {status?.chapterCount ?? 0} chapters ·{' '}
              {status?.extensionCount ?? 0} extensions
            </dd>
          </div>
        </dl>
        <div className={styles.dataPath}>
          <FolderOpen size={17} />
          <code>{status?.databasePath ?? 'Connecting…'}</code>
        </div>
        <div className={styles.panelActions}>
          <button className={styles.secondary} onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.spin : undefined} />
            {loading ? 'Checking…' : 'Check connection'}
          </button>
          <button
            className={styles.textLink}
            onClick={() => {
              setFolderError(null)
              void invoke('app:openDataDirectory').catch((error: unknown) =>
                setFolderError(String(error))
              )
            }}
          >
            Open data folder <ArrowRight size={16} />
          </button>
        </div>
        {folderError && <p role="alert">{folderError}</p>}
      </details>
      <div className={styles.securityNote}>
        <ShieldCheck size={20} />
        <p>
          Your library and reading progress stay on this device. Back up your collection before
          moving computers.
        </p>
      </div>
    </>
  )
}

function Shell(): JSX.Element {
  const location = useLocation()
  useRouteScroll(location.pathname + location.search)
  const { status, loading, error, refresh, manga } = useAppStore()
  useEffect(() => {
    void refresh()
  }, [refresh])
  const releaseLabels: Record<string, string> = {
    '/backup': 'Backup & Restore',
    '/downloads': 'Downloads',
    '/statistics': 'Statistics',
    '/about': 'About'
  }
  const label =
    releaseLabels[location.pathname] ??
    (location.pathname.startsWith('/settings/')
      ? 'Settings'
      : location.pathname.startsWith('/source/')
        ? 'Browse'
        : location.pathname.startsWith('/manga/')
          ? 'Manga detail'
          : (navigation.find((item) => location.pathname === item.path)?.label ?? 'Library'))
  return (
    <div className={styles.shell} data-ready={!loading && !error ? 'true' : 'false'}>
      <aside className={styles.sidebar}>
        <Link to="/library" className={styles.brand}>
          <span className={styles.brandIcon}>
            <BookOpen size={23} strokeWidth={1.8} />
          </span>
          <span>
            Mihon<span className={styles.pc}>PC</span>
            <small>Personal manga reader</small>
          </span>
        </Link>
        <div className={styles.navLabel}>Collection</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ path, label: title, icon: Icon }) => (
            <NavLink
              to={path}
              key={path}
              className={({ isActive }) =>
                isActive ||
                (title === 'More' &&
                  (location.pathname.startsWith('/settings/') ||
                    Object.hasOwn(releaseLabels, location.pathname))) ||
                (title === 'Browse' &&
                  (location.pathname.startsWith('/source/') ||
                    location.pathname.startsWith('/manga/')))
                  ? styles.navActive
                  : styles.navItem
              }
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{title}</span>
              {title === 'Library' && <span className={styles.navCount}>{manga.length}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.device}>
            <Laptop size={18} />
            <span>
              Desktop edition<small>Personal edition - v{status?.version ?? '...'}</small>
            </span>
          </div>
          <div className={styles.localStatus}>
            <span className={error ? styles.errorDot : styles.dot} />
            {error ? 'Connection interrupted' : loading ? 'Connecting…' : 'Local library connected'}
          </div>
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <span>
            MihonPC <ChevronRight size={14} /> <strong>{label}</strong>
          </span>
          <span className={styles.buildLabel}>
            <span className={styles.dot} /> MihonPC {status?.version ?? ''}
          </span>
        </header>
        <main className={styles.main}>
          {error ? (
            <section className={styles.error} role="alert">
              <h1>Let’s reconnect your library</h1>
              <p>{error}</p>
              <button className={styles.primary} onClick={() => void refresh()}>
                Retry connection
              </button>
            </section>
          ) : loading && !status ? (
            <div className={styles.loading}>
              <RefreshCw className={styles.spin} />
              <p>Opening your reading space…</p>
            </div>
          ) : (
            <Routes>
              <Route path="/library" element={<Library />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/source/:sourceId" element={<Catalog />} />
              <Route path="/manga/:mangaId" element={<MangaDetail />} />
              <Route path="/history" element={<History />} />
              <Route path="/updates" element={<Updates />} />
              <Route
                path="/settings/:group"
                element={
                  <MoreLayout>
                    <SettingsPage />
                  </MoreLayout>
                }
              />
              <Route
                path="/backup"
                element={
                  <MoreLayout>
                    <Backups />
                  </MoreLayout>
                }
              />
              <Route
                path="/downloads"
                element={
                  <MoreLayout>
                    <Downloads />
                  </MoreLayout>
                }
              />
              <Route
                path="/statistics"
                element={
                  <MoreLayout>
                    <Stats />
                  </MoreLayout>
                }
              />
              <Route
                path="/about"
                element={
                  <MoreLayout>
                    <About />
                  </MoreLayout>
                }
              />
              <Route path="/more" element={<More />} />
              <Route path="*" element={<Navigate to="/library" replace />} />
            </Routes>
          )}
        </main>
        <footer className={styles.footer}>
          <span>
            <Check size={13} />{' '}
            {status ? 'Everything stays on this device' : 'Opening local database'}
          </span>
          <span>
            MihonPC {status?.version ?? ''} <span>·</span> SQLite{' '}
            {status ? 'v' + status.schemaVersion : ''}
          </span>
        </footer>
      </div>
    </div>
  )
}
export default function App(): JSX.Element {
  const prefs = useSettings((v) => v.value),
    load = useSettings((v) => v.load)
  useEffect(() => {
    void load().catch(console.error)
  }, [load])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.dataset.theme =
        prefs.theme === 'system' ? (media.matches ? 'dark' : 'light') : prefs.theme
    }
    apply()
    media.addEventListener('change', apply)
    document.documentElement.style.setProperty('--grid-columns', String(prefs.gridColumns))
    document.documentElement.style.setProperty(
      '--cover-ratio',
      prefs.coverRatio === 'square' ? '1' : '0.67'
    )
    document.documentElement.style.setProperty('--reader-background', prefs.readerBackground)
    return () => media.removeEventListener('change', apply)
  }, [prefs])
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/reader/:chapterId" element={<Reader />} />
          <Route path="*" element={<Shell />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
