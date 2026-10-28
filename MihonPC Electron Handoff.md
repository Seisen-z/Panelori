📚

MihonPC Electron

Codex Handoff v1

Overview

[What This Is](#what) [Tech Stack](#stack) [Project Structure](#structure)

Features

[Full Feature Map](#features) [Library](#library) [Browse / Extensions](#browse) [Reader](#reader) [History](#history) [Updates](#updates) [Trackers](#trackers) [Backup & Restore](#backup) [Settings](#settings)

Architecture

[Database Schema](#database) [Extension System](#extensions) [IPC Design](#ipc) [OAuth / Trackers](#oauth)

Execution

[Build Phases](#phases) [Context from Kotlin](#context) [Agent Rules](#rules)

Codex Handoff Document

# MihonPC — Electron Rewrite

Electron + TypeScript Full Mihon Parity Not Started 2026-10-26

ℹ️

This document is the single source of truth for the Electron rewrite of MihonPC. A working Kotlin/Compose Multiplatform prototype exists at `E:\MihonPC` — reference it for design decisions but do not port its Kotlin code. Build fresh in TypeScript.

## What This Is

Mihon is the leading open-source Android manga reader (fork of Tachiyomi). MihonPC is a desktop-native port that delivers the same experience on Windows, macOS, and Linux via Electron. Users manage a local library, browse sources via extensions, read chapters, sync read progress to trackers (AniList, MyAnimeList, etc.), and back up their data.

The Android app's source: [github.com/mihonapp/mihon](https://github.com/mihonapp/mihon). Reference the Mihon docs at [mihon.app/docs](https://mihon.app/docs/guides/getting-started) for user-facing behavior.

⚠️

**Primary constraint:** Extensions are the only source of manga content. MihonPC ships with zero built-in sources. The extension system must work before anything else is useful.

## Tech Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Shell | Electron 33+ | Native window, Node.js access, cross-platform |
| Language | TypeScript 5.x (strict) | Full type safety, great DX |
| UI | React 18 + Vite | Component model, fast HMR, ecosystem |
| Routing | React Router v6 (hash mode) | Works in Electron without a server |
| State | Zustand | Simple, no boilerplate, easy persistence |
| Database | better-sqlite3 (main process) | Synchronous, no server, battle-tested |
| Migrations | Custom versioned SQL files | Full control, easy to audit |
| HTTP | Node.js `https` / `got` (main process) | Extensions run in Node, not browser |
| Image cache | Disk cache in `userData` | Persist across sessions |
| Extensions | VM2 sandbox or child_process isolation | Run untrusted extension JS safely |
| Packaging | electron-builder | NSIS/DMG/AppImage installers |
| Styling | CSS Modules + CSS variables | Scoped, theme-aware, zero runtime |

💡

All network requests (extension HTTP, tracker API) must go through the **main process** via IPC. The renderer has no direct internet access. This mirrors how Android extensions run in the app's process, not a WebView.

## Project Structure

mihonpc-electron/\
├── src/\
│ ├── main/ # Electron main process (Node.js)\
│ │ ├── index.ts # createWindow, app lifecycle\
│ │ ├── ipc.ts # All IPC handler registration\
│ │ ├── db.ts # Database singleton + migrations\
│ │ ├── extensions/\
│ │ │ ├── loader.ts # Discovers + loads extension JS files\
│ │ │ ├── sandbox.ts # VM2 sandbox, injects fetch shim\
│ │ │ └── registry.ts # Source ID → extension map\
│ │ ├── sources/\
│ │ │ ├── manga.ts # getMangaList, getMangaDetail\
│ │ │ ├── chapters.ts # getChapterList, getPageList\
│ │ │ └── search.ts # searchManga\
│ │ ├── trackers/\
│ │ │ ├── anilist.ts # AniList OAuth + API\
│ │ │ ├── mal.ts # MyAnimeList OAuth + API\
│ │ │ └── oauth-server.ts # Loopback HTTP for PKCE redirect\
│ │ ├── backup.ts # Export/import .tachibk (proto) or JSON\
│ │ └── downloader.ts # Chapter download queue\
│ │\
│ ├── renderer/ # React app (runs in Electron renderer)\
│ │ ├── App.tsx # Router, global providers\
│ │ ├── pages/\
│ │ │ ├── Library.tsx # Grid/list, sort, filter, search\
│ │ │ ├── Browse.tsx # Extension list + catalog tabs\
│ │ │ ├── History.tsx # Reading history, resume\
│ │ │ ├── Updates.tsx # Chapter update feed\
│ │ │ ├── More.tsx # Settings, Backup, Stats, About\
│ │ │ ├── MangaDetail.tsx # Cover, info, chapter list\
│ │ │ └── Reader.tsx # Pager / webtoon reader\
│ │ ├── components/\
│ │ │ ├── MangaCard.tsx\
│ │ │ ├── ChapterRow.tsx\
│ │ │ ├── ReaderPager.tsx\
│ │ │ ├── ReaderWebtoon.tsx\
│ │ │ └── TrackerPanel.tsx\
│ │ ├── store/ # Zustand stores\
│ │ │ ├── library.ts\
│ │ │ ├── reader.ts\
│ │ │ └── settings.ts\
│ │ └── ipc/ # Typed wrappers around ipcRenderer.invoke\
│ │ └── index.ts\
│ │\
│ └── preload/\
│ └── index.ts # contextBridge: exposes ipc.invoke only\
│\
├── extensions/ # Drop .js extension files here at runtime\
├── migrations/ # 001_init.sql, 002_add_tracker.sql, …\
├── package.json\
├── electron-builder.yml\
└── vite.config.ts

## Full Feature Map

Every feature below must be implemented. Priority order matches Mihon's own navigation structure.

📚

Library

Local manga collection, categories, sort/filter, bulk actions

🔍

Browse

Extension catalog, search, latest, filters

📖

Reader

Pager + webtoon, zoom, direction, page preload

🕒

History

Reading history, resume chapter, delete entries

🔔

Updates

New chapter feed, background check, mark read

🔌

Extensions

Install from URL or file, enable/disable, NSFW toggle

📡

Trackers

AniList, MAL, Kitsu — OAuth, sync read progress

💾

Backup

Export/import .tachibk-compatible JSON, scheduled auto-backup

⬇️

Downloader

Queue chapters for offline reading, manage downloads

🏷️

Categories

Organize library into named tabs

📊

Statistics

Chapters read, time spent, series count

⚙️

Settings

Appearance, reader, library, network, data

## Library

The library is the home screen. It shows all favorited manga as a grid of cover art. Tapping a cover opens the manga's detail page.

### Required behaviors

- Grid view (default, 3 columns on desktop) and list view toggle
- Sort: alphabetical, last read, last updated, unread count, date added
- Filter: unread only, downloaded only, completed, by category, by tracker, by source
- Search: live filter by title within library
- Categories: multiple named tabs above the grid; manga can belong to multiple categories; Default shows uncategorized or all depending on settings
- Long-press / right-click for multi-select; bulk actions: mark read, remove, move to category, download
- Badge on covers: unread chapter count
- Background update check: poll sources for new chapters on a configurable interval (default: every 12 hours, via `setInterval` in main process)
- Update notifications: `new Notification()` from main process when new chapters found

### Data requirements

```
-- mangas table stores library entries
SELECT * FROM mangas WHERE favorite = 1 ORDER BY title;
```

## Browse / Extensions

Browse is split into two sub-tabs: **Sources** (the actual catalog) and **Extensions** (the management panel).

### Sources tab

- List all installed, enabled sources grouped by language
- Each source has a "Browse" action (opens that source's popular/latest feed) and a "Latest" action
- Global search: searches across all pinned sources simultaneously
- Source browse page: infinite scroll, cover grid, search bar, filter sheet (extension-provided FilterList)
- Manga detail accessible from any source browse result

### Extensions tab

- List installed extensions with version, language flag, NSFW badge
- Install from URL (fetch JS file, write to extensions dir, reload registry)
- Install from local `.js` file (file picker dialog)
- Uninstall: delete file + remove from registry
- Enable/disable per extension (persisted in DB)
- NSFW filter toggle: hide extensions with `nsfw: true`

⚠️

Extension JS files run with full Node.js access in the main process. Use VM2 or Node's `vm.runInNewContext` with a fetch shim. Never run extension code in the renderer.

## Reader

The reader is a full-screen view. It replaces the normal window chrome with a black background and a dismissible overlay.

### Reading modes

- **Pager (horizontal)** — one page at a time, left-to-right or right-to-left (for Japanese manga)
- **Pager (vertical)** — page per "swipe" but navigates top-to-bottom
- **Continuous (webtoon)** — infinite scroll, appropriate for Korean manhwa
- Mode persists per-manga and globally as default

### Required controls

- Tap center: toggle overlay (back button, title, progress bar, page counter)
- Tap left/right thirds: prev/next page (pager mode)
- Keyboard: arrow keys, Page Up/Down, Home/End
- Zoom: pinch-to-zoom or scroll wheel + Ctrl
- Progress bar: scrub to any page, shows chapter position
- Prev/next chapter navigation
- Long-press / right-click on page: "Save image", "Copy to clipboard"

### Image loading

- Page list fetched via IPC: `ipc.invoke('source:getPageList', chapterId)`
- Images proxied through main process (extension returns URL; main fetches and returns buffer)
- Disk cache: store pages at `userData/cache/<sourceId>/<chapterId>/<pageIndex>.jpg`
- Preload N pages ahead (configurable, default 3)
- Retry on failure, show error state per page

### History write

```
-- Write on every page change
INSERT OR REPLACE INTO history (chapter_id, last_read, time_read)
VALUES (?, ?, ?);
```

## History

- Shows manga with their most recently read chapter and timestamp
- Grouped by day (Today, Yesterday, older dates)
- Tapping an entry resumes from the last read page in the reader
- Swipe-to-delete or right-click → delete entry
- Search bar to filter by title
- "Clear all history" action with confirmation

## Updates

- Shows newly discovered chapters across all library manga, newest first
- Each row: manga cover thumbnail, title, chapter name, timestamp
- Tap: open that chapter in reader
- Long-press: mark read, download
- "Update library" button: triggers background refresh of all sources
- Progress indicator during refresh (per-source status)
- Chapters marked as "seen in updates" so they don't resurface after being read

## Trackers

Trackers sync read progress to external services. Accessed from the manga detail page and the More tab.

### Supported trackers (implement in this order)

1. **AniList** — OAuth2 PKCE, GraphQL API
2. **MyAnimeList** — OAuth2 PKCE, REST API v2
3. **Kitsu** — OAuth2 password flow or PKCE, JSON:API

### OAuth flow (all trackers)

1. Main process starts a local HTTP server on a random port (e.g. `127.0.0.1:58432`)
2. Open the tracker's auth URL in the system browser via `shell.openExternal()`
3. Tracker redirects to `http://127.0.0.1:58432/callback?code=…`
4. Main process captures code, exchanges for tokens, stores encrypted in `userData/tokens.enc`
5. Close the local server

### Sync behavior

- After reading a chapter: if manga is tracked, fire `tracker.updateProgress(seriesId, chaptersRead)`
- On manga detail open: fetch current remote status and show it in the tracker panel
- User can set status (Reading, Completed, Dropped…), score, and start/end dates from the panel

```
-- tokens table
CREATE TABLE tracker_tokens (
  tracker TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER
);
```

## Backup & Restore

Use a JSON format compatible with Mihon's `.tachibk` structure (which is a protobuf; for the desktop build, JSON is acceptable and easier to implement — name the file `.mihonbk`).

### Backup includes

- All favorited manga: URL, sourceId, title, author, description, genre, status, cover URL
- All chapters per manga: URL, name, scanlator, read status, last page read
- Reading history (chapter_id + timestamp)
- Categories and their assignments
- Tracker bindings (tracker name + remote series ID; NOT tokens)
- Settings snapshot (optional)

### Restore behavior

- Parse JSON, insert or update rows (use `INSERT OR REPLACE`)
- Match existing manga by URL + sourceId; don't duplicate
- Show a progress dialog with counts (X manga restored, Y chapters restored)
- Errors per entry are non-fatal; continue and report a summary

### Auto-backup

- Configurable interval (daily default) stored in settings
- Main process uses `setInterval`; writes to `userData/backups/`
- Keep last N backups (default 5), delete older ones

## Settings

Settings are stored as a flat JSON file at `userData/settings.json` and also mirrored to the DB for queries. Accessed from the More tab.

| Group | Key settings |
| --- | --- |
| Appearance | Theme (light/dark/system), language, grid columns, cover ratio |
| Library | Update interval, update on charge only, show unread badge, default category |
| Reader | Default mode (pager/webtoon), reading direction, preload pages, tap zones, background color, full-screen, keep screen on |
| Downloads | Download location, wifi-only, auto-delete after read, concurrent downloads |
| Tracking | Auto-update trackers on chapter read |
| Backup | Auto-backup frequency, backup location, max backups kept |
| Network | User-agent override, DNS over HTTPS |
| Advanced | Clear image cache, clear database, enable/disable analytics |

## Database Schema

SQLite via `better-sqlite3` in the main process. File at `userData/mihonpc.db`. Schema is managed by sequential migration files.

```
-- Migration 001: core schema

CREATE TABLE mangas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id        INTEGER NOT NULL,
  url              TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  author           TEXT,
  artist           TEXT,
  description      TEXT,
  genre            TEXT,       -- comma-separated
  status           INTEGER NOT NULL DEFAULT 0,
                               -- 0=unknown 1=ongoing 2=completed 3=licensed 4=publishing_finished 5=cancelled 6=on_hiatus
  thumbnail_url    TEXT,
  favorite         INTEGER NOT NULL DEFAULT 0,  -- 0/1 bool
  date_added       INTEGER,    -- epoch ms when added to library
  viewer_flags     INTEGER NOT NULL DEFAULT 0,  -- reader mode bitmask
  chapter_flags    INTEGER NOT NULL DEFAULT 0,  -- sort/filter bitmask
  cover_last_modified INTEGER NOT NULL DEFAULT 0,
  update_strategy  INTEGER NOT NULL DEFAULT 0,  -- 0=always 1=only_fetch_once
  initialized      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, url)
);

CREATE TABLE chapters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id        INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  url             TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  scanlator       TEXT,
  read            INTEGER NOT NULL DEFAULT 0,
  bookmark        INTEGER NOT NULL DEFAULT 0,
  last_page_read  INTEGER NOT NULL DEFAULT 0,
  date_fetch      INTEGER NOT NULL DEFAULT 0,   -- epoch ms when fetched
  date_upload     INTEGER NOT NULL DEFAULT 0,   -- epoch ms from source
  chapter_number  REAL    NOT NULL DEFAULT -1,
  source_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(manga_id, url)
);

CREATE TABLE history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id  INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  last_read   INTEGER NOT NULL,  -- epoch ms
  time_read   INTEGER NOT NULL DEFAULT 0,  -- ms spent reading
  UNIQUE(chapter_id)
);

CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL UNIQUE,
  sort  INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE manga_categories (
  manga_id    INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (manga_id, category_id)
);

CREATE TABLE tracker_tokens (
  tracker       TEXT PRIMARY KEY,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    INTEGER
);

CREATE TABLE manga_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id    INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  tracker     TEXT    NOT NULL,
  remote_id   TEXT    NOT NULL,
  title       TEXT,
  status      INTEGER NOT NULL DEFAULT 0,
  score       REAL    NOT NULL DEFAULT 0,
  last_chapter_read REAL NOT NULL DEFAULT 0,
  UNIQUE(manga_id, tracker)
);

CREATE TABLE extensions (
  id       TEXT PRIMARY KEY,  -- e.g. "en.mangadex"
  enabled  INTEGER NOT NULL DEFAULT 1,
  nsfw     INTEGER NOT NULL DEFAULT 0,
  version  TEXT
);

-- Indexes
CREATE INDEX idx_chapters_manga ON chapters(manga_id);
CREATE INDEX idx_history_chapter ON history(chapter_id);
CREATE INDEX idx_manga_categories_manga ON manga_categories(manga_id);
```

## Extension System

Extensions are JavaScript files that implement the Source interface. They replace Mihon's Android APK extensions. The desktop extension format is a single `.js` bundle (CommonJS or ESM compiled to CJS).

### Extension contract

Each extension JS file must export a default class (or a factory returning an array) that satisfies:

```
// Extension interface (TypeScript type, not enforced at runtime)
interface Source {
  readonly id: number;       // unique bigint-safe integer
  readonly name: string;
  readonly lang: string;     // BCP 47 language code
  readonly baseUrl: string;
  readonly supportsLatest: boolean;

  getPopularManga(page: number): Promise<MangasPage>;
  getLatestUpdates(page: number): Promise<MangasPage>;
  searchManga(page: number, query: string, filters: Filter[]): Promise<MangasPage>;
  getMangaDetails(manga: SManga): Promise<SManga>;
  getChapterList(manga: SManga): Promise<SChapter[]>;
  getPageList(chapter: SChapter): Promise<Page[]>;
  getFilters(): Filter[];    // optional, return [] if unsupported
}

interface MangasPage {
  mangas: SManga[];
  hasNextPage: boolean;
}

interface SManga {
  url: string;               // source-relative URL (stable key)
  title: string;
  author?: string;
  artist?: string;
  description?: string;
  genre?: string;            // comma-separated
  status: number;            // 0–6, same as DB
  thumbnailUrl?: string;
  initialized?: boolean;
}

interface SChapter {
  url: string;
  name: string;
  scanlator?: string;
  dateUpload: number;       // epoch ms
  chapterNumber: number;
}

interface Page {
  index: number;
  url: string;
  imageUrl?: string;
}

// Extension metadata (at module top level or in extension.json sidecar)
export const extensionMeta = {
  id: "en.mangadex",
  name: "MangaDex",
  lang: "en",
  version: "1.0.0",
  nsfw: false,
};
```

### Loader behavior

- Scan `userData/extensions/` for `*.js` files
- Each file is loaded via `require()` (CommonJS) in a VM2 sandbox with a custom fetch shim that uses Node's `https` module
- The sandbox exposes: `fetch`, `Headers`, `URL`, `URLSearchParams`, `Buffer`, `console`
- The sandbox does NOT expose: `fs`, `child_process`, `require` (except whitelisted modules)
- On load error: log, skip extension, continue
- Registry maps `sourceId → extension instance`

### fetch shim

```
// Injected into every extension sandbox
const fetch = (url, options = {}) => {
  return ipcInvoke('source:fetch', { url, options });
  // OR: handle directly in sandbox via Node https module
  // Main process must handle cookies, redirects, custom headers
};
```

💡

The Kotlin prototype's extension system at `E:\MihonPC\extensions\` used URLClassLoader. The JS equivalent is Node's `vm.Script` or `vm2.VM`. The contract (Source interface) is identical — only the runtime changed.

## IPC Design

All communication between renderer and main process goes through typed IPC channels. The preload script exposes only `window.electron.invoke(channel, ...args)`.

| Channel | Args | Returns |
| --- | --- | --- |
| `library:getAll` | — | `Manga[]` |
| `library:getFavorites` | — | `Manga[]` |
| `library:addFavorite` | `manga, sourceId` | `number` (id) |
| `library:removeFavorite` | `mangaId` | `void` |
| `source:getAll` | — | `SourceInfo[]` |
| `source:getPopular` | `sourceId, page` | `MangasPage` |
| `source:getLatest` | `sourceId, page` | `MangasPage` |
| `source:search` | `sourceId, page, query, filters` | `MangasPage` |
| `source:getMangaDetails` | `sourceId, manga` | `SManga` |
| `source:getChapterList` | `sourceId, manga` | `SChapter[]` |
| `source:getPageList` | `sourceId, chapter` | `Page[]` |
| `source:fetchImage` | `url, sourceId` | `string` (data URL or cache path) |
| `history:getRecent` | `limit, offset` | `HistoryEntry[]` |
| `history:upsert` | `chapterId, lastRead` | `void` |
| `history:clearAll` | — | `void` |
| `chapters:getByManga` | `mangaId` | `Chapter[]` |
| `chapters:markRead` | `chapterIds, read` | `void` |
| `tracker:getStatus` | `mangaId` | `TrackerStatus[]` |
| `tracker:login` | `trackerName` | `void` |
| `tracker:updateProgress` | `tracker, remoteId, chapter` | `void` |
| `backup:export` | `filePath` | `void` |
| `backup:import` | `filePath` | `ImportResult` |
| `extensions:getAll` | — | `ExtensionInfo[]` |
| `extensions:install` | `urlOrPath` | `void` |
| `extensions:uninstall` | `extId` | `void` |
| `settings:get` | — | `Settings` |
| `settings:set` | `partial Settings` | `void` |

## OAuth / Tracker Authentication

Implementation pattern for all three trackers (AniList, MAL, Kitsu).

```
// src/main/trackers/oauth-server.ts

import http from 'http';
import { shell } from 'electron';

export async function loginWithOAuth(
  authUrl: string,
  tokenEndpoint: string,
  clientId: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      const code = url.searchParams.get('code');
      res.end('<h1>Logged in! You can close this tab.</h1>');
      server.close();

      if (!code) return reject(new Error('No code in redirect'));

      // exchange code for token
      fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: codeVerifier,
          redirect_uri: `http://localhost:${port}/callback`,
        }),
      })
        .then(r => r.json())
        .then(resolve)
        .catch(reject);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const fullAuthUrl = authUrl +
        `&redirect_uri=http://localhost:${port}/callback`;
      shell.openExternal(fullAuthUrl);
    });

    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')); }, 120_000);
  });
}
```

### AniList specifics

- Auth URL: `https://anilist.co/api/v2/oauth/authorize?client_id=…&response_type=code`
- Token URL: `https://anilist.co/api/v2/oauth/token`
- API: GraphQL at `https://graphql.anilist.co`
- Update mutation: `SaveMediaListEntry(mediaId, status, progress, score)`

