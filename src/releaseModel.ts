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

export function hasNewPreview(status: ReleaseStatus | null): boolean {
  return Boolean(status?.channel === 'stable' && status.sourceChanged && status.canPreview)
}

export function versionStatusLabel(status: ReleaseStatus | null): string {
  if (!status) return 'Checking…'
  if (status.channel === 'preview') return 'Live Preview · working tree'
  if (hasNewPreview(status)) return `${status.version} · Preview ready`
  if (status.sourceChanged && !status.canPreview) return `${status.version} · Preview unavailable`
  return `${status.version} · Up to date`
}

export function freshnessLabel(status: ReleaseStatus): string {
  if (status.channel === 'preview') return 'Updates appear live as source files change.'
  if (!status.isCurrent) return 'A newer Stable build is ready for the next launch.'
  if (status.sourceChanged) return 'Preview has newer local work to try.'
  return 'This is the current verified Stable build.'
}

/**
 * The Preview → Stable transition, as one explicit state.
 *
 * `armed` is the deliberate second click: promoting runs the full check suite,
 * publishes the standalone app, then attempts the host-plugin builds. A stray
 * click on an always-visible control must not start that transaction.
 */
export type MakeStablePhase = 'unavailable' | 'idle' | 'armed' | 'working' | 'published'

export interface MakeStableState {
  armed: boolean
  working: boolean
  published: boolean
}

export function makeStablePhase(status: ReleaseStatus | null, state: MakeStableState): MakeStablePhase {
  if (!status || status.channel !== 'preview' || !status.canPromote) return 'unavailable'
  if (state.working) return 'working'
  if (state.published) return 'published'
  return state.armed ? 'armed' : 'idle'
}

export function makeStableLabel(phase: MakeStablePhase): string {
  if (phase === 'armed') return 'Confirm · replaces Stable'
  if (phase === 'working') return 'Making Stable…'
  if (phase === 'published') return 'Stable updated'
  return 'Make Preview Stable'
}

export function previewDetailLabel(phase: MakeStablePhase, hostArtifactsReady?: boolean): string {
  if (phase === 'armed') return 'Publishes standalone Stable first, then attempts the host-plugin builds.'
  if (phase === 'working') return 'Publishing standalone Stable · host-plugin rebuild follows.'
  if (phase === 'published' && hostArtifactsReady) {
    return 'Standalone Stable updated · host plugins rebuilt · return to launch it.'
  }
  if (phase === 'published') {
    return 'Standalone Stable updated · host-plugin rebuild needs attention · return to launch it.'
  }
  return 'Live working copy · Stable stays unchanged'
}

/** Returning is the follow-through once Preview has become Stable. */
export function returnToStableLabel(phase: MakeStablePhase, returning: boolean): string {
  if (returning) return 'Returning…'
  return phase === 'published' ? 'Open new Stable' : 'Return to Stable'
}
