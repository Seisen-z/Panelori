# Mihon Data

This is the continuing data notebook for Mihon research and MihonPC compatibility. Add future discoveries here rather than creating disconnected one-off findings files. Updated: 2026-10-28 (Asia/Shanghai).

## How to use this record

1. Preserve confirmed observations and their exact APK identity/evidence; correct earlier conclusions with dated notes.
2. Label static APK findings, inference, Android runtime evidence, desktop-engine tests and MihonPC implementation separately.
3. Record classes/methods/ABI, formats, UI/assets and execution behavior as research expands. Keep unknowns visible.
4. Store large raw evidence in `artifacts/` and link it here. Do not store account credentials or tokens.

## Evidence archive

The initial reconstruction is retained at `artifacts/mihon-apk-reconstruction/`: `REA-evidence.json`, `evidence/`, `runtime-api-research/`, live source/packaged screenshots and `VERIFICATION.txt`. Relative evidence filenames in the historical record below refer to that directory. The original report remains there for provenance; this document is the forward-maintained record.

## 2026-10-27 - Initial reconstruction and desktop compatibility

### Mihon v0.21.3 extension-system reconstruction

## Target identity

- Input: `E:\REA\mihon-v0.21.3.apk` (68,195,386 bytes).
- SHA256: `b499552614bec398b0687c77ffe973942282c29ca74e631a6b70ecbabff1782e`.
- Preserved copy: `mihon-v0.21.3.original.apk`. The original APK was not patched.
- Actual package: `app.mihon`; version code 39; minimum SDK 26; target SDK 36.
- JADX headless 0.7.1 with Java 17.0.19 parsed 12,484 classes and 1,845 resources. This is focused static reconstruction, not recovery of the whole original source project or execution of the Android app.
- Provider JAR SHA256: `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`.
- Complete retained records: `REA-evidence.json`; individual method bodies and raw results: `evidence/`.

## Observed repository path

`ExtensionStoreService` uses NetworkHelper/OkHttp plus JSON and protobuf serializers. `fetchStore` decompresses gzip before examining the body. Its legacy array branch recognizes `/index.min.json` and obtains repository metadata through `/repo.json`. Modern stores decode `NetworkExtensionStore`; an extension list can be embedded or fetched using `extensionListUrl`. The generated `getExtensions` coroutine checks for a JSON object (`0x7b`) and otherwise decodes protobuf; legacy lists decode separately. It does not evaluate repository responses as JavaScript.

Model fields include store name, signing key, contact, badge label, extension-list URL and list. Current Keiyoushi `repo.json`, compressed `index.pb`, official release asset catalogue and relevant pinned runtime API sources were independently retained in `runtime-api-research/`. A GitHub `extensions-source` HTML page is not the published extension index.

Evidence:
- Class inventory: `ev_c51c499ae4a31b0357a33324e185db1eb480e2c8d8ac28dc1e56ff62bbd17698`.
- fetchStore smali: `ev_ab1035043b9a8f113aa3a73ac5d83296d3c4f0fa5a301c40eb120f4891e1a6e0`.
- getExtensions worker smali: `ev_5bb2a88b0b74382ea4cc06d709781d0f9bada04ff79dd2816425e8308092a8f4`.
- Store model: `ev_4213944de5b36271c3d6f1c7d5cdc8edaca8bde76a61846e2ea4306815b77257`.

## Observed APK loader and installation

`ExtensionLoader.isPackageAnExtension` checks the declared feature `tachiyomi.extension`. Package metadata comes from Android PackageManager, including archive inspection for app-private files. Private extensions reside under the app's `filesDir/exts` as package-named `.ext` files; shared packages can also be discovered.

`loadExtension` reads `tachiyomi.extension.class`, splits semicolon-separated classes, expands leading-dot names using the package name, creates `DelegateLastClassLoaderCompat` from the APK's sourceDir, and instantiates no-argument classes. An instance must implement Source or SourceFactory. Factory sources are registered individually. Library API, package signatures and store trust/signing metadata participate in load acceptance. The static initializer's supported API set is exactly **1.4 and 1.6**, not every version between them.

