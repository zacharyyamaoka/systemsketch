import { describe, expect, it } from 'vitest'

import {
  MIN_CALLOUT_GAP,
  MIN_SAME_EDGE_TARGET_GAP,
  estimatedWrappedLines,
  rectangleGap,
  validateRecipe,
} from './layout_quality.mjs'

function recipe() {
  return {
    feature: 'Layout validation',
    viewport: { width: 1280, height: 720 },
    shapes: [{ id: 'subject', type: 'block', x: 600, y: 260 }],
    bindings: [],
    callouts: [
      {
        id: 'step-1', kind: 'step', text: '1 · Drag the Block right',
        x: 40, y: 120, w: 360, h: 110,
        target: { shapeId: 'subject', anchor: 'left' },
      },
      {
        id: 'pass', kind: 'pass', text: 'PASS WHEN · The Block moves',
        x: 40, y: 310, w: 440, h: 110,
      },
    ],
  }
}

describe('review fixture layout quality', () => {
  it('accepts a spaced recipe with an explicit target edge', () => {
    expect(() => validateRecipe(recipe())).not.toThrow()
  })

  it('rejects ambiguous center targets', () => {
    const candidate = recipe()
    candidate.callouts[0].target.anchor = 'center'
    expect(() => validateRecipe(candidate)).toThrow(/must name a target edge/)
  })

  it('rejects offsets that pull an endpoint away from its edge', () => {
    const candidate = recipe()
    candidate.callouts[0].target.dx = 12
    expect(() => validateRecipe(candidate)).toThrow(/pull the endpoint off the left edge/)
  })

  it('rejects flush or overlapping cards', () => {
    const candidate = recipe()
    candidate.callouts[1].y = candidate.callouts[0].y + candidate.callouts[0].h + MIN_CALLOUT_GAP - 1
    expect(() => validateRecipe(candidate)).toThrow(/leave at least 48/)
  })

  it('rejects converging arrow lanes on the same target edge', () => {
    const candidate = recipe()
    candidate.callouts.splice(1, 0, {
      id: 'step-2', kind: 'step', text: '2 · Use the second edge control',
      x: 40, y: 310, w: 360, h: 110,
      target: { shapeId: 'subject', anchor: 'left', dy: MIN_SAME_EDGE_TARGET_GAP - 1 },
    })
    candidate.callouts[2].y = 500
    expect(() => validateRecipe(candidate)).toThrow(/separate their edge lanes by at least 48/)
  })

  it('rejects text that is likely to clip', () => {
    const candidate = recipe()
    candidate.callouts[0].text = Array(45).fill('unnecessarily-dense').join(' ')
    expect(() => validateRecipe(candidate)).toThrow(/enlarge or shorten/)
  })

  it('measures whitespace and estimated wrapping independently', () => {
    expect(rectangleGap(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 160, y: 0, w: 100, h: 100 },
    )).toBe(60)
    expect(estimatedWrappedLines('one two three four five six', 340)).toBeGreaterThanOrEqual(1)
  })
})
