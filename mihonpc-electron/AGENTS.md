# Electron rewrite

The user approved this separate rewrite on 2026-10-26. The parent Kotlin tree is reference-only and must remain unchanged. The Electron handoff at ../MihonPC Electron Handoff.md governs this subtree; the user subsequently authorized Phases 2–4 together.

- Strict TypeScript; shared models/contracts in src/shared, database/network/extensions in main, UI in renderer.
- Renderer uses only the typed allowlisted preload bridge. No Node APIs or remote image URLs.
- Keep context isolation, Chromium process sandboxing, sender/frame validation and network restrictions enabled.
- Extension bundles run in separate sandboxed Chromium renderers with dedicated fetch-only preload channels. Never evaluate a bundle in main or expose the app bridge to it.
- Zero bundled manga sources. Demo extension/pages stay in tests/fixtures and only enter disposable test userData.
- Phase 1 foundation and Phases 2–4 extensions/browse/detail/reader are implemented. Phases 5-7 implement collection management, history/updates, and persisted settings. Phases 8-11 remain.
- Run npm run check, npm test, npm run build, npm run test:extensions, npm run test:flow and npm run test:smoke after changes. Packaged Windows flow: npm run build:unpack then npm run test:packaged.
- Migrations are sequential and immutable after release. Preserve version-1 and version-2 user data when upgrading to schema 3. Never open or edit the Kotlin database.
- Preserve stable chapter IDs, read flags, bookmarks and history on refresh. Do not use INSERT OR REPLACE for manga/chapter upserts.
- Preserve backups and tested rollback evidence outside this subtree in ../artifacts/. Rollback must not delete or downgrade user data.

- The user authorized Phases 5-7 on 2026-10-27. Run node scripts/flow.mjs --phase=7 for collection/settings desktop checks.
- All settings groups persist to settings.json with a SQLite mirror. Download queue, backup and tracking workflow settings activate in their later phases; DoH and analytics remain disabled.
- Update feed discoveries are separate from chapter IDs and remain seen after reading. Chapter download actions cache full chapters; do not describe this as the Phase 10 queue.

## Personal release (2026-10-27)

- User authorized remaining phases and then removed tracker/OAuth features. Phase 9 is removed, not pending. No tracker UI/settings/clients/tokens; schema 4 drops reserved tracker tables.
- Phases 8, 10 and 11 now implement backups, persistent downloads and desktop polish. Preserve schema-3 data while applying migration 004.
- Run `node scripts/flow.mjs --phase=11` and its `--packaged` variant in addition to prior regression commands.
- Download files are dedicated storage, not temporary image cache; preserve storage paths and validate containment before deleting. Queue pause/cancel acts between page fetches; shutdown preserves interrupted jobs.
- Backup imports merge source-relative identities and preserve existing progress. Exclude extension code/page images/accounts from exports. Keep import size/count bounds and per-entry rollback.
- Windows portable folder launcher keeps data/TEMP beside the app. Installers are unsigned; no update server is configured. Do not claim native macOS/Linux verification from Windows builds.

## Ongoing Mihon data record and branding (2026-10-27)

Read `../Mihon Data.md` before Mihon compatibility work and update it whenever new APK data or validation is obtained. Keep artifact/evidence references and distinguish Android observations from desktop-engine tests. The production runtime is repository-based Suwayomi; earlier custom JS-only statements describe fixture regression infrastructure, not production installation.

Source cards and installed/available extension rows use the extension's real package icon. Repository rows may use a verified configured repository's GitHub owner avatar. Fetch through main-process allowlisted icon IPC; the renderer receives bounded validated raster data URLs, never arbitrary remote image URLs. Keep placeholder initials for missing/offline icons, deduplicate/cache requests, and lazy-load visible rows.

## Collection layout contracts (2026-10-27)

History and Updates each expose independent Cards/List controls, persisted as `historyView` and `updatesView` (default `card`). Preserve cover thumbnails, day-grouped history, resume/delete, and update mark-read/download actions in both layouts. History queries include manga thumbnail_url without changing chapter progress. Library grid cards cap at 180px while respecting the configured column count; a single title must not stretch into a giant poster. Run the phase-7 desktop flow to verify both layouts, persistence and compact-card measurements. These are desktop design choices, not new APK findings.

## Reading desk UI (2026-10-28)

Use `docs/UI_DESIGN.md` as the visual contract. Neutral graphite/paper surfaces and a restrained bookmark-gold accent; system-local Bahnschrift headings and Segoe UI body. Shared controls belong in assets/main.css, not native unstyled buttons per screen. Keep compact navigation and cover-led content; no development-preview labels, obsolete phase roadmaps or hardcoded version badges. History/Updates retain independent Cards/List controls and Library keeps the180px cap. All controls need keyboard focus and reduced-motion support. Keep reader virtualization geometry intact.

The stable workspace entry point is `../Start-MihonPC.cmd`. When packaging a new workspace build, update its target and test existing workspace CMD redirects too. Preserve the original portable data directory; never clean dist/win-unpacked where user data lives. Portable ZIP launchers remain self-contained. Run phase7 desktop tests for UI sizes, both themes, all major route screenshots and no horizontal overflow at960/1280/1600px.

## More, settings and return navigation (2026-10-28)

More subpages use MoreLayout with a visible left-aligned Back link, active secondary navigation and bounded860px content; do not restore unstyled horizontal category links or full-window forms. Keep eight personal groups including Browse, with no trackers/OAuth. NavigationState carries validated internal return origins across manga/reader/chapter transitions; preserve Library query/filter/category and route scroll. No hardcoded catalogue Back for Library manga. Settings save only edited fields, retain external changes and guard unsaved navigation. Render supported settings with working consumers; production JVM user-agent/DoH/analytics gaps stay informational. New pager-fit/page-number and source-relative hide-in-library/NSFW preferences must be tested for visible effect, not just persistence. Fullscreen and wake policies are reader-scoped. APK findings and all gaps are in ../Mihon Data.md and artifacts/settings-navigation/apk/SETTINGS_AUDIT.md. Run phase7 for navigation/settings functional checks and all eight settings screenshots plus original release/reader regressions.