`ExtensionInstaller.installApk` selects private installation or Android package-install mechanisms. One path uses MIME `application/vnd.android.package-archive` with ExtensionInstallActivity; other paths delegate to the install service. A Windows JavaScript evaluator implements none of this.

Evidence:
- loadExtension: `ev_bf09761e28edea26375cb51159226166090ae9ff5007f641cbd9568b5fc3b76d`.
- Private/shared package resolution: `ev_4f1f5b51166da0077277959f3efa71c0588e84ae372520462df2e85b2ce38064`.
- Feature check: `ev_89dd427a2b62e11a733199666e725800def551d1941b4c53283507b0e01df883`.
- API set: `ev_9d3fa84f5158e9d137734f12a0d5f709fbad56215b835f67ef8708e36225a3ac`.
- Installation selection: `ev_cc431022c8574b6aa22d55c2e800fa2c543de5a13095da646f9dceb79776fd75`.

## Observed source ABI

Source IDs are JVM Long values. Legacy methods return RxJava `rx.Observable`; newer methods are Kotlin suspend functions. HttpSource also provides request/parse hooks, HTTP clients/headers, image URL resolution, filtering, and manga-update contracts. Android preferences and other services can be required by extensions. Merely replacing `.js` with `.jar`, or declaring a reduced Kotlin Source interface, does not produce binary compatibility.

- Source ABI: `ev_f97e4cdf9ee89ce860e67174d2cf6d41f68fbc8ac5e0ead45cefe0a1e4b5dbdf`.
- HttpSource ABI: `ev_160a621b08fff5efd8c0cfdd3bbc6f3daada10e434d60c631b5731a6d9cdd977`.

## Implementation consequence and observed desktop experiment

MihonPC's earlier custom JS design was incompatible with the requested repository ecosystem. The production Electron path now uses a bundled, pinned Suwayomi JVM compatibility runtime and repository-first UI; JS hosts remain only for isolated regression fixtures. The renderer still accesses typed IPC only. The JVM child listens on loopback with random per-launch Basic authentication; its WebUI, browser launch, tray and CEF downloads are disabled. The adapter preserves Long IDs as strings and collision-checks persistent, deterministic numeric aliases used by the existing SQLite UI contracts.

This is an integration of an upstream compatibility engine, not a claim that Mihon's Android loader runs natively inside Electron. Upstream runtime: https://github.com/Suwayomi/Suwayomi-Server/tree/v2.4.2366 (MPL-2.0).

The first direct APK experiment used official xkcd v1.6.0, SHA256 `c3eb9851d462b01b836c8a48a2d5ee6ef2ee55fcb9a83b81265bfbadb7580038`. Uploading it to the pinned engine produced HTTP 500 and JVM `VerifyError: Bad type on operand stack` in converted code. No verifier bypass was used. Repository installation then selected the repository-published JVM artifact and succeeded, exposing five xkcd languages. The English source ID was `1538249443376436084`. Live popular catalogue, chapters, page-image retrieval and the Electron reader were subsequently tested; results are in the live runtime reports and screenshots. Success on one source does not establish universal compatibility.

An additional packaging experiment found that placing the server JAR beside `jre/` caused GraphQL class scanning to fail (`InvalidPackagesException`). Preserving the official layout `runtime/bin/Suwayomi-Server.jar` resolved startup. The JAR SHA256 is `af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd`; the official Windows bundle SHA256 is `b955f374a8d94b8d1c2750ae28fa7eb2066b479957561b5ba9cf8ac993c8fc13`.

## Remaining coverage limits

The Android app was not launched. Static JADX Java is reconstructed output; two coroutine bodies required smali fallback. Signature-check branches were inspected, not dynamically exercised. Source-specific preferences and advanced source filters are not yet exposed in this first adapter. Library-only JSON exports do not capture the runtime database/mappings; preserve the whole app data folder for migration. No macOS/Linux runtime package was validated. Original Kotlin modules remain unchanged. See VERIFICATION.txt for exact completed tests, rollback, paths and final status.

