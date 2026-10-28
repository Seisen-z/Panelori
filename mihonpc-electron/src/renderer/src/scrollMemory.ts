import { useLayoutEffect } from 'react'
const positions = new Map<string, number>()
// Restore after async collection rows arrive, not just before their first empty render.
export function useRouteScroll(path: string): void {
  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const desired = positions.get(path) ?? 0
    let restoring = true
    const observer = new MutationObserver(() => restore())
    const remember = (): void => {
      if (!restoring) positions.set(path, main.scrollTop)
    }
    const finish = (): void => {
      restoring = false
      observer.disconnect()
    }
    const restore = (): void => {
      main.scrollTop = desired
      if (Math.abs(main.scrollTop - desired) < 1) finish()
    }
    observer.observe(main, { childList: true, subtree: true })
    main.addEventListener('scroll', remember)
    main.addEventListener('wheel', finish, { once: true })
    main.addEventListener('pointerdown', finish, { once: true })
    restore()
    const timer = setTimeout(finish, 1500)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      main.removeEventListener('scroll', remember)
      main.removeEventListener('wheel', finish)
      main.removeEventListener('pointerdown', finish)
    }
  }, [path])
}
