import type { Manga } from './ipc'

/** Hide only exact source-relative favorite identities; never match by title. */
export function catalogueVisibility<T extends { url: string }>(
  items: readonly T[],
  sourceId: number,
  favorites: readonly Pick<Manga, 'source_id' | 'url' | 'favorite'>[],
  hideInLibrary: boolean
): T[] {
  if (!hideInLibrary) return [...items]
  const urls = new Set(
    favorites
      .filter((item) => item.source_id === sourceId && item.favorite === 1)
      .map((item) => item.url)
  )
  return items.filter((item) => !urls.has(item.url))
}
