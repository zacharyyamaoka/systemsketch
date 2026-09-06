import { describe, expect, it } from 'vitest'

import { contextualSurfaceItems } from './contextualSurfaceRegistry'

describe('contextual surface composition', () => {
  it('adds Block-specific actions before shared selection items', () => {
    expect(contextualSurfaceItems('block-selection')).toEqual([
      'block-actions', 'appearance', 'code-actions', 'wrap', 'layout', 'propagation-focus',
    ])
  })

  it('uses the same shared items for an ordinary shape without Block actions', () => {
    expect(contextualSurfaceItems('shape-selection')).toEqual([
      'appearance', 'code-actions', 'wrap', 'layout', 'propagation-focus',
    ])
  })

  it('keeps Behavior Tree actions as a named composition surface', () => {
    expect(contextualSurfaceItems('behavior-tree-selection')).toEqual(['behavior-tree-actions'])
  })

  it('keeps live title editing as a named composition, not a second toolbar implementation', () => {
    expect(contextualSurfaceItems('block-title-editing')).toEqual(['title-formatting'])
  })
})
