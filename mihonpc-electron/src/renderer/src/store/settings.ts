import { create } from 'zustand'
import { defaultSettings, type Settings } from '../../../shared/settings'
import { invoke } from '../ipc'
export const useSettings = create<{
  value: Settings
  load: () => Promise<void>
  save: (patch: Partial<Settings>) => Promise<void>
}>((set) => ({
  value: { ...defaultSettings },
  load: async () => {
    set({ value: await invoke('settings:get') })
  },
  save: async (patch) => {
    set({ value: await invoke('settings:set', patch) })
  }
}))
