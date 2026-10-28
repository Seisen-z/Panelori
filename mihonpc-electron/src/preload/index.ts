import { contextBridge, ipcRenderer } from 'electron'
import { isChannel, validateArgs, type ElectronBridge } from '../shared/ipc'

if (process.argv.includes('--mihonpc-extension-host')) {
  const channel = process.argv
    .find((arg) => arg.startsWith('--extension-fetch-channel='))
    ?.slice('--extension-fetch-channel='.length)
  if (!channel) throw new Error('Extension fetch channel is missing')
  contextBridge.exposeInMainWorld(
    'extensionHost',
    Object.freeze({
      fetch: (url: string, options: unknown) => ipcRenderer.invoke(channel, url, options)
    })
  )
} else {
  const bridge: ElectronBridge = {
    invoke: (channel, ...args) => {
      if (!isChannel(channel)) return Promise.reject(new Error('Unknown IPC channel'))
      try {
        validateArgs(channel, args)
      } catch (error) {
        return Promise.reject(error)
      }
      return ipcRenderer.invoke(channel, ...args)
    }
  }
  contextBridge.exposeInMainWorld('electron', Object.freeze(bridge))
}
