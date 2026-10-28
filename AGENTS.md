## Active-layout cleanup (2026-10-28)

The user requested that only the latest MihonPC remain in the active project. The Kotlin prototype and old build outputs were moved unchanged to E:\MihonPC-Archive\2026-10-28-latest-only. Historical Kotlin module documentation below refers to that archived prototype, not active paths. Do not recreate old build folders as launch targets.

Latest executable: mihonpc-electron/dist/win-unpacked/MihonPC.exe (v1.2.2). Stable launcher: Start-MihonPC.cmd. Personal profile: MihonPC-data/ at the repository root. The portable app folder links to this same profile; never merge/replace it with fixture profiles.

Electron source, research notes and verification artifacts remain active. E:\REA contains the original research APK, not an installed desktop build. Cleanup evidence and rollback entry point: artifacts/latest-only-cleanup/.

---

# MihonPC — Agent Guide

## Current desktop implementation and persistent Mihon research

- The active desktop application is `mihonpc-electron/`. The Kotlin modules documented below are preserved reference/prototype code, not the current executable.
- Read **`Mihon Data.md`** in this repository root before continuing Mihon compatibility or reverse-engineering work. This is the ongoing research record, not a one-time findings report.
- Whenever new Mihon APK behavior, models, interfaces, assets, repository formats, or runtime behavior are investigated, update `Mihon Data.md` in the same change. Append evidence locations/IDs, APK version and SHA256, observed facts, desktop consequences, tests and unresolved questions. Preserve earlier evidence and mark corrections explicitly.
- Separate verified APK observations, inferred behavior, upstream desktop-engine behavior, and MihonPC implementation details. A desktop-engine experiment is not Android runtime proof. Do not record credentials/tokens or invent missing behavior.
- The current Electron production path uses a bundled Suwayomi JVM repository-extension runtime; custom JS hosts remain regression fixtures only. Keep renderer isolation and typed IPC. Do not claim arbitrary APK compatibility.
- Display actual extension/package icons on source and extension rows; use initials only when unavailable. Repository owner avatars are desktop presentation, not a confirmed Mihon repository-icon contract.


This file is the single source of truth for any AI agent working in this repository.
Read it fully before touching any file.

---

## What This Project Is