### MAL specifics

- Auth URL: `https://myanimelist.net/v1/oauth2/authorize` (needs PKCE code_challenge)
- Token URL: `https://myanimelist.net/v1/oauth2/token`
- API: `https://api.myanimelist.net/v2/manga/{id}`, PATCH to update status

## Build Phases

Implement in this order. Each phase must be functional before starting the next.

PHASE 01

Project scaffold + DB + IPC skeleton

Init Electron + Vite + React project. Set up main/renderer/preload split. Create DB with migrations runner. Wire one round-trip IPC call (`ping`/`pong`) to verify the channel works end-to-end. Set up electron-builder config.

electronvitesqliteipc

PHASE 02

Extension loader + VM2 sandbox

Write the extension loader (scan dir, execute JS in VM2, register sources). Write the fetch shim. Write the Source registry. Write the IPC handlers for all `source:*` channels. Test with a hand-written demo extension that returns static manga data.

vm2extensionsfetch-shim

PHASE 03

Browse page + Manga Detail

Implement Browse UI: source list, source browse page (infinite scroll grid), manga detail page (cover, info panel, chapter list). Add/remove from library. Chapters fetched from source and stored in DB.

reactbrowsemanga-detail

PHASE 04

Reader (pager + webtoon)

Full-screen reader. Image fetching via main process proxy (with disk cache). Pager mode (keyboard + click navigation). Webtoon mode (virtual scroll). Overlay (title, page counter, chapter nav). Write history on page change.

