import { describe, expect, it } from 'vitest'

import { EFFECT_EDGE_T_MAX, EFFECT_EDGE_T_MIN } from '../blockModel'
import { effectExitLint, effectPortEdgeTFromRoute } from './effectCable'

const BLOCK = { x: 0, y: 0, w: 200, h: 100 }
const p = (x: number, y: number) => ({ x, y })

describe('effectPortEdgeTFromRoute', () => {
  it('puts the port where the cable actually leaves the top edge', () => {
    expect(effectPortEdgeTFromRoute([p(150, 0), p(150, -40), p(400, -40)], BLOCK)).toBeCloseTo(0.75)
    expect(effectPortEdgeTFromRoute([p(40, 0), p(40, -40)], BLOCK)).toBeCloseTo(0.2)
  })

  it('moves when the cable is rerouted — the port follows, it has no slot', () => {
    const before = effectPortEdgeTFromRoute([p(60, 0), p(60, -30)], BLOCK)
    const after = effectPortEdgeTFromRoute([p(160, 0), p(160, -30)], BLOCK)
    expect(before).not.toBeCloseTo(after!)
    expect(after).toBeGreaterThan(before!)
  })

  it('reads a crossing partway along a segment, not just a vertex', () => {
    // Starts inside the block and climbs out through the top.
    expect(effectPortEdgeTFromRoute([p(100, 60), p(100, -20)], BLOCK)).toBeCloseTo(0.5)
  })

  it('leaves the port alone when the cable goes out another edge', () => {
    expect(effectPortEdgeTFromRoute([p(200, 50), p(320, 50)], BLOCK)).toBeNull()
    expect(effectPortEdgeTFromRoute([p(100, 100), p(100, 180)], BLOCK)).toBeNull()
  })

  it('never lets a port land on a corner', () => {
    expect(effectPortEdgeTFromRoute([p(0, 0), p(-40, 0)], BLOCK)).toBeNull()
    expect(effectPortEdgeTFromRoute([p(1, 0), p(1, -40)], BLOCK)).toBeCloseTo(EFFECT_EDGE_T_MIN)
    expect(effectPortEdgeTFromRoute([p(199, 0), p(199, -40)], BLOCK)).toBeCloseTo(EFFECT_EDGE_T_MAX)
  })
})

describe('effectExitLint', () => {
  it('says nothing about a cable that leaves the top', () => {
    expect(effectExitLint([
      { connectionId: 'a', points: [p(100, 0), p(100, -40)], box: BLOCK },
    ])).toEqual([])
  })

  it('reports the edge a cable used instead, and never rewrites it', () => {
    const defects = effectExitLint([
      { connectionId: 'right', points: [p(200, 50), p(320, 50)], box: BLOCK },
      { connectionId: 'bottom', points: [p(100, 100), p(100, 180)], box: BLOCK },
      { connectionId: 'top', points: [p(100, 0), p(100, -40)], box: BLOCK },
    ])
    expect(defects).toEqual([
      { connectionId: 'right', side: 'right' },
      { connectionId: 'bottom', side: 'bottom' },
    ])
  })

  it('reports a cable that never leaves the block at all', () => {
    expect(effectExitLint([
      { connectionId: 'stuck', points: [p(40, 40), p(120, 60)], box: BLOCK },
    ])).toEqual([{ connectionId: 'stuck', side: 'none' }])
  })
})
