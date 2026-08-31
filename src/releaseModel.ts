import type { ReleaseStatus } from './releaseClient'

export function channelLabel(channel: ReleaseStatus['channel']): string {
  return channel === 'preview' ? 'Preview' : 'Stable'
}

export function shortBuild(build: string): string {
  return build === 'working-tree' ? 'Live working tree' : build.slice(0, 8)
}

export function pillLabel(status: ReleaseStatus | null): string {
  if (!status) return 'SystemSketch'
  return `SystemSketch ${status.version} · ${channelLabel(status.channel)}`
}

export function freshnessLabel(status: ReleaseStatus): string {
  if (status.channel === 'preview') return 'Updates appear live as source files change.'
  if (!status.isCurrent) return 'A newer Stable build is ready for the next launch.'
  if (status.sourceChanged) return 'Preview has newer local work to try.'
  return 'This is the current verified Stable build.'
}