**MihonPC** is a desktop port of the Android manga reader [Mihon](https://github.com/mihonapp/mihon)
(itself a fork of Tachiyomi). The original app (`eu.kanade.tachiyomi`, APK at `E:\REA\mihon-v0.21.3.apk`)
was reverse-engineered with JADX to understand its architecture; this project reimplements it as a
Kotlin Multiplatform + Compose Multiplatform desktop application for Windows, macOS, and Linux.

**Target:** JVM desktop only (`jvm("desktop")` target). No Android target exists.

---

## Module Map

```
MihonPC/
├── app/              — Compose Multiplatform desktop UI, entry point
├── domain/           — Pure Kotlin domain models, zero platform deps
├── data/             — SQLDelight database layer, desktop drivers
├── source-api/       — Source/extension contracts (OkHttp-based)
└── extensions/       — JAR-based extension loader (replaces Android APK loader)
```

### `:domain`
- **No Android deps, no platform deps.** Pure Kotlin only.
- Models: `Manga`, `Chapter`, `Source`, `LibraryManga`, `HistoryEntry`
- Path: `domain/src/commonMain/kotlin/tachiyomi/domain/`
- Adding a new model: create it here, never in `:app` or `:data`.

### `:data`
- SQLDelight 2.x with `JdbcSqliteDriver` (desktop).
- Schema files: `data/src/commonMain/sqldelight/tachiyomi/data/*.sq`
  - `Mangas.sq` — manga table (23 columns, matches APK schema exactly)
  - `Chapters.sq` — chapters, FK → mangas CASCADE DELETE
  - `Categories.sq` — categories + mangas_categories join table
  - `History.sq` — history with JOIN query across chapters + mangas
- Generated class: `tachiyomi.data.Database` (do not hand-write; let SQLDelight generate it)
- Driver factory: `data/src/desktopMain/kotlin/tachiyomi/data/DatabaseDriverFactory.kt`
  - DB stored at: Windows `%APPDATA%\Mihon\mihon.db`, Mac `~/Library/Application Support/Mihon/mihon.db`, Linux `~/.local/share/mihon/mihon.db`
- Repositories (desktopMain only):
  - `tachiyomi.data.manga.MangaRepository` — insert/update/getFavorites/removeFromLibrary
  - `tachiyomi.data.history.HistoryRepository` — getHistory(limit, offset) / deleteAll

### `:source-api`
- Mirrors the Mihon source API exactly so community extensions compile unchanged (as JARs).
- Key interfaces: `Source`, `CatalogueSource`, `HttpSource`, `SourceFactory`
- Models: `SManga`, `SChapter`, `Page`, `Filter`, `MangasPage`
- Path: `source-api/src/commonMain/kotlin/eu/kanade/tachiyomi/source/`
- **Do not change the public API surface** — extensions depend on it.

### `:extensions`
- Desktop replacement for Android's `PackageManager`-based APK loader.
- Extension format: a `.jar` file with `META-INF/extension.properties` inside it.
  ```
  extension.name=My Source
  extension.pkg=eu.kanade.tachiyomi.extension.en.mysource
  extension.version=1.0.0
  extension.version.code=1
  extension.lang=en
  extension.nsfw=false
  extension.class=eu.kanade.tachiyomi.extension.en.mysource.MySource
  ```
- Loader: `DesktopExtensionLoader` — `URLClassLoader` over JAR files in `sourcesDir`
- Manager: `DesktopSourceManager` — `StateFlow<List<Extension.Installed>>`, `reload()`, `getOrStub(id)`
- Repo: `ExtensionRepo` — fetches JSON index, downloads JARs, uninstalls by deleting JAR
- Sources dir: `%APPDATA%\Mihon\sources\` (Windows) / OS equivalent

### `:app`
- Compose Multiplatform desktop app. Main class: `mihon.app.MainKt`.
- Entry point: `app/src/desktopMain/kotlin/mihon/app/Main.kt` — 1280×800 window
- Global singletons in `AppState` (object): `dataDir`, `sourcesDir`, `database`, `historyRepository`, `mangaRepository`, `sourceManager`

---

## Navigation (Voyager)

All screens implement `cafe.adriel.voyager.core.screen.Screen`.
`Navigator` is set up in `App.kt`. Push screens with `LocalNavigator.currentOrThrow.push(screen)`.

```
App
└── Navigator
    └── MainScreen          (NavigationRail — 4 tabs)
        ├── LibraryTab      — grid of favourite manga from DB
        ├── BrowseTab       — installed source list → SourceBrowseScreen
        │   └── SourceBrowseScreen    → MangaDetailScreen
        │       └── MangaDetailScreen → ReaderScreen
        ├── HistoryTab      — recent reading history from DB
        └── MoreTab         — settings / info
```

---

## Reader

`ReaderScreen` takes `(chapter: SChapter, source: Source, mangaTitle: String)`.

- Calls `source.getPageList(chapter)` asynchronously on `Dispatchers.IO`
- Two modes toggled at runtime via the overlay toolbar:
  - `ReaderMode.PAGER` → `HorizontalPager` (page by page)
  - `ReaderMode.WEBTOON` → `LazyColumn` (continuous vertical scroll)
- Tap anywhere to show/hide the overlay (`ReaderOverlay`)
- State lives in `ReaderState` (remember-scoped, not a ViewModel)

---

## Library Flow

1. User opens **Browse → source card** → `SourceBrowseScreen` (popular manga grid)
2. Taps a manga → `MangaDetailScreen` (cover, description, chapters)
3. Taps **Add to Library** → `MangaRepository.addToLibrary(smanga, sourceId)` writes to DB
4. **Library tab** calls `MangaRepository.getFavorites()` and shows `LibraryGrid`

---

## Tracker OAuth

`OAuthCallbackServer` (`app/src/desktopMain/kotlin/mihon/app/tracker/`) starts a local HTTP server on a random port. Usage:

```kotlin
val srv = OAuthCallbackServer()
Desktop.getDesktop().browse(URI(buildAuthUrl(srv.port, ...)))
val code = srv.awaitCode()   // suspends up to 120 s
// exchange code for token...
```

The callback path is always `/callback?code=...`. The server shuts itself down after receiving the code.

---

## Build

```
# First time only — generates the Gradle wrapper JAR
powershell -File bootstrap.ps1

# Run desktop app
.\gradlew desktopRun

# Package distributable (MSI / DMG / DEB)
.\gradlew packageDistributionForCurrentOS
```

Or open `E:\MihonPC` in **IntelliJ IDEA** and let it sync Gradle automatically.

### Key versions
| Tool | Version |
|---|---|
| Kotlin | 2.0.21 |
| Compose Multiplatform | 1.7.1 |
| SQLDelight | 2.0.2 |
| OkHttp | 4.12.0 |
| Kodein-DI | 7.22.0 |
| Coil | 3.0.4 |
| Voyager | 1.0.0 |
| Coroutines | 1.8.1 |
| Gradle | 8.10.2 |

---

## Rules for Agents

1. **Domain first.** New data types belong in `:domain` (pure Kotlin). Data access belongs in `:data`. UI belongs in `:app`.
2. **Do not change `:source-api` public interfaces.** Community extensions depend on them.
3. **`AppState` is the DI root** for now. Add new singletons there as `val x by lazy { ... }`.
4. **SQLDelight is the DB.** Do not use raw JDBC or any ORM. Add queries to the relevant `.sq` file.
5. **No Android APIs.** `android.*`, `Context`, `PackageManager`, `WorkManager`, `Intent` are all forbidden. Use JVM equivalents.
6. **Reader screens take `SChapter` + `Source` directly** — no DB ID lookups needed to open the reader.
7. **Extension JARs, not APKs.** The loader is `DesktopExtensionLoader`; do not implement an APK parser.
8. **Backup rule before editing:** this project follows the AGENTS.md backup convention — for any meaningful change create `ScriptName_YYYY-MM-DD.lua` first (not applicable here since files are `.kt`, but keep the same discipline: understand the current file before rewriting it).

---

## File Tree (current state)

```
app/src/desktopMain/kotlin/mihon/app/
├── Main.kt
├── App.kt
├── AppState.kt
├── tracker/
│   └── OAuthCallbackServer.kt
└── ui/
    ├── main/MainScreen.kt
    ├── library/LibraryTab.kt
    ├── browse/
    │   ├── BrowseTab.kt
    │   ├── SourceBrowseScreen.kt
    │   └── MangaDetailScreen.kt
    ├── history/HistoryTab.kt
    ├── more/MoreTab.kt
    └── reader/
        ├── ReaderState.kt
        ├── ReaderScreen.kt
        ├── ReaderOverlay.kt
        ├── PagerReader.kt
        └── WebtoonReader.kt

data/src/
├── commonMain/sqldelight/tachiyomi/data/
│   ├── Mangas.sq
│   ├── Chapters.sq
│   ├── Categories.sq
│   └── History.sq
└── desktopMain/kotlin/tachiyomi/data/
    ├── DatabaseDriverFactory.kt
    ├── manga/MangaRepository.kt
    └── history/HistoryRepository.kt

domain/src/commonMain/kotlin/tachiyomi/domain/
├── manga/model/Manga.kt
├── chapter/model/Chapter.kt
├── source/model/Source.kt
├── library/model/LibraryManga.kt
└── history/model/HistoryEntry.kt

source-api/src/commonMain/kotlin/eu/kanade/tachiyomi/source/
├── Source.kt
├── online/HttpSource.kt
└── model/{SManga,SChapter,Page,Filter}.kt

extensions/src/
├── commonMain/kotlin/mihon/extensions/model/Extension.kt
└── desktopMain/kotlin/mihon/extensions/
    ├── DesktopExtensionLoader.kt
    ├── DesktopSourceManager.kt
    └── ExtensionRepo.kt
```