## 2026-10-27 - Icons and logos

### Research question
How does Mihon resolve installed extension icons, and how should MihonPC display icons for sources and extension catalogues?

### Verified discovery so far
A focused class search in the same SHA256-bound APK located `eu.kanade.tachiyomi.data.coil.ExtensionIconFetcher` and `eu.kanade.tachiyomi.data.coil.InstalledExtensionIcon`. The fetcher has nested `ExtensionFactory` and `SourceFactory` providers.

**Static APK observation:** `ExtensionIconFetcher.fetch` resolves a package name through its callback, calls `ExtensionLoader.getExtensionInfoFromPkgName(context, pkgName)`, obtains `PackageInfo.applicationInfo`, and loads the actual package icon. Without an explicit density it calls `ApplicationInfo.loadIcon(PackageManager)`; with a density it calls `getResourcesForApplication(applicationInfo).getDrawableForDensity(applicationInfo.icon, density, null)`. It converts the drawable to a bitmap and returns Coil `ImageFetchResult` with `DataSource.DISK`. Missing package/application/icon branches report missing installed extension/icon. This supports using the real extension package icon rather than synthesizing a website initial; it does not establish every available-extension network icon path.

Evidence ID: `ev_cec7511ebaf3b0d210b21e56375a8abd81991144796119e736b47ff21a169da9`. Complete reconstructed method, bound APK identity, class inventory and raw provider records: `artifacts/icons-and-mihon-notes/IconFetcher.fetch.java`, `IconFetcher.fetch.json`, `IconFetcher.class.json`, `IconFetcher.search.json` and `REA-evidence.json`. JADX emitted a duplicated-block warning; no smali fallback was needed. This is static evidence, not an Android UI screenshot.

### MihonPC implementation (desktop-specific)
Source cards and installed/available extension rows request the extension package's actual icon through Suwayomi `/api/v1/extension/icon/{pkgName}`. Repository rows use the configured GitHub repository owner's avatar when available. This avatar choice is not presented as a confirmed APK behavior. Main-process handlers validate configured identities, limit image bytes and supported raster formats, return data URLs, cache/deduplicate and let the isolated renderer lazy-load near-visible rows. Initials remain when no image is available.

### Validation
Validation records are retained in `artifacts/icons-and-mihon-notes/VERIFICATION.txt`, separating baseline/modified/rollback commands, live source tests and packaged visual proof. The icon unit tests cover raster validation, streamed size limits, cache deduplication/eviction, recognized repository-avatar origins and IPC argument validation. Live images/screenshots and exact final statuses belong to that record rather than being inferred from compilation.

### Completed icon validation (2026-10-27)

- Baseline unit suite: 47 passed; modified suite: 53 passed. Original extension/reader/smoke regression flows passed.
- Packaged v1.1.1 live test: actual xkcd icons decoded on source cards and installed-extension/catalogue rows; Keiyoushi owner avatar decoded; the uninstalled Comic Growl extension's published logo decoded without installing it. Unknown extension packages returned null.
- Screenshot proof: `artifacts/icons-and-mihon-notes/live-packaged-verified/live-sources.png`, `live-extension-icons.png`, `live-available-icon.png`. Exact command log: `live-packaged-verified.log`; structured results: `live-packaged-verified/report.json`.
- The test harness was corrected to refresh the source store after direct IPC installation and to normalize whitespace in the test candidate name (`Comic Growl`). Earlier failed runs remain in the artifact directory; they are not counted as passing proof.
- Rollback was exercised on a separate source/document copy and restored the prior 47-test baseline. Working code and this document remain updated.

## Open research and compatibility gaps

- Inspect the available-extension icon URL construction and source-factory mapping in more detail; installed package-icon loading is confirmed above.
- Source-specific preferences and advanced filters remain to be bridged.
- Arbitrary APK conversion remains unproven; the tested xkcd APK conversion failed while its repository JVM artifact worked.
- Library-only JSON backups do not yet preserve the separate runtime mappings/database; whole data-folder migration remains necessary.
- Further Android runtime behavior requires actual Android execution evidence; static JADX alone does not establish it.

