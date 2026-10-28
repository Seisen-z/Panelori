import type { Channel, IpcContract } from '../../../shared/ipc'
export function invoke<C extends Channel>(
  channel: C,
  ...args: IpcContract[C]['args']
): Promise<IpcContract[C]['result']> {
  if (!window.electron)
    return Promise.reject(new Error('Open MihonPC in the desktop app, not a browser.'))
  return window.electron.invoke(channel, ...args)
}
