# Desktop JavaScript extensions

An extension is a single CommonJS .js bundle with no external require calls. Install it using Browse → Extensions. An extension may export a default class, a synchronous factory returning source instances, or an array of source instances.

```javascript
module.exports.extensionMeta = {
  id: 'en.my-source',
  name: 'My Source',
  version: '1.0.0',
  lang: 'en',
  nsfw: false,
  hosts: ['images.example.org'] // optional additional exact CDN hostnames
}
module.exports.default = class MySource {
  id = 123456 // positive Number.isSafeInteger ID; stable across updates
  name = 'My Source'
  lang = 'en'
  baseUrl = 'https://example.org'
  supportsLatest = true
  headers = { Referer: 'https://example.org/' } // optional image request headers

  async getPopularManga(page) {
    return { mangas: [], hasNextPage: false }
  }
  async getLatestUpdates(page) {
    return { mangas: [], hasNextPage: false }
  }
  async searchManga(page, query, filters) {
    return { mangas: [], hasNextPage: false }
  }
  async getMangaDetails(manga) {
    return manga
  }
  async getChapterList(manga) {
    return []
  }
  async getPageList(chapter) {
    return []
  }
  getFilters() {
    return []
  } // optional
  // Optional when getPageList does not supply imageUrl:
  // async getImageUrl(page) { return 'https://images.example.org/page.png' }
}
```

SManga: url, title, status (0–6), optional author/artist/description/genre/thumbnailUrl/initialized. Manga and chapter identity URLs must be source-relative paths, not absolute URLs. Covers and image URLs are absolute HTTP(S).

SChapter: url, name, chapterNumber (finite number), dateUpload (epoch ms), optional scanlator.

Page: index, url, optional imageUrl and headers. Page ordering is normalized to array order. A nonempty imageUrl or optional getImageUrl method must resolve each image. PNG/JPEG/GIF/WebP are accepted; HTML and SVG image payloads are rejected.

Filters: { type, name, state?, values? }. Supported types are text, select, checkbox, header and separator; select state is a zero-based index. Bundle Android/other filter types into these desktop equivalents.

## Runtime and networking

Constructors and factories must be synchronous and perform no network I/O. The runtime discovers metadata before granting fetch access. fetch(url, options) is an async main-process broker returning ok, status, statusText, url, Headers, text() and json(). Options support method, string body and string header values. URL, URLSearchParams, Headers, DOMParser and console are browser globals.

A limited browser Buffer shim supports from (UTF-8/base64/hex/array), alloc, concat, isBuffer and toString. It is not the Node runtime. Package dependencies must be bundled for browsers; fs, child_process, Node require and app IPC are not available.

baseUrl hostnames are granted automatically. Additional CDNs/redirect targets must be exact entries in extensionMeta.hosts. Wildcards, credentials in URLs, private/loopback/link-local destinations, arbitrary file URLs and unlisted redirect hosts are rejected. DNS results are checked and pinned for the connection. Private addresses are allowed only inside the explicit disposable test harness.

The broker validates headers, caps response/body sizes, follows at most five redirects, preserves custom headers and keeps host-isolated cookies in memory. Authorization/Cookie headers are stripped when crossing origins. Gzip/deflate/Brotli decoding is bounded. Cookie domain sharing across subdomains, persistent login storage, streaming/binary fetch bodies and browser anti-bot challenge pages are not implemented in this phase.

Bundle size: 2 MiB. Host load deadline: 6 seconds; source method deadline: 20 seconds; HTTP inactivity timeout: 15 seconds. Timed-out hosts stop and require Reload extensions. These limits protect responsiveness but do not establish an unlimited hostile-code resource guarantee.

## Validation

Duplicate extension/source IDs, malformed results, unsafe integers and missing Source methods are rejected. Broken bundles are listed with errors and skipped; valid bundles still load. Installation validates before replacing the prior bundle, and disabled extensions retain their metadata without executing code.

See tests/fixtures/demo.js for a test-only example. That source is never shipped in the packaged application's extensions directory.
