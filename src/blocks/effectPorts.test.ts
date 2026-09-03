import { describe, expect, it } from 'vitest'

import {
  EFFECT_EDGE_T_DEFAULT,
  clampEdgeT,
  effectPortId,
  isEffectPort,
  mutatedInputId,
  portEdgeT,
  portMutates,
  reconcileEffectPorts,
  setBlockPortMutates,
  setEffectPortEdgeT,
} from './blockModel'
import type { BlockPort, BlockShapeProps } from './blockModel'
import { layoutBlock } from './layoutBlock'

const input = (id: string, name = id, extra: Partial<BlockPort> = {}): BlockPort => ({
  id, name, type: 'list[Pose]', visible: true, ...extra,
})

function props(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
  return {
    w: 340, h: 198, title: 'poses.append()', description: '', blockType: 'call',
    view: 'port', showDescription: true, portLayout: 'rows',
    views: {
      simple: { w: 320, h: 206 }, port: { w: 340, h: 198 },
      expanded: { w: 560, h: 380 }, value: { w: 96, h: 56 },
    },
    inputs: [input('in_1', 'poses'), input('in_2', 'pose')],
    outputs: [],
    ...overrides,
  } as BlockShapeProps
}

describe('effect ports', () => {
  it('appears when an argument is marked as written in place', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    expect(marked.inputs[0].mutates).toBe(true)
    expect(marked.outputs).toHaveLength(1)
    const effect = marked.outputs[0]
    expect(isEffectPort(effect)).toBe(true)
    expect(effect.id).toBe(effectPortId('in_1'))
    expect(mutatedInputId(effect)).toBe('in_1')
    expect(effect.name).toBe('poses')
    expect(portEdgeT(effect)).toBe(EFFECT_EDGE_T_DEFAULT)
  })

  it('disappears again when the argument stops being marked', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    const cleared = setBlockPortMutates(marked, 'in_1', false)
    expect(cleared.outputs).toEqual([])
    expect(portMutates(cleared.inputs[0])).toBe(false)
    expect('mutates' in cleared.inputs[0]).toBe(false)
  })

  it('leaves ordinary outputs alone — a call may return a value and mutate too', () => {
    // `item = poses.pop()` hands back the element *and* shortens the list.
    const popped = setBlockPortMutates(
      props({ outputs: [{ id: 'out_1', name: 'item', type: 'Pose', visible: true }] }),
      'in_1',
      true,
    )
    expect(popped.outputs.map((port) => port.id)).toEqual(['out_1', effectPortId('in_1')])
    expect(popped.outputs.filter(isEffectPort)).toHaveLength(1)
  })

  it('is idempotent, so a re-render never rewrites the props', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    expect(reconcileEffectPorts(marked)).toBe(marked)
    expect(setBlockPortMutates(marked, 'in_1', true)).toBe(marked)
  })

  it('keeps a moved port where the cable put it across a reconcile', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    const moved = setEffectPortEdgeT(marked, effectPortId('in_1'), 0.82)
    expect(portEdgeT(moved.outputs[0])).toBeCloseTo(0.82)
    expect(portEdgeT(reconcileEffectPorts(moved).outputs[0])).toBeCloseTo(0.82)
  })

  it('follows a rename of the argument it writes back to', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    const renamed = reconcileEffectPorts({
      ...marked,
      inputs: marked.inputs.map((port) => (port.id === 'in_1' ? { ...port, name: 'buffer' } : port)),
    })
    expect(renamed.outputs[0].name).toBe('buffer')
  })

  it('drops an orphan whose input was deleted outright', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    const orphaned = reconcileEffectPorts({
      ...marked,
      inputs: marked.inputs.filter((port) => port.id !== 'in_1'),
    })
    expect(orphaned.outputs).toEqual([])
  })

  it('clamps the edge fraction so a port never sits on a corner', () => {
    expect(clampEdgeT(-3)).toBeGreaterThan(0)
    expect(clampEdgeT(9)).toBeLessThan(1)
    expect(clampEdgeT(Number.NaN)).toBe(EFFECT_EDGE_T_DEFAULT)
  })

  it('marks more than one argument independently', () => {
    const both = setBlockPortMutates(setBlockPortMutates(props(), 'in_1', true), 'in_2', true)
    expect(both.outputs.map((port) => port.name)).toEqual(['poses', 'pose'])
    const one = setBlockPortMutates(both, 'in_2', false)
    expect(one.outputs.map((port) => port.name)).toEqual(['poses'])
  })
})