## Future entry template

### YYYY-MM-DD - Topic
- Question and target APK version/SHA256:
- Relevant classes/methods or resource paths:
- Verified observations and evidence IDs/files:
- Inferences (clearly labelled):
- Android runtime results, if any:
- Desktop consequences and implemented changes:
- Exact validation commands/results:
- Remaining unknowns and next research question:


## 2026-10-28 - Settings inventory and desktop wiring audit

### APK identity and evidence boundary

The original `E:/REA/mihon-v0.21.3.apk` was rehashed without modification: 68,195,386 bytes, SHA256 `b499552614bec398b0687c77ffe973942282c29ca74e631a6b70ecbabff1782e`. This is the same app.mihon v0.21.3/code 39 artifact identified above. REA used the same JADX headless 0.7.1 provider JAR SHA256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75` and one worker. The APK was not launched; these findings are static reconstructed code, not Android settings-effect/runtime proof.

Raw class inventories, all selected reconstructed method bodies, evidence records and a reproducible audit builder are stored in `artifacts/settings-navigation/apk/`. `REA-evidence.json` retains 52 records. `SETTINGS_AUDIT.md` contains the screen label/action inventory, all 182 constructor fields/default expressions across 14 preference services, desktop baseline mappings and candidate consumer locations. `preference-matrix.json` is the machine-readable field matrix. Resource identifiers include summaries and headings and must not be counted as independent preferences.

### Verified static APK observations

The complete class-name search (12,484 top-level classes) locates Settings Appearance, Library, Reader, Download, Data, Browse, Tracking, Security, Advanced and Main screens. Settings/Preferences search evidence: `ev_19340d9eba0fc7f8a09e316c34ff621082eee234cc8428b4bdc7d7994c2446c8` and `ev_5e31a56981d8da5f323bb899819a9e01cfde0ccb580c2d875d4186a6e4c96c31`.

- Appearance binds theme mode, app theme, pure-black dark mode, tablet UI, language navigation, date/time format, relative dates and description images. Screen method: `ev_56ded9a331aaeb7c71293ff973bd58db585879cd860bf7962ef6699d763ebee3`.
- Library binds category editing/default/per-category display, automatic check interval, device and manga restrictions, included/excluded update categories, metadata refresh, update badge, chapter swipe actions, duplicate-read handling and missing-chapter indicators. Screen method: `ev_b21745e8070809928135ecf1b8eed8bc24526691811954265e82e12d8961f161`. Library constructor defaults include auto-update interval **0**, Wi-Fi restriction, unread badge true, and default category -1. Constructor: `ev_78e1e354ba69a485b35e7ceefbc409662c5071e52b0d86aa5ecce56b9ff8a8a1`.
- Reader binds reading mode, display/fullscreen/page number, preloading network restriction, page flash, chapter skipping/transitions, pager and webtoon navigation/scale/zoom/crop/dual-page behavior, webtoon padding, vertical navigator, volume keys and long-tap actions. Screen method: `ev_7bd7aa14b4a1636320a7c4197676e09d63b16770daba519907e3dd72396fbc41`. Reader constructor defaults include RIGHT_TO_LEFT reading mode, fullscreen true, showPageNumber true, keepScreenOn false, webtoonSidePadding 0, skipRead false, skipFiltered true and skipDupe false. Constructor: `ev_94488bd01dd2f2c1adad936c4c97a20b736c76950e13346146f7af5237f3efcb`.
- Downloads binds Wi-Fi-only, CBZ storage, concurrent source/page limits, read-chapter deletion slots, bookmark/category exclusions, new-chapter auto-download and download-ahead. Screen: `ev_3d0e46980310356bd39b97419618d8f0f2ad62c491554d2c874fec6a9c991bc8`. Constructor defaults Wi-Fi-only true, CBZ true, source/page parallel limits 5, auto-download false and download-ahead 0: `ev_ecc265435d34c77bcbe45ab18a38d44ee467f53b2ca37e6e0326976cdc0d7630`.
- Data binds storage location, scheduled backup, storage/cache information, cache clear/auto-clear and library export. Screen: `ev_a7a0211bb1f9c708e6672a7accff867547c3c80ee63083ab2873e75e1b281b7e`. Backup interval constructor defaults 12h: `ev_6e92237365be52f825afa8816ae5b281fd03536bab45819b778e32279b3d311c`.
- Browse binds hide-in-library, extension stores, allowed SAFE/MIXED/NSFW content warnings and application of warnings to installed sources. Screen: `ev_f3dfdf16f151b8eeba3ed2d4ae72935413c255f8c11b4ce41d0b277b505f03aa`. Source preferences also declare enabledLanguages, hidden/pinned catalogues and migration preferences: `ev_3e9eab0cca591aace0de1bdbcb636c04a2dd46b407e1c566f6efecdeda315a82`.
- Security binds biometric locking/idle lock, notification content, secure screen, Firebase analytics/crash reporting. Screen: `ev_f7f6464273b05e6cc67b9ac5748c1ada06cde1407126db0fddc293bd40093dc4`. These declarations do not justify adding telemetry or Android biometric controls to this personal desktop build.
- Advanced includes logs/debug/onboarding/notifications/battery actions; download cache/database maintenance; cookies/WebView data; DNS-over-HTTPS and user agent; cover refresh/reader flag reset; title/filename/hash policies; hardware image/display settings; extension installer/trust. Screen: `ev_67d7a200d680e16c70ef394c489041a65bb0f059984a7fab73843c43de3b57d9`. Network constructor declares DoH provider -1, redaction true and an Android browser default user agent: `ev_29b420e5a8aabdb433c4d2cf09f359e402bbccab2cb97d7c6b276ec4d2500011`.

### Desktop baseline consequences - separate from APK observations

This comparison refers to source v1.2.0 snapshotted under `artifacts/settings-navigation/baseline/`, before this task's implementation. Main-process scheduling, settings serialization and UI display are not automatically evidence that a setting reaches production source traffic.

The reviewed production gap is **userAgent**: `main/index.ts` configures the Electron `HttpBroker` provider, but `extensions/engine.ts` has no corresponding JVM configuration or preference bridge. Real repository source execution uses the bundled Suwayomi engine, not that JS fixture broker. Changing this field therefore did not establish a changed default user agent for production extension requests. DoH is explicitly disabled/unimplemented; analytics is a disabled informational placeholder with no desktop telemetry. Language offers English only. The cache-clear confirmation incorrectly implies completed offline downloads are removed, although `data:clearCache` preserves completed download records. Delete-after-reading applies to reader progress, not bulk mark-as-read actions.

Missing desktop settings are recorded rather than disguised as functioning toggles: reader page-number policy/default image scale, webtoon padding, chapter skip/transition/dual-page behavior; persistent source language/content-warning and hide-in-library preferences; library update category/restriction policies; date/time formatting; cache/storage information and production-engine cookie maintenance. Android-specific permission, cutout, rotation, battery and biometric behaviors require separate desktop design. Tracker/OAuth remains deliberately removed per the personal-build decision.

Existing desktop Wi-Fi download gating is wired through Windows adapter inspection, but the platform helper returns false on other operating systems. Automatic checks/backups execute while the desktop process is open, not through Android background workers. The baseline differs deliberately in several defaults: updateHours 12 versus APK 0, backupHours 24 versus APK 12, wifiOnly false versus APK true and reader pager/LTR versus APK RIGHT_TO_LEFT. Default differences are not by themselves defects.

### Validation and remaining questions

The audit builder reopened the retained JSON/Java methods and generated `AUDIT_OK screens=10 preference_services=14 constructor_fields=182 desktop_fields=32` (exit 0). Source mapping is bounded to the baseline source tree and reviewed consumer paths; matching variable names such as source language or preload paths are only candidate anchors. Parent-task `VERIFICATION.txt` records actual modified desktop tests, navigation proof and rollback separately.

Android runtime, permission outcomes, background scheduling and biometric behavior remain untested. Exact translated captions and every delegated Compose lambda were not exhaustively decoded. Enum objects referenced through Companion defaults require additional enum inspection for their serialized numeric/string identities. Dynamic source-specific preferences and full advanced filters remain separate compatibility questions. Preserve all previous evidence; a future desktop-engine test must not be relabeled as Android runtime proof.

### Desktop follow-through for the 2026-10-28 settings audit

MihonPC v1.2.1 adds a common More/settings workspace and Back controls, explicit manga/reader return origins, saved Library query/filter/category and route scroll restoration. New working desktop preferences are pager image fit, a hidden-controls page-number overlay, persistent NSFW visibility and hide-favourite catalogue filtering using source+URL identity. No Android-only control is exposed as a fake Windows setting. The production user-agent override/DoH/analytics controls are informational rather than misleading interactive options. Cache clearing explicitly preserves dedicated offline downloads; delete-after-reading describes reader-completion semantics only.

Desktop fixes also include edited-fields-only settings saves with unsaved-change navigation guard, reader-only display wake policy, synchronized persisted fullscreen controls across chapter changes, and offline scheduled checks retaining their overdue interval. Existing per-title reader overrides remain intentional. These are MihonPC implementation choices and desktop tests, not Android execution proof. Regression evidence, settings and navigation screenshots, before/after hashes and separate-copy rollback are recorded in `artifacts/settings-navigation/VERIFICATION.txt`. APK evidence and the complete 182-field baseline comparison remain in `artifacts/settings-navigation/apk/`; missing preference groups/options remain explicitly listed rather than claiming full parity.


## 2026-10-28 - Mobile tachibk backup schema and supplied-file validation

### APK identity, evidence and boundary

APK `E:/REA/mihon-v0.21.3.apk`, v0.21.3/code39, remains SHA256 `b499552614bec398b0687c77ffe973942282c29ca74e631a6b70ecbabff1782e`. Focused REA/JADX0.7.1 class metadata, generated serializers and restore/create methods were inspected without Android execution. Provider JAR SHA256 remains `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`. Complete method bodies and evidence are retained under `artifacts/mobile-backup-covers/apk/`; `BACKUP_SCHEMA.md` and `schema.json` record field numbers, types/defaults. `REA-evidence.json` has27 complete records, with2 additional ExtensionStore class/serializer records beside it. Static initializer and deserializer methods use complete smali fallback rather than treating decompiler aliases as original Kotlin source.

Key evidence: BackupManga descriptor `ev_215a1f8b009505e8ace611bc0b89ed17a6b1f1a254d3ceacdf4301da08279d02`; BackupChapter descriptor `ev_75ae96658d38d88f005d20ad3395473f7fbf27b20a6fac15c42968d45e972661`; MangaRestorer `ev_22f3d91c4327a76b2685eb62212d53f61d7f24bade747f27cae6d4c7417d431a`; MangaBackupCreator `ev_f5269defd7077f9734b6cf6ea89a876337772470499f5b1f994c13ecdabf544d`; BackupDecoder `ev_73c409d252de64e61e1f655a6a383c76b612a26866458dfca1c729a448b92cb2`; BackupReader `ev_fd1a4bb40e6402fc56e1cf0048b545eb0eba109cd8befbc19b9e3977bbf2a24e`.

### Verified static APK observations

- The decoder detects gzip magic0x1f8b, otherwise reads protobuf directly; root manga entries are repeated field1 length-delimited messages (tag10). Other root fields are categories2, sources101, app preferences104, source preferences105 and extension stores106. Reader logic handles wire types0/1/2/5 and rejects field zero/unsupported wire types.
- Manga source1 is signed64-bit Kotlin Long, url2 is required, title3 defaults empty, thumbnailUrl9 is nullable URL text; chapters16, category references17, favorite100 (absent means true), chapterFlags101, nullable viewer_flags103 and history104. Reader restore chooses viewer_flags when present, otherwise legacy viewer14. No cover bitmap is represented in these model fields.
- Chapter url1/name2 are required. Scanlator3 defaults null; read4/bookmark5 are independent booleans default false; lastPageRead6/dateFetch7/dateUpload8/sourceOrder10 default0; chapterNumber9 is32-bit float. Restore clamps lastPageRead into0..2147483647. Reader/chapter display flags are not substitutes for read/bookmark booleans.
- Category name1 is required, order2/id3/flags100 default0. **Manga category references store category order, not category ID.** Creator writes Category.order; restorer resolves backup order to backup name, then existing category name to actual current ID. This distinction matters when order0 has database ID1.
- History url1/lastRead2 are required, readDuration3 defaults0. Creator explicitly converts chapterId into chapter.url. Date-added/fetch/upload/history/next-update values are epoch milliseconds. The legacy favoriteModifiedAt restore path uses epoch seconds. Source name1 defaults empty, sourceId2 is required signed64-bit Long; desktop code must preserve decimal IDs exactly rather than pass them through imprecise JavaScript Number.
- ExtensionStore fields are indexUrl1,name2,badgeLabel3,contactWebsite4,signingKey5,contactDiscord6,isLegacy7 and extensionListUrl8. They describe repository metadata, not authorization to install extensions automatically. Preferences/trackers remain separate records and do not imply a valid desktop mapping.

### Supplied backup evidence - distinct from APK behavior

The provided `app.mihon_2026-10-28_02-31.tachibk` is319445 bytes, SHA256 `a6bcddedbf9ba02da6c0797a1f69587e5b5305211f4304bf9064879d14cfa2f8`. An unchanged local evidence copy is `artifacts/mobile-backup-covers/mobile.original.tachibk`. Its gzip payload expands to1615720 bytes with protobuf SHA256 `c13f5b2ecd6c8c1e12c5a6b4cd9df00082750bf249fce542ddf44d6ac2c2cd99`. Input preservation and desktop restoration results are recorded by the parent task verification, not inferred from this schema inspection.

Independent structure validation found65 manga,59 favorites,8754 chapters,6653 read chapters,0 bookmarked chapters,1789 chapters with nonzero lastPageRead,1799 history records (all match a chapter URL),65 thumbnail URLs,3 sources and1 category. Category Fantasy has order0 and id1;57 manga reference order0 (56 favorites and1 nonfavorite). Six nonfavorite manga all have history and nonzero progress, so exporting only favorites would lose retained reading history. Favorites account for8088 chapters/6538 read/1773 nonzero progress/1783 history; nonfavorites account for666 chapters/115 read/16 nonzero progress/16 history. Root app preference count24, source preference count2 and extension-store count1 are recorded without decoding or printing their values. No credentials/tokens were copied into research notes.

Validation command `python artifacts/mobile-backup-covers/apk/check-sample.py` returned the above counts with exit0 and wrote `sample-splits.json`. `sample-structure.json` retains the initial independent wire-count inventory. These are file-parser checks, not proof that Android or the production desktop reader restored the backup.

### Desktop consequences and unresolved questions

A desktop mobile importer must map manga by exact remote source identity plus URL, category references by order/name, chapter/history identity by URLs, and preserve nonfavorite historical manga without incorrectly adding them to the library. Missing source installations must remain explicit rather than replacing source IDs with title matches. Thumbnail URLs are references, not embedded high-resolution art; actual image resolution and cache/display transformations need desktop image-pipeline testing. Mobile settings, source-specific preferences, repository signing metadata, numeric enum identities and advanced reader flag translation require deliberate mappings; unrecognized records must not become silently functioning desktop controls. Tracker/OAuth remains removed per the personal-build decision.

No Android backup/restore UI was launched, no extension was installed by this schema investigation, and no universal format/version compatibility is claimed. Actual desktop restore/native-roundtrip, cover quality, regression and rollback results belong to `artifacts/mobile-backup-covers/VERIFICATION.txt` once executed.


## 2026-10-28 ? Mobile restore and cover clarity implementation (Electron v1.2.2)

### Evidence and distinctions
- APK reference remains Mihon v0.21.3/code39, SHA256 `b499552614bec398b0687c77ffe973942282c29ca74e631a6b70ecbabff1782e`. Static serializer observations above are not Android runtime proof.
- Supplied gzip-protobuf backup SHA256 `a6bcddedbf9ba02da6c0797a1f69587e5b5305211f4304bf9064879d14cfa2f8`; original input is preserved. Independent APK-schema decode: 65 manga, 59 favorites, 8754 chapters, 6653 read, 1799 history, one category (Fantasy: order0/id1), 57 memberships, 1789 progressed chapters, page sum83708. Six nonfavorites retain reading history; they must not become favorites.
- Correction to inferred desktop GraphQL contract: pinned Suwayomi v2.4.2366 uses scalar **LongString**, not Long. Live introspection rejected Long; corrected exact source+URL query and minimal gzip registration passed in an isolated JVM profile. `artifacts/mobile-backup-covers/live-hydration.log` records `LIVE_HYDRATION_OK`. This registers an engine record only; it is not proof that all mobile extensions fetch chapters on desktop.

### MihonPC implementation
- `mobile-backup.ts` bounds gzip/protobuf decoding, retains source Long IDs as strings, maps membership by category **order**, decodes float chapter numbers and reading history, and produces canonical source+opaque URL identities. Unknown wire fields are skipped; malformed/truncated/oversize payloads fail before import.
- `backups.ts` accepts mobile .tachibk and native .mihonbk; merges read/bookmark/page/history maxima, preserves favorites, source identities and category membership. Native exports include favorites and historical nonfavorites, allowing lossless collection/progress roundtrips for this sample. New chapter fetch dates are restored; reimports retain newer dates.
- Mobile application/source settings, tracking credentials, repositories and reader bit flags are not applied. Backup does not contain extension code or cover/page bytes. Import UI states these exclusions and actual restore counts. Matching sources must be installed separately.
- Runtime hydration uses exact source+opaque URL lookup and pinned engine backup-import API, not title/catalogue guessing. Engine registration includes no chapters, preferences, repositories or backup thumbnail URLs. Canonical cover routes require a matching local database identity; the installed extension supplies current metadata/images. Native profile-local numeric thumbnail routes normalize to stable cover keys when restored.
- Cover evidence: actual cached source is 2000x2861 WebP, 525788bytes, SHA256 `6c816fde9bbdc610cc6f13bf9ebe0a8ff2ec2c3c555279dec45d8cec8af22e71`. Original bytes were already detailed; browser reduction to about180px produced aliasing. High-quality minimum2x display renditions reduce aliasing without upscaling or inventing resolution. Isolated sandboxed Chromium handles WebP; native high-quality resize handles PNG/JPEG. Original file hash remains unchanged. See `cover-quality.md`, `cover-proof.json` and `cover-resampling-comparison.png` in the same artifact directory.

### Tests and unresolved work
- Baseline v1.2.1:64 unit tests pass but supplied .tachibk fails JSON parsing. Modified unit suite:72 pass, including schema/order/Long/float/history, malformed payloads, merge/roundtrip and mocked runtime identity reconstruction. Supplied-file test independently asserts all counts above, repeat import stable IDs/counts, native export/reimport equivalent counts and SQLite integrity=ok.
- Electron UI restore uses a disposable profile, actual Restore backup button and typed IPC; screenshot shows65 restored/0errors and59 favorites. Personal collection is not merged by this test. Packaged regression and rollback commands/results are recorded in `artifacts/mobile-backup-covers/VERIFICATION.txt`.
- Unresolved: online chapter/cover fetching from each of the three installed mobile-source versions is not established by offline restore tests; source availability/version changes remain independent. Mobile settings/downloads/reader bit-field parity is not claimed. No Android runtime was launched for this task.