readerimage-cachehistory

PHASE 05

Library page + categories

Library grid with cover badges. Sort + filter panel. Category tabs. Bulk selection. Background update check in main process with system notifications.

librarycategoriesnotifications

PHASE 06

History + Updates pages

History: grouped by day, resume from last page, search, delete. Updates: new chapter feed, mark read, download actions.

historyupdates

PHASE 07

Settings + More tab

All settings groups. Persist to `settings.json`. Apply appearance changes live (theme token swap). More tab links to sub-screens.

settingstheming

PHASE 08

Backup & Restore

Export library to `.mihonbk` JSON. Import with progress dialog. Auto-backup scheduler. File picker via `dialog.showSaveDialog` / `showOpenDialog`.

backuprestore

PHASE 09

Tracker OAuth + sync

AniList + MAL OAuth loopback flow. Tracker panel on manga detail. Auto-sync on chapter read. Tracker management in More tab.

oauthanilistmal

PHASE 10

Chapter downloader + offline reading

Download queue (concurrent, configurable). Pause/resume/cancel. Offline mode: serve pages from local cache when no network. Download management page in More tab.

downloadsoffline

PHASE 11

Polish + packaging

Keyboard shortcuts, menu bar, tray icon. electron-builder: NSIS (Windows), DMG (macOS), AppImage (Linux). Auto-updater stub. Statistics page. Empty states, error boundaries.

