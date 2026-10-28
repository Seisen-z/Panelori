import { create } from 'zustand'
import type { AppStatus, HistoryEntry, Manga, SourceInfo } from '../../../shared/ipc'
import { invoke } from '../ipc'
interface State {
  status: AppStatus | null
  manga: Manga[]
  sources: SourceInfo[]
  history: HistoryEntry[]
  loading: boolean
  error: string | null
  ping: string | null
  refresh: () => Promise<void>
}
export const useAppStore = create<State>((set) => ({
  status: null,
  manga: [],
  sources: [],
  history: [],
  loading: true,
  error: null,
  ping: null,
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const [ping, status, manga, sources, history] = await Promise.all([
        invoke('app:ping'),
        invoke('app:status'),
        invoke('library:getFavorites'),
        invoke('source:getAll'),
        invoke('history:getRecent', 50, 0)
      ])
      set({ ping, status, manga, sources, history, loading: false })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}))
