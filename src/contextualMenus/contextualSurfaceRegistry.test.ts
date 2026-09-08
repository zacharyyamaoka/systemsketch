import { describe, expect, it } from 'vitest'

import { contextualSurfaceItems } from './contextualSurfaceRegistry'

describe('contextual surface composition', () => {
  it('adds Block-specific actions before shared selection items', () => {
    expect(contextualSurfaceItems('block-selection')).toEqual([
      'block-actions', 'appearance', 'opacity', 'arrange', 'code-actions', 'wrap', 'layout', 'propagation-focus',
    ])
  })

  it('uses the same shared items for an ordinary shape without Block actions', () => {
    expect(contextualSurfaceItems('shape-selection')).toEqual([
      'appearance', 'opacity', 'arrange', 'code-actions', 'wrap', 'layout', 'propagation-focus',
    ])
  })

  it('keeps Behavior Tree actions as a named composition surface, plus the opacity/arrange every selection gets', () => {
    expect(contextualSurfaceItems('behavior-tree-selection')).toEqual([
      'behavior-tree-actions', 'opacity', 'arrange',
    ])
  })

  it('gives a Branch selection opacity and arrange alongside its own actions', () => {
    expect(contextualSurfaceItems('branch-selection')).toEqual([
      'branch-actions', 'opacity', 'arrange',
    ])
  })

  it('keeps live title editing as a named composition, not a second toolbar implementation', () => {
    expect(contextualSurfaceItems('block-title-editing')).toEqual(['title-formatting'])
  })
})