describe('effect port layout', () => {
  it('sits on the top edge, not the right, and takes no body slot', () => {
    const plain = layoutBlock(props({ outputs: [{ id: 'out_1', name: 'item', type: 'Pose', visible: true }] }))
    const marked = layoutBlock(
      setBlockPortMutates(
        props({ outputs: [{ id: 'out_1', name: 'item', type: 'Pose', visible: true }] }),
        'in_1',
        true,
      ),
    )
    const effect = marked.ports.find((placed) => isEffectPort(placed.port))!
    expect(effect.edge).toBe('top')
    expect(effect.y).toBe(0)
    expect(effect.x).toBeCloseTo(marked.width * EFFECT_EDGE_T_DEFAULT)
    // The named output keeps the row it always had — the effect port is not in
    // the lane, so nothing below it moves.
    const before = plain.ports.find((placed) => placed.port.id === 'out_1')!
    const after = marked.ports.find((placed) => placed.port.id === 'out_1')!
    expect(after.y).toBeCloseTo(before.y)
    expect(after.edge).toBe('right')
  })

  it('moves along the top edge when the fraction changes', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    const moved = setEffectPortEdgeT(marked, effectPortId('in_1'), 0.85)
    const placed = layoutBlock(moved).ports.find((port) => isEffectPort(port.port))!
    expect(placed.x).toBeCloseTo(layoutBlock(moved).width * 0.85)
    expect(placed.y).toBe(0)
  })

  it('is on the top edge in every view a Block has chrome for', () => {
    const marked = setBlockPortMutates(props(), 'in_1', true)
    for (const view of ['simple', 'port', 'expanded'] as const) {
      const placed = layoutBlock({ ...marked, view }).ports.find((port) => isEffectPort(port.port))
      expect(placed?.edge, view).toBe('top')
    }
  })
})

describe('two mutated arguments', () => {
  it('do not stack their ports on the same point', () => {
    const both = setBlockPortMutates(setBlockPortMutates(props(), 'in_1', true), 'in_2', true)
    const [first, second] = both.outputs.filter(isEffectPort)
    expect(Math.abs(portEdgeT(first) - portEdgeT(second))).toBeGreaterThan(0.1)
  })

  it('start in the arguments\u2019 own order, topmost leftmost', () => {
    const both = setBlockPortMutates(setBlockPortMutates(props(), 'in_1', true), 'in_2', true)
    const forPoses = both.outputs.find((port) => port.id === effectPortId('in_1'))!
    const forPose = both.outputs.find((port) => port.id === effectPortId('in_2'))!
    expect(portEdgeT(forPoses)).toBeLessThan(portEdgeT(forPose))
  })

  it('still centres a single mutated argument, as it always did', () => {
    const one = setBlockPortMutates(props(), 'in_1', true)
    expect(portEdgeT(one.outputs[0])).toBe(EFFECT_EDGE_T_DEFAULT)
  })

  it('does not shove an existing port aside when a second is marked', () => {
    const first = setBlockPortMutates(props(), 'in_1', true)
    const moved = setEffectPortEdgeT(first, effectPortId('in_1'), 0.88)
    const both = setBlockPortMutates(moved, 'in_2', true)
    expect(portEdgeT(both.outputs.find((p) => p.id === effectPortId('in_1'))!)).toBeCloseTo(0.88)
  })
})