packagingauto-updatepolish

## Context from the Kotlin Prototype

A working Kotlin/Compose Multiplatform app exists at `E:\MihonPC`. It compiled and ran successfully. Use it as design reference, not as code to port.

### What was already figured out

- **DB schema**: The SQLDelight schema at `data/src/commonMain/sqldelight/` maps directly to the SQL above. Column names match exactly.
- **Extension loader**: `DesktopExtensionLoader.kt` shows the metadata contract. The JS equivalent: read `extension.json` sidecar (or export `extensionMeta` from the JS module) instead of `META-INF/extension.properties`.
- **Source interface**: `source-api/src/commonMain/kotlin/eu/kanade/tachiyomi/source/` — every method maps 1:1 to the TypeScript interface above. Method names are identical.
- **OAuth server**: `app/src/desktopMain/kotlin/mihon/app/tracker/OAuthCallbackServer.kt` — the loopback pattern is the same, just port it to Node's `http.createServer`.
- **Reader modes**: `ReaderScreen.kt`, `PagerReader.kt`, `WebtoonReader.kt` — exact same behavior, just swap Compose for React.
- **History upsert**: Use `INSERT OR REPLACE`, not `INSERT … ON CONFLICT DO UPDATE` (SQLite dialect quirk).
- **Image proxy**: Pages need to be fetched by the main process and served to the renderer. In Kotlin this was via Coil + OkHttp. In Electron: `ipcMain.handle('source:fetchImage', …)` returns a data URL or writes to the cache and returns a `file://` path.

