import { describe, expect, it } from 'vitest'
import type { ReleaseStatus } from './releaseClient'
import {
  freshnessLabel,
  hasNewPreview,
  makeStableLabel,
  makeStablePhase,
  pillLabel,
  previewDetailLabel,
  returnToStableLabel,
  shortBuild,
  versionStatusLabel,
} from './releaseModel'

const stable: ReleaseStatus = {
  product: 'systemsketch',
  channel: 'stable',
  build: '1234567890abcdef',
  stable: '1234567890abcdef',
  candidate: null,
  previous: null,
  version: '0.1.0',
  releasedAt: '2026-08-30T00:00:00Z',
  changes: [],
  isCurrent: true,
  sourceChanged: false,
  canPreview: true,
  canPromote: false,
  canRollback: false,
}

describe('release presentation', () => {
  it('keeps the closed control small and unambiguous', () => {
    expect(pillLabel(stable)).toBe('SystemSketch 0.1.0 · Stable')
    expect(shortBuild(stable.build)).toBe('12345678')
  })

  it('distinguishes immutable stable from live preview', () => {
    expect(freshnessLabel(stable)).toContain('verified Stable')
    expect(freshnessLabel({ ...stable, sourceChanged: true })).toContain('newer local work')
    expect(freshnessLabel({ ...stable, channel: 'preview', build: 'working-tree' })).toContain('live')
  })

  it('shows the Help notification only for newer Preview work', () => {
    expect(hasNewPreview(stable)).toBe(false)
    expect(hasNewPreview({ ...stable, sourceChanged: true })).toBe(true)
    expect(hasNewPreview({ ...stable, sourceChanged: true, canPreview: false })).toBe(false)
    expect(hasNewPreview({ ...stable, sourceChanged: true, channel: 'preview' })).toBe(false)
    expect(hasNewPreview(null)).toBe(false)
  })

  it('keeps the fixed update row quiet until action is available', () => {
    expect(versionStatusLabel(null)).toBe('Checking…')
    expect(versionStatusLabel(stable)).toBe('0.1.0 · Up to date')
    expect(versionStatusLabel({ ...stable, sourceChanged: true })).toBe('0.1.0 · Preview ready')
    expect(versionStatusLabel({ ...stable, sourceChanged: true, canPreview: false })).toBe('0.1.0 · Preview unavailable')
    expect(versionStatusLabel({ ...stable, channel: 'preview', build: 'working-tree' })).toBe('Live Preview · working tree')
  })
})

const preview: ReleaseStatus = {
  ...stable,
  channel: 'preview',
  build: 'working-tree',
  canPromote: true,
}

const resting = { armed: false, working: false, published: false }

describe('making Preview the Stable build', () => {
  it('offers the transition only from a promotable Preview', () => {
    expect(makeStablePhase(null, resting)).toBe('unavailable')
    expect(makeStablePhase(stable, resting)).toBe('unavailable')
    expect(makeStablePhase({ ...preview, canPromote: false }, resting)).toBe('unavailable')
    expect(makeStablePhase(preview, resting)).toBe('idle')
  })

  it('requires a deliberate second click before a build starts', () => {
    expect(makeStablePhase(preview, { ...resting, armed: true })).toBe('armed')
    expect(makeStableLabel('idle')).toBe('Make Preview Stable')
    expect(makeStableLabel('armed')).toContain('Confirm')
    expect(previewDetailLabel('armed')).toContain('host plugins')
    expect(previewDetailLabel('armed')).toContain('points Stable here')
  })

  it('keeps work in progress and the finished result distinguishable', () => {
    expect(makeStablePhase(preview, { ...resting, working: true, armed: true })).toBe('working')
    expect(makeStablePhase(preview, { ...resting, published: true })).toBe('published')
    expect(makeStableLabel('working')).toBe('Making Stable…')
    expect(previewDetailLabel('working')).toContain('takes a few minutes')
    expect(previewDetailLabel('idle')).toBe('Live working copy · Stable stays unchanged')
  })

  it('turns returning into the follow-through once Stable has moved', () => {
    expect(returnToStableLabel('idle', false)).toBe('Return to Stable')
    expect(returnToStableLabel('published', false)).toBe('Open new Stable')
    expect(returnToStableLabel('published', true)).toBe('Returning…')
  })
})
