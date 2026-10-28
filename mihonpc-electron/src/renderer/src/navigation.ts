// Explicit internal return targets survive reader/detail round-trips and reloads.
export interface ReturnTarget {
  path: string
  label: string
  state?: NavigationState
}
export interface NavigationState {
  origin?: ReturnTarget
}
const internal =
  /^\/(?:library|browse|history|updates|more|backup|downloads|statistics|about|settings\/[a-z]+|source\/\d+|manga\/\d+)(?:\?[^#]*)?$/
export function resolveOrigin(value: unknown, fallback: ReturnTarget, depth = 0): ReturnTarget {
  if (!value || typeof value !== 'object' || depth > 3) return fallback
  const origin = (value as NavigationState).origin
  if (
    !origin ||
    typeof origin.path !== 'string' ||
    !internal.test(origin.path) ||
    typeof origin.label !== 'string'
  )
    return fallback
  return {
    path: origin.path,
    label: origin.label.slice(0, 60),
    state: depth < 3 ? origin.state : undefined
  }
}
export function makeOrigin(
  location: { pathname: string; search?: string; state?: unknown },
  label: string
): NavigationState {
  const path = location.pathname + (location.search || '')
  if (!internal.test(path)) return {}
  const fallback = { path: '/library', label: 'Library' }
  const prior = resolveOrigin(location.state, fallback)
  return { origin: { path, label, state: location.state ? { origin: prior } : undefined } }
}
