import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from '../blocks/blockModel'
import type { ConnectionBinding } from '../blocks/connections'
import { CONNECTION_SHAPE_TYPE } from '../blocks/connections'
import {
  getPropagationFocusSnapshot,
  getPropagationFocusStepLimits,
  livePropagationEdges,
  normalizePropagationSteps,
  propagationSeedFromSelection,
  startPropagationFocus,
} from './propagationFocus'
import { propagationReachableDepth, walkPropagationGraph } from './propagationGraph'

const chain = [
  { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
  { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
  { edgeId: 'cd', sourceId: 'c', sinkId: 'd' },
]

function ids(value: ReadonlySet<string>) {
  return [...value].sort()
}

describe('walkPropagationGraph', () => {
  it('keeps upstream and downstream bounds independent', () => {
    const result = walkPropagationGraph({
      edges: chain,
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 1,
      downstreamSteps: 2,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(result.edges)).toEqual(['ab', 'bc', 'cd'])
  })

  it('includes every fan-in and fan-out route at the same bound', () => {
    const result = walkPropagationGraph({
      edges: [
        { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
        { edgeId: 'cb', sourceId: 'c', sinkId: 'b' },
        { edgeId: 'bd', sourceId: 'b', sinkId: 'd' },
        { edgeId: 'be', sourceId: 'b', sinkId: 'e' },
      ],
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 1,
      downstreamSteps: 1,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(result.edges)).toEqual(['ab', 'bd', 'be', 'cb'])
  })

  it('retains the closing cable but terminates a cycle', () => {
    const result = walkPropagationGraph({
      edges: [
        { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
        { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
        { edgeId: 'ca', sourceId: 'c', sinkId: 'a' },
      ],
      upstreamStarts: ['a'],
      downstreamStarts: ['a'],
      upstreamSteps: 5,
      downstreamSteps: 5,
      initialNodes: ['a'],
    })
    expect(ids(result.nodes)).toEqual(['a', 'b', 'c'])
    expect(ids(result.edges)).toEqual(['ab', 'bc', 'ca'])
  })

  it('does not traverse when either direction is set to zero', () => {
    const result = walkPropagationGraph({
      edges: chain,
      upstreamStarts: ['b'],
      downstreamStarts: ['b'],
      upstreamSteps: 0,
      downstreamSteps: 0,
      initialNodes: ['b'],
    })
    expect(ids(result.nodes)).toEqual(['b'])
    expect(ids(result.edges)).toEqual([])
  })

  it('measures each slider cap from the furthest useful graph layer, not a fixed ceiling', () => {
    const longChain = Array.from({ length: 8 }, (_, index) => ({
      edgeId: `e${index}`,
      sourceId: `n${index}`,
      sinkId: `n${index + 1}`,
    }))
    expect(propagationReachableDepth(longChain, ['n4'], 'upstream')).toBe(4)
    expect(propagationReachableDepth(longChain, ['n4'], 'downstream')).toBe(4)
    expect(propagationReachableDepth([
      { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
      { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
      { edgeId: 'ca', sourceId: 'c', sinkId: 'a' },
    ], ['a'], 'downstream')).toBe(3)
  })

  it('does not offer a selected cable an extra step just to revisit its initial endpoints', () => {
    const edges = [
      { edgeId: 'selected', sourceId: 'source', sinkId: 'join' },
      { edgeId: 'closing', sourceId: 'join', sinkId: 'source' },
    ]
    expect(propagationReachableDepth(
      edges,
      ['source'],
      'upstream',
      ['source', 'join'],
      ['selected'],
    )).toBe(1)
    const atCap = walkPropagationGraph({
      edges,
      upstreamStarts: ['source'],
      downstreamStarts: ['join'],
      upstreamSteps: 1,
      downstreamSteps: 0,
      initialNodes: ['source', 'join'],
      initialEdges: ['selected'],
    })
    expect(ids(atCap.edges)).toEqual(['closing', 'selected'])
  })

  it('removes downstream feedback steps already lit by the chosen upstream range', () => {
    const feedback = [
      { edgeId: 'ab', sourceId: 'a', sinkId: 'b' },
      { edgeId: 'bc', sourceId: 'b', sinkId: 'c' },
      { edgeId: 'ca', sourceId: 'c', sinkId: 'a' },
    ]
    const afterUpstream = walkPropagationGraph({
      edges: feedback,
      upstreamStarts: ['a'],
      downstreamStarts: ['a'],
      upstreamSteps: 1,
      downstreamSteps: 0,
      initialNodes: ['a'],
    })
    // c and ca are already bright. Downstream a → b → c has two useful
    // evidence additions, not a third inert click back through ca.
    expect(propagationReachableDepth(
      feedback,
      ['a'],
      'downstream',
      [...afterUpstream.nodes],
      [...afterUpstream.edges],
    )).toBe(2)
  })
})

function block(id: string, parentId = 'page:page', ports: { inputs?: string[]; outputs?: string[] } = {}): BlockShape {
  return {
    id: createShapeId(id), typeName: 'shape', type: 'block', x: 0, y: 0, rotation: 0,
    index: 'a1' as BlockShape['index'], parentId: parentId as BlockShape['parentId'], isLocked: false,
    opacity: 1, meta: {}, props: {
      ...setBlockViewProps(getDefaultBlockProps(), 'port'),
      inputs: (ports.inputs ?? []).map((id) => ({ id, name: id, type: '', visible: true })),
      outputs: (ports.outputs ?? []).map((id) => ({ id, name: id, type: '', visible: true })),
    },
  }
}

function binding(edge: string, terminal: 'start' | 'end', host: string, portId: string, face: 'outer' | 'inner' = 'outer'): ConnectionBinding {
  return {
    id: `binding:${edge}:${terminal}:${host}` as ConnectionBinding['id'], typeName: 'binding', type: 'connection',
    fromId: createShapeId(edge), toId: createShapeId(host), meta: {}, props: { terminal, portId, face },
  }
}

/** Minimal live-editor slice: enough to exercise the canonical connection validator. */
function graphEditor(
  shapes: BlockShape[],
  bindings: ConnectionBinding[],
  edge = 'edge',
  temporal = 'data',
  additionalEdges: string[] = [],
) {
  const connections = [edge, ...additionalEdges].map((id, index) => ({
    id: createShapeId(id), typeName: 'shape' as const, type: CONNECTION_SHAPE_TYPE, x: 0, y: 0, rotation: 0,
    index: `a${index + 2}`, parentId: 'page:page', isLocked: false, opacity: 1, meta: {},
    props: { temporal },
  }))
  const all = new Map([...shapes, ...connections].map((shape) => [shape.id, shape]))
  return {
    getCurrentPageShapes: () => [...all.values()],
    getCurrentPageShapeIds: () => new Set(all.keys()),
    getCurrentPageId: () => 'page:page',
    getShape: (id: string) => all.get(id as never),
    getBindingsFromShape: (id: string) => bindings.filter((candidate) => candidate.fromId === id),
    getShapeParent: (id: string) => {
      const shape = all.get(id as never)
      return shape ? all.get(shape.parentId as never) : undefined
    },
    getAncestorPageId: () => 'page:page',
  } as unknown as Editor
}

describe('propagation graph admission', () => {
  it('normalizes slider state to a finite non-negative integer; each graph supplies the maximum', () => {
    expect([normalizePropagationSteps(Number('')), normalizePropagationSteps(1.8), normalizePropagationSteps(Number.NaN), normalizePropagationSteps(-4), normalizePropagationSteps(99)])
      .toEqual([0, 1, 0, 0, 99])
  })

  it('admits canonical outer, effect, delayed, and async cables', () => {
    const source = block('source', 'page:page', { outputs: ['out', 'effect:mut'] })
    const sink = block('sink', 'page:page', { inputs: ['in'] })
    for (const [name, port, temporal] of [
      ['outer', 'out', 'data'], ['effect', 'effect:mut', 'data'], ['delayed', 'out', 'delayed'], ['async', 'out', 'async'],
    ] as const) {
      const editor = graphEditor([source, sink], [binding(name, 'start', 'source', port), binding(name, 'end', 'sink', 'in')], name, temporal)
      expect(livePropagationEdges(editor)).toEqual([{ edgeId: createShapeId(name), sourceId: createShapeId('source'), sinkId: createShapeId('sink') }])
    }
  })

  it('keeps zero only for a direction with no reachable neighbour', () => {
    const source = block('source', 'page:page', { outputs: ['out'] })
    const sink = block('sink', 'page:page', { inputs: ['in'] })
    const editor = graphEditor([source, sink], [binding('edge', 'start', 'source', 'out'), binding('edge', 'end', 'sink', 'in')])
    expect(getPropagationFocusStepLimits(editor, source.id)).toEqual({ upstream: 0, downstream: 1 })
    expect(startPropagationFocus(editor, source.id, 0, 0)).toBe(true)
    expect(getPropagationFocusSnapshot(editor)).toMatchObject({ upstreamSteps: 0, downstreamSteps: 1 })
  })

  it('caps a selected reverse-cycle cable at useful evidence, including the shared upstream state', () => {
    const source = block('source', 'page:page', { inputs: ['in'], outputs: ['out'] })
    const join = block('join', 'page:page', { inputs: ['in'], outputs: ['out'] })
    const editor = graphEditor(
      [source, join],
      [
        binding('selected', 'start', 'source', 'out'), binding('selected', 'end', 'join', 'in'),
        binding('closing', 'start', 'join', 'out'), binding('closing', 'end', 'source', 'in'),
      ],
      'selected',
      'data',
      ['closing'],
    )
    expect(getPropagationFocusStepLimits(editor, createShapeId('selected'))).toEqual({ upstream: 1, downstream: 0 })
  })

  it('admits a legal inner/outer tunnel but excludes scope and polarity violations', () => {
    const container = block('container', 'page:page', { inputs: ['in'], outputs: ['out'] })
    const child = block('child', 'shape:container', { inputs: ['in'], outputs: ['out'] })
    const tunnel = graphEditor([container, child], [binding('tunnel', 'start', 'container', 'in', 'inner'), binding('tunnel', 'end', 'child', 'in', 'outer')], 'tunnel')
    expect(livePropagationEdges(tunnel)).toHaveLength(1)

    const otherContainer = block('other-container', 'page:page', { inputs: ['in'], outputs: ['out'] })
    const otherChild = block('other-child', 'shape:other-container', { inputs: ['in'] })
    const crossScope = graphEditor([child, otherContainer, otherChild], [binding('scope', 'start', 'child', 'out'), binding('scope', 'end', 'other-child', 'in')], 'scope')
    const samePolarity = graphEditor([container, child], [binding('polarity', 'start', 'container', 'out'), binding('polarity', 'end', 'child', 'out', 'inner')], 'polarity')
    expect(livePropagationEdges(crossScope)).toEqual([])
    expect(livePropagationEdges(samePolarity)).toEqual([])
  })

  it('excludes duplicate and half-bound cables instead of selecting an arbitrary terminal', () => {
    const source = block('source', 'page:page', { outputs: ['out'] })
    const sink = block('sink', 'page:page', { inputs: ['in'] })
    const duplicate = graphEditor([source, sink], [binding('duplicate', 'start', 'source', 'out'), binding('duplicate', 'start', 'source', 'out'), binding('duplicate', 'end', 'sink', 'in')], 'duplicate')
    const halfBound = graphEditor([source], [binding('half', 'start', 'source', 'out')], 'half')
    expect(livePropagationEdges(duplicate)).toEqual([])
    expect(livePropagationEdges(halfBound)).toEqual([])
  })

  it('never offers or activates a malformed selected cable as a singleton lens', () => {
    const source = block('source', 'page:page', { outputs: ['out'] })
    const sink = block('sink', 'page:page', { inputs: ['in'], outputs: ['out'] })
    const left = block('left', 'page:page', { outputs: ['out'] })
    const right = block('right', 'page:page', { inputs: ['in'] })
    const leftChild = block('left-child', 'shape:left', { outputs: ['out'] })
    const rightChild = block('right-child', 'shape:right', { inputs: ['in'] })
    const cases = [
      graphEditor([source], [binding('half', 'start', 'source', 'out')], 'half'),
      graphEditor([source, sink], [binding('duplicate', 'start', 'source', 'out'), binding('duplicate', 'start', 'source', 'out'), binding('duplicate', 'end', 'sink', 'in')], 'duplicate'),
      graphEditor([source, sink], [binding('polarity', 'start', 'source', 'out'), binding('polarity', 'end', 'sink', 'out')], 'polarity'),
      graphEditor([source, sink], [binding('face', 'start', 'source', 'out', 'inner'), binding('face', 'end', 'sink', 'in')], 'face'),
      graphEditor([left, right, leftChild, rightChild], [binding('scope', 'start', 'left-child', 'out'), binding('scope', 'end', 'right-child', 'in')], 'scope'),
    ]
    for (const [index, editor] of cases.entries()) {
      const edgeId = ['half', 'duplicate', 'polarity', 'face', 'scope'][index]
      Object.assign(editor, {
        getSelectedShapes: () => [editor.getShape(createShapeId(edgeId))],
        getSelectedShapeIds: () => [createShapeId(edgeId)],
      })
      expect(propagationSeedFromSelection(editor)).toBeNull()
      expect(startPropagationFocus(editor)).toBe(false)
      expect(getPropagationFocusSnapshot(editor).seedId).toBeNull()
    }
  })
})
