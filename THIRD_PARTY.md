# Third-party components and acknowledgments

The root Apache-2.0 license applies to this project's own code, not third-party components under other terms.

## Mihon

- Project: https://github.com/mihonapp/mihon
- License: https://github.com/mihonapp/mihon/blob/main/LICENSE (Apache-2.0).
- Android architecture, backup serializers and repository contracts informed the desktop implementation. Preserve original copyright, attribution and NOTICE material wherever upstream code is reused. This is an independent project, not an official Mihon release.

## Suwayomi Server

- Pinned runtime: v2.4.2366.
- Corresponding source: https://github.com/Suwayomi/Suwayomi-Server/tree/v2.4.2366
- MPL-2.0 license: `mihonpc-electron/runtime/LICENSE-Suwayomi.txt`.
- Distribution identification/checksum: `mihonpc-electron/runtime/NOTICE.txt`.
- The server remains MPL-2.0, not Apache-2.0. When distributing its executable, retain its notices and tell recipients where the corresponding source is available. Modified covered source remains subject to MPL-2.0.
- The official bundled JRE has additional licenses under `jre/legal`; retain those with redistributed runtime files.

## Electron and npm dependencies

Electron/Chromium, React, better-sqlite3, lucide-react and other dependencies retain their package licenses. `package-lock.json` records pinned resolutions. Keep applicable dependency and Electron/Chromium notices in packaged distributions. This document does not replace those licenses.

## Branding

The Panelori symbol uses original vector geometry. The outlined wordmark was created from locally installed Bahnschrift; no font file is redistributed. This repository's own branding assets are included under Apache-2.0; third-party trademark rights and upstream endorsement are not granted.
