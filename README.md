# Panelori

<img src="branding/panelori/panelori-logo-light.svg" alt="Panelori" width="360">

A personal desktop manga, manhwa and comics reader built with Electron, TypeScript and React. Bring your own compatible extension repositories; no manga sources or content are bundled.

**Status:** current Windows implementation v1.2.2. Panelori is the proposed new identity; the executable, application identifiers and UI still use **MihonPC**. Included branding assets do not imply a completed app-wide rename.

## Features

- Compact Library cards/list, categories, searching and unread badges.
- History and Updates with independent cards/list views.
- Pager, vertical, RTL and webtoon reading; resume and history.
- Repository extensions through a pinned Suwayomi JVM runtime.
- Persistent downloads and offline reading of downloaded chapters.
- Mobile Mihon `.tachibk` import and desktop `.mihonbk` export/restore.
- Eight personal settings groups; no tracker/OAuth integration.

Arbitrary Android APK compatibility and complete Mihon settings parity are not claimed. See [Mihon Data.md](Mihon%20Data.md). Evidence paths in that document refer to local files deliberately excluded from this public repository.

## Develop on Windows

Install Node.js 22.12+ or a newer supported LTS and npm. Native build prerequisites may be needed if `better-sqlite3` has no matching prebuilt binary.

```powershell
cd mihonpc-electron
npm ci
```

### Prepare the extension runtime

Native runtime binaries are not committed to Git. Download the official [Suwayomi Server v2.4.2366 Windows x64 ZIP](https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.4.2366/Suwayomi-Server-v2.4.2366-windows-x64.zip).

Expected archive SHA256:

```text
b955f374a8d94b8d1c2750ae28fa7eb2066b479957561b5ba9cf8ac993c8fc13
```

Locate `jre/` and `bin/Suwayomi-Server.jar` in the extracted bundle and copy them into `mihonpc-electron/runtime/`. Retain `jre/legal` and all runtime files. License/NOTICE files are already included in this repository. Use the pinned version, not an arbitrary server build.

```powershell
npm run dev
```

## Validate and package

From `mihonpc-electron/`:

```powershell
npm run check
npm test
npm run build
npm run test:extensions
npm run test:flow
npm run test:smoke
node scripts/flow.mjs --phase=7
node scripts/flow.mjs --phase=11
npm run build:unpack
npm run test:packaged
```

`npm run test:runtime` is an opt-in live-network test. Ordinary regressions use isolated synthetic fixtures. Windows is currently validated; macOS/Linux packaging configuration is not runtime proof.

After packaging, `Start-MihonPC.cmd` expects `mihonpc-electron/dist/win-unpacked/MihonPC.exe`. The workspace personal profile is **`MihonPC-data/`**, outside generated output. Never commit or replace it during packaging. Fresh clones contain neither a prebuilt executable nor a personal library.

## Layout

- `mihonpc-electron/` — active application, migrations, tests and build configuration.
- `branding/panelori/` — vector logos, app icons and design preview.
- `Mihon Data.md` — ongoing compatibility research.
- `AGENTS.md` — agent guide; historical Kotlin notes describe an archived prototype.

## License

This project's own code uses [Apache-2.0](LICENSE). Third-party components retain their licenses; Suwayomi remains **MPL-2.0**. See [THIRD_PARTY.md](THIRD_PARTY.md).

Panelori is an independent desktop project, not an official Mihon release.
