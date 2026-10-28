/** Reader-only display wake policy; never keep a hidden/tray window awake. */
export function shouldKeepDisplayAwake(enabled: boolean, url: string, visible: boolean): boolean {
  if (!enabled || !visible) return false
  try {
    return /^#\/reader\/\d+(?:[/?]|$)/.test(new URL(url).hash)
  } catch {
    return false
  }
}
