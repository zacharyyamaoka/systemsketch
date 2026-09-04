import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from '../blocks/blockModel'
import type { ConnectionBinding } from '../blocks/connections'
import { CONNECTION_SHAPE_TYPE } from '../blocks/connections'
import {
  getPropagationFocusSnapshot,
  livePropagationEdges,
  normalizePropagationSteps,
  propagationSeedFromSelection,
  startPropagationFocus,
} from './propagationFocus'
import { walkPropagationGraph } from './propagationGraph'

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
function graphEditor(shapes: BlockShape[], bindings: ConnectionBinding[], edge = 'edge', temporal = 'data') {
  const connection = {
    id: createShapeId(edge), typeName: 'shape', type: CONNECTION_SHAPE_TYPE, x: 0, y: 0, rotation: 0,
    index: 'a2', parentId: 'page:page', isLocked: false, opacity: 1, meta: {},
    props: { temporal },
  }
  const all = new Map([...shapes, connection].map((shape) => [shape.id, shape]))
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
  it('normalizes every editable numeric state to a finite integer in [0, 5]', () => {
    expect([normalizePropagationSteps(Number('')), normalizePropagationSteps(1.8), normalizePropagationSteps(Number.NaN), normalizePropagationSteps(-4), normalizePropagationSteps(99)])
      .toEqual([0, 1, 0, 0, 5])
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
