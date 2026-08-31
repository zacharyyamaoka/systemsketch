import { describe, expect, it } from 'vitest'
import type { ReleaseStatus } from './releaseClient'
import { freshnessLabel, pillLabel, shortBuild } from './releaseModel'

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
})
