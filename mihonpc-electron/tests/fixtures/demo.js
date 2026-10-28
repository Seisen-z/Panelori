// Test fixture only. The runner copies this into a disposable extensions directory.
module.exports.extensionMeta = {
  id: 'en.mihonpc-fixture',
  name: 'MihonPC test fixture',
  version: '1.0.0',
  lang: 'en',
  nsfw: false
}
module.exports.default = class {
  id = 7001
  name = 'Paper Shelf'
  lang = 'en'
  baseUrl = '__BASE_URL__'
  supportsLatest = true
  headers = { 'X-Image-Key': 'fixture' }
  manga(name, url, cover) {
    return {
      url,
      title: name,
      status: 1,
      author: 'MihonPC test fixture',
      thumbnailUrl: this.baseUrl + '/images/' + cover + '.png',
      initialized: true
    }
  }
  async getPopularManga(page) {
    return {
      mangas:
        page === 1
          ? [this.manga('Paper Satellites', '/manga/paper', 'cover-a')]
          : page === 2
            ? [this.manga('Harbor Light', '/manga/harbor', 'cover-b')]
            : [],
      hasNextPage: page === 1
    }
  }
  async getLatestUpdates() {
    return { mangas: [this.manga('Harbor Light', '/manga/harbor', 'cover-b')], hasNextPage: false }
  }
  async searchManga(page, query, filters) {
    const all = [
      ...(await this.getPopularManga(1)).mangas,
      ...(await this.getPopularManga(2)).mangas
    ]
    return {
      mangas: all.filter(
        (m) =>
          m.title.toLowerCase().includes(query.toLowerCase()) &&
          (!(filters || []).find((f) => f.name === 'Only Harbor')?.state ||
            m.title === 'Harbor Light')
      ),
      hasNextPage: false
    }
  }
  async getMangaDetails(manga) {
    return {
      ...manga,
      description:
        'A test-only story about small journeys and things worth keeping. These pages exercise the desktop reader; they are not a bundled manga source.',
      genre: 'Slice of life, Adventure',
      artist: 'MihonPC test fixture',
      initialized: true
    }
  }
  async getChapterList(manga) {
    return [1, 2].map((n) => ({
      url: manga.url + '/chapter/' + n,
      name: 'Chapter ' + n + ' — ' + (n === 1 ? 'The departure' : 'A new shore'),
      chapterNumber: n,
      dateUpload: 1792886400000 + n * 86400000,
      scanlator: 'Local fixture'
    }))
  }
  async getPageList(chapter) {
    return Array.from({ length: chapter.chapterNumber === 1 ? 4 : 40 }, (_, index) => ({
      index,
      url: this.baseUrl + '/images/page-' + ((index % 4) + 1) + '.png?i=' + index,
      imageUrl: this.baseUrl + '/images/page-' + ((index % 4) + 1) + '.png?i=' + index
    }))
  }
  getFilters() {
    return [
      { type: 'checkbox', name: 'Only Harbor', state: false },
      { type: 'select', name: 'Sort', values: ['Default', 'Title'], state: 0 },
      { type: 'text', name: 'Author', state: '' }
    ]
  }
}
