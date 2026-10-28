import type { ElectronBridge } from '../shared/ipc'
declare global {
  interface Window {
    electron: ElectronBridge
  }
}
