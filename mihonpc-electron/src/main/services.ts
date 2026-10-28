import type { ExtensionManager } from './extensions/manager'
import type { ImageCache } from './images'
import { LibraryRepository, sourceManga, sourceChapter } from './library'
import type { ReaderSession } from '../shared/ipc'
import type { SManga } from '../shared/source'
export class ReadingServices {
  offlinePage: (id: number, index: number) => string | null = () => null
  constructor(
    readonly library: LibraryRepository,
    readonly extensions: ExtensionManager,
    readonly images: ImageCache
  ) {}
  async open(sourceId: number, value: SManga): Promise<number> {
    const manga = await this.extensions.details(sourceId, value)
    // Source-relative identity stays stable even if the details response is incomplete.
    if (manga.url !== value.url) throw new Error('Source changed the manga URL identity')
    const chapters = await this.extensions.chapters(sourceId, manga)
    return this.library.save(sourceId, manga, chapters)
  }
  async refresh(id: number): Promise<ReturnType<LibraryRepository['detail']>> {
    const manga = this.library.manga(id)
    await this.open(manga.source_id, sourceManga(manga))
    return this.library.detail(id)
  }
  async reader(id: number, refresh: boolean): Promise<ReaderSession> {
    const chapter = this.library.chapter(id),
      detail = this.library.detail(chapter.manga_id)
    let pages = this.library.pages(id)
    const cached = pages.length > 0 && !refresh
    if (!cached) {
      pages = await this.extensions.pages(detail.manga.source_id, sourceChapter(chapter))
      this.library.savePages(id, pages)
    }
    return {
      ...detail,
      chapter,
      pages,
      preferences: this.library.preferences(chapter.manga_id),
      cached
    }
  }
  async page(id: number, index: number): Promise<string> {
    const offline = this.offlinePage(id, index)
    if (offline) return offline
    const chapter = this.library.chapter(id),
      manga = this.library.manga(chapter.manga_id),
      page = this.library.pages(id)[index]
    if (!page?.imageUrl) throw new Error('Page is not loaded for this chapter')
    return this.images.dataUrl(manga.source_id, page.imageUrl, page.headers)
  }
  async retryPage(id: number, index: number): Promise<string> {
    const chapter = this.library.chapter(id),
      manga = this.library.manga(chapter.manga_id),
      page = this.library.pages(id)[index]
    if (!page?.imageUrl) throw new Error('Page is not loaded for this chapter')
    this.images.invalidate(manga.source_id, page.imageUrl)
    return this.page(id, index)
  }
}
