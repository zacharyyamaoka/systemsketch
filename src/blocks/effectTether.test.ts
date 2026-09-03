import { describe, expect, it } from 'vitest'

import { effectPortId, setBlockPortMutates, setEffectPortEdgeT } from './blockModel'
import type { BlockPort, BlockShapeProps } from './blockModel'
import { TETHER_STEP_PX, effectTethers, tetherPath } from './effectTether'
import { layoutBlock } from './layoutBlock'

const input = (id: string, name = id): BlockPort => ({
  id, name, type: 'Cache', visible: true,
})

function props(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
  return {
    w: 340, h: 220, title: 'reconcile()', description: '', blockType: 'call',
    view: 'port', showDescription: false, portLayout: 'rows',
    views: {
      simple: { w: 320, h: 206 }, port: { w: 340, h: 220 },
      expanded: { w: 560, h: 380 }, value: { w: 96, h: 56 },
    },
    inputs: [input('in_1', 'primary'), input('in_2', 'backup'), input('in_3', 'preview')],
    outputs: [],
    ...overrides,
  } as BlockShapeProps
}

const marked = (...ids: string[]) =>
  ids.reduce((acc, id) => setBlockPortMutates(acc, id, true), props())

/** Every point of an SVG polyline path, in order. */
const points = (d: string) =>
  [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number)
    .reduce<Array<[number, number]>>((acc, n, i, all) =>
      (i % 2 === 0 ? [...acc, [n, all[i + 1]] as [number, number]] : acc), [])

describe('effect tether', () => {
  it('draws one per mutated argument, naming both ends', () => {
    const tethers = effectTethers(layoutBlock(marked('in_1', 'in_3')))
    expect(tethers.map((t) => t.inputId)).toEqual(['in_1', 'in_3'])
    expect(tethers.map((t) => t.portId)).toEqual([effectPortId('in_1'), effectPortId('in_3')])
  })

  it('runs from the hook to its own port, and nowhere else', () => {
    const layout = layoutBlock(marked('in_2'))
    const [tether] = effectTethers(layout)
    const hook = layout.ports.find((p) => p.port.id === 'in_2')!
    const port = layout.ports.find((p) => p.port.id === effectPortId('in_2'))!
    const path = points(tether.d)
    expect(path[0]).toEqual([hook.x, hook.y])
    expect(path[path.length - 1]).toEqual([port.x, port.y])
  })

  it('is a right-angle route: every segment is horizontal or vertical', () => {
    const [tether] = effectTethers(layoutBlock(marked('in_1')))
    const path = points(tether.d)
    for (let i = 0; i < path.length - 1; i += 1) {
      const [x1, y1] = path[i]
      const [x2, y2] = path[i + 1]
      expect(x1 === x2 || y1 === y2, `segment ${i} is diagonal`).toBe(true)
    }
  })

  it('drops into the gap under the row rather than along it, so it clears the label', () => {
    const layout = layoutBlock(marked('in_1'))
    const hook = layout.ports.find((p) => p.port.id === 'in_1')!
    const [tether] = effectTethers(layout)
    const path = points(tether.d)
    // The long horizontal must not sit on the row's own baseline.
    const longRun = path.slice(1, -1).find(([, y]) => y !== hook.y)
    expect(longRun).toBeDefined()
    expect(longRun![1]).toBeGreaterThan(hook.y)
    // and it steps clear of the dot before turning
    expect(path[1][0]).toBeCloseTo(hook.x + TETHER_STEP_PX)
  })

  it('shows in Port view only — never expanded, never simple, never a value pill', () => {
    const base = marked('in_1')
    expect(effectTethers(layoutBlock(base))).toHaveLength(1)
    for (const view of ['expanded', 'simple', 'value'] as const) {
      expect(effectTethers(layoutBlock({ ...base, view })), view).toEqual([])
    }
  })

  it('is empty when nothing is marked', () => {
    expect(effectTethers(layoutBlock(props()))).toEqual([])
  })

  it('follows the port when a cable moves it, and may cross another', () => {
    // The effect port's position is not ours to choose: it goes where its cable
    // leaves the block. Drag one past another and the tethers cross — which is
    // the honest picture, so it is drawn rather than prevented.
    const both = marked('in_1', 'in_3')
    const swapped = setEffectPortEdgeT(
      setEffectPortEdgeT(both, effectPortId('in_1'), 0.9),
      effectPortId('in_3'), 0.1,
    )
    const [first, second] = effectTethers(layoutBlock(swapped))
    const endOf = (d: string) => points(d)[points(d).length - 1][0]
    // in_1 is the topmost row but now ends rightmost: the routes must swap over.
    expect(endOf(first.d)).toBeGreaterThan(endOf(second.d))
  })

  it('falls back to the row itself when there is no gap to drop into', () => {
    const path = points(tetherPath(0, 40, 120, 0, 0))
    expect(path).toEqual([[0, 40], [120, 40], [120, 0]])
  })

  it('skips an effect port whose input has gone, rather than drawing to nowhere', () => {
    const orphaned = marked('in_1')
    const layout = layoutBlock({
      ...orphaned,
      inputs: orphaned.inputs.filter((port) => port.id !== 'in_1'),
    })
    expect(effectTethers(layout)).toEqual([])
  })
})
