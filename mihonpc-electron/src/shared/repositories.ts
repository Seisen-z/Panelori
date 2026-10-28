export interface ExtensionRepository {
  indexUrl: string
  name: string
}
export interface RepositoryExtension {
  pkgName: string
  name: string
  lang: string
  versionName: string
  installed: boolean
  hasUpdate: boolean
  isNsfw: boolean
}

export function repositoryUrl(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Repository index must use HTTPS')
  if (url.hostname === 'github.com' && /^\/[^/]+\/extensions-source\/?$/.test(url.pathname))
    throw new Error(
      'That is a source-code repository. Add its published extension index (index.pb), not extensions-source.'
    )
  if (url.hostname === 'github.com' && /^\/[^/]+\/extensions\/?$/.test(url.pathname))
    url.pathname = url.pathname.replace(/\/$/, '') + '/raw/repo/index.pb'
  if (!/\/(index\.pb|index\.json|index\.min\.json|repo\.json)$/.test(url.pathname))
    throw new Error(
      'Use the repository index.pb, index.json or repo.json URL, not a GitHub HTML page'
    )
  return url.href
}

export function sourceAlias(remote: string): number {
  if (!/^-?[0-9]+$/.test(remote)) throw new Error('Invalid source Long ID')
  const value = BigInt(remote)
  if (value < -(1n << 63n) || value >= 1n << 63n) throw new Error('Source ID exceeds signed Long')
  return 4000000000000 + Number(value & 0xffffffffffffn)
}