### What NOT to copy

- The Kotlin NSFW extension architecture used a `SourceFactory` interface — not needed in JS, just export an array from the extension module
- The `getgenv()`/`generation` guards — those are Roblox patterns that ended up in the Kotlin file by mistake; ignore them
- The `MangaRepository.addToLibrary` primitive-parameter signature — in TS, pass the full `SManga` object directly since `types` are just erased interfaces

## Agent Rules for Codex

🚫

**Critical: never make network requests from the renderer process.** All HTTP (source fetches, tracker API, image downloads) must go through main process IPC handlers. The renderer calls `window.electron.invoke(…)` only.

⚠️

Extension JS runs in VM2. Never `eval()` extension code directly or `require()` extension files from the renderer. The extension registry lives entirely in the main process.

- Use TypeScript strict mode (`"strict": true` in tsconfig). No `any` except in the IPC boundary type wrappers.
- Use `better-sqlite3` synchronously in main process. All DB calls are synchronous — no async/await wrappers needed, which simplifies the IPC handlers significantly.
- Migrations: numbered SQL files (`001_init.sql`, `002_…`). Track version in a `pragma user_version` or a `meta` table. Run on every app start before any other DB call.
- Test with the demo extension first. Build a `demo.js` file in `extensions/` that returns hardcoded static data for all Source methods. Verify the full Browse → MangaDetail → Reader flow before writing any real extension.
- Image loading: always go through the main process proxy. Never load manga images directly from the renderer using `<img src="https://…">`. This avoids CORS issues and lets extensions set custom headers.
- The `id` field on a Source is a `number` in JS/TS. Mihon uses a 64-bit Long. Use JavaScript's safe integer range (`Number.MAX_SAFE_INTEGER`). For extensions that need a stable ID, use a djb2 or FNV hash of the language+name string.
- Source URLs stored in DB are relative (e.g. `/manga/one-piece`), not absolute. Each source prepends its `baseUrl` when constructing HTTP requests. Never store absolute URLs in the DB.

### First command to run

```
npm create electron-vite@latest mihonpc-electron -- --template react-ts
cd mihonpc-electron
npm install better-sqlite3 vm2 got
npm install -D @types/better-sqlite3 @types/node electron-builder
```

### Verify the scaffold works before writing any feature

```
npm run dev   # opens Electron window with React app
# Confirm: Electron opens, React renders, no console errors
```

---

Generated 2026-10-26 · MihonPC Electron Handoff for Codex · Kotlin prototype at `E:\MihonPC`