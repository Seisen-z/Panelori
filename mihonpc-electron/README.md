# Panelori desktop implementation (currently MihonPC v1.2.2)

This is the active Electron + TypeScript + React application. See the [repository README](../README.md) for runtime preparation, development, packaging and licensing.

Production extensions use Suwayomi Server v2.4.2366. No manga source is bundled. Custom JavaScript hosts and `tests/fixtures/` are isolated regression infrastructure, not the production distribution format. See `EXTENSIONS.md` for those fixture contracts only.

The Panelori assets are a rebrand proposal; the current UI/executable still use MihonPC. The workspace launcher is `../Start-MihonPC.cmd` and its personal profile is `../MihonPC-data/`, outside generated output. Preserve it during packaging; never publish it.

## Validation

Run `npm run check`, `npm test`, `npm run build`, `npm run test:extensions`, `npm run test:flow`, `npm run test:smoke`, and `node scripts/flow.mjs --phase=7` / `--phase=11`. After `npm run build:unpack`, use `npm run test:packaged`. Normal application startup needs the pinned JVM files described in the root README. Live-network `npm run test:runtime` is opt-in.

Mobile `.tachibk` imports preserve supported collection, category and chapter/history data. Desktop `.mihonbk` exports retain favorites and historical nonfavorites. Mobile settings, accounts, repositories, image bytes and reader bit flags are not imported; matching extensions must be installed separately. Runtime identities hydrate by exact source+opaque URL, not title search. Trackers/OAuth are intentionally absent. Compatibility details and gaps are recorded in [Mihon Data.md](../Mihon%20Data.md).
