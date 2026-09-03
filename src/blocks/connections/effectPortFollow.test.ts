import { describe, expect, it } from 'vitest'

import { EFFECT_EDGE_T_MAX, EFFECT_EDGE_T_MIN } from '../blockModel'
import type { BlockPort } from '../blockModel'
import { effectPortFollow } from './effectPortFollow'

const FRAME = { x: 0, y: 0, w: 400, h: 300 }
const p = (x: number, y: number) => ({ x, y })

const outer = (overrides: Partial<BlockPort> = {}): BlockPort[] => ([
  { id: 'out_1', name: 'count', type: 'int', visible: true },
  { id: 'effect:in_3', name: 'poses', type: 'list[Pose]', visible: true, effect: true, ...overrides },
])

describe('effectPortFollow', () => {
  it('puts the outer port where the cable crosses the frame', () => {
    const move = effectPortFollow({
      // up out of a call inside the frame, then out through the top at x=300
      points: [p(120, 200), p(120, 150), p(300, 150), p(300, -40)],
      frame: FRAME, carries: 'poses', outerPorts: outer(),
    })
    expect(move).toEqual({ portId: 'effect:in_3', edgeT: 0.75 })
  })

  it('moves again when the cable is rerouted — nobody positions it by hand', () => {
    const at = (x: number) => effectPortFollow({
      points: [p(120, 200), p(120, 150), p(x, 150), p(x, -40)],
      frame: FRAME, carries: 'poses', outerPorts: outer(),
    })?.edgeT
    expect(at(80)).toBeCloseTo(0.2)
    expect(at(320)).toBeCloseTo(0.8)
  })

  it('matches the port by the name it carries, not by position', () => {
    const ports: BlockPort[] = [
      { id: 'effect:in_1', name: 'frames', type: 'list', visible: true, effect: true },
      { id: 'effect:in_2', name: 'poses', type: 'list', visible: true, effect: true },
    ]
    const move = effectPortFollow({
      points: [p(10, 200), p(10, -10)], frame: FRAME, carries: 'poses', outerPorts: ports,
    })
    expect(move?.portId).toBe('effect:in_2')
  })

  it('leaves the port alone when the cable goes out any other edge', () => {
    for (const points of [
      [p(200, 150), p(440, 150)],            // right
      [p(200, 150), p(-40, 150)],            // left
      [p(200, 150), p(200, 340)],            // bottom
    ]) {
      expect(effectPortFollow({ points, frame: FRAME, carries: 'poses', outerPorts: outer() })).toBeNull()
    }
  })

  it('does nothing when the enclosing block has no matching effect port', () => {
    expect(effectPortFollow({
      points: [p(200, 150), p(200, -40)], frame: FRAME, carries: 'gain', outerPorts: outer(),
    })).toBeNull()
  })

  it('does nothing when the port is already where the cable puts it', () => {
    const settled = outer({ edgeT: 0.5 })
    expect(effectPortFollow({
      points: [p(200, 150), p(200, -40)], frame: FRAME, carries: 'poses', outerPorts: settled,
    })).toBeNull()
  })

  it('still reports a move once the cable has actually shifted', () => {
    const settled = outer({ edgeT: 0.5 })
    const move = effectPortFollow({
      points: [p(340, 150), p(340, -40)], frame: FRAME, carries: 'poses', outerPorts: settled,
    })
    expect(move?.edgeT).toBeCloseTo(0.85)
  })

  it('never lets the cable push the port onto a corner', () => {
    const left = effectPortFollow({
      points: [p(1, 150), p(1, -40)], frame: FRAME, carries: 'poses', outerPorts: outer(),
    })
    const right = effectPortFollow({
      points: [p(399, 150), p(399, -40)], frame: FRAME, carries: 'poses', outerPorts: outer(),
    })
    expect(left?.edgeT).toBeCloseTo(EFFECT_EDGE_T_MIN)
    expect(right?.edgeT).toBeCloseTo(EFFECT_EDGE_T_MAX)
  })

  it('respects a frame that is not at the origin', () => {
    const move = effectPortFollow({
      points: [p(700, 400), p(700, 100)],
      frame: { x: 600, y: 200, w: 400, h: 300 }, carries: 'poses', outerPorts: outer(),
    })
    expect(move?.edgeT).toBeCloseTo(0.25)
  })
})
