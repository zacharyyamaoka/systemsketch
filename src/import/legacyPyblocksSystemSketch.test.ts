import { describe, expect, it } from 'vitest'
import {
  LEGACY_PYBLOCKS_META_KEY,
  parseLegacyPyblocksSystemSketch,
  planLegacyPyblocksSystemSketch,
} from './legacyPyblocksSystemSketch'

const legacy = {
  version: 1,
  viewport: { x: 12, y: -8, zoom: 0.75 },
  metadata: { 'pyblocks.golden': { version: 1, role: 'design-intent' } },
  nodes: [{
    id: 'function:run/boundary',
    position: { x: 20, y: 20 },
    style: { width: 1000, height: 600 },
    data: { extension: { pyblocksBlock: {
      version: 1,
      content: {
        title: 'run()',
        type: 'boundary',
        description: 'Selected function body',
        inputs: [{ id: 'raw', name: 'raw', type: 'bytes', flowDirection: 'output' }],
        outputs: [{ id: 'result', name: 'result', type: 'bytes', flowDirection: 'input' }],
      },
      presentation: { detail: 'expanded', expandedWidth: 1000, expandedHeight: 600 },
    } } },
  }, {
    id: 'call:decode',
    position: { x: 180, y: 180 },
    style: { width: 240, height: 140 },
    data: { extension: { pyblocksBlock: {
      version: 1,
      content: {
        title: 'decode()',
        type: 'call',
        inputs: [{ id: 'raw', name: 'raw', type: 'bytes' }],
        outputs: [{ id: 'value', name: 'value', type: 'str' }],
      },
      presentation: { detail: 'port', portWidth: 240, portHeight: 140, portLayout: 'inline' },
    } } },
  }],
  edges: [{
    id: 'flow:raw-decode',
    source: 'function:run/boundary',
    target: 'call:decode',
    sourceHandle: 'source:port:raw',
    targetHandle: 'target:port:raw',
    data: { style: { routing: 'elbow' }, extension: { pyblocksBlockView: { kind: 'data' } } },
  }],
}

/** A series board: two selected functions, each with its own call, one lane each. */
function laneNode(view: string, id: string, boundary: boolean, y: number) {
  return {
    id: `${view}/${id}`,
    position: { x: 20, y },
    style: { width: boundary ? 1000 : 240, height: boundary ? 600 : 140 },
    data: { extension: {
      pyblocksBlock: {
        version: 1,
        content: {
          title: boundary ? `${view}()` : 'decode()',
          type: boundary ? 'boundary' : 'call',
          ...(boundary
            ? {
              description: 'Selected function body',
              inputs: [{ id: `${view}/raw`, name: 'raw', type: 'bytes', flowDirection: 'output' }],
              outputs: [{ id: `${view}/result`, name: 'result', type: 'bytes', flowDirection: 'input' }],
            }
            : {
              inputs: [{ id: `${view}/raw`, name: 'raw', type: 'bytes' }],
              outputs: [{ id: `${view}/value`, name: 'value', type: 'str' }],
            }),
        },
        presentation: boundary
          ? { detail: 'expanded', expandedWidth: 1000, expandedHeight: 600 }
          : { detail: 'port', portWidth: 240, portHeight: 140 },
      },
      pyblocksBlockView: { version: 1, metadata: { 'pyblocks.view': { id: view } } },
    } },
  }
}

const seriesBoard = {
  version: 1,
  viewport: { x: 0, y: 0, zoom: 0.5 },
  nodes: [
    laneNode('01_first', 'boundary', true, 20),
    laneNode('01_first', 'call:decode', false, 180),
    laneNode('02_second', 'boundary', true, 900),
    laneNode('02_second', 'call:decode', false, 1060),
  ],
  edges: ['01_first', '02_second'].map((view) => ({
    id: `${view}/flow:raw-decode`,
    source: `${view}/boundary`,
    target: `${view}/call:decode`,
    sourceHandle: `source:port:${view}/raw`,
    targetHandle: `target:port:${view}/raw`,
    data: {
      style: { routing: 'elbow' },
      extension: { pyblocksBlockView: { kind: 'data', metadata: { 'pyblocks.view': { id: view } } } },
    },
  })),
}

describe('legacy PyBlocks SystemSketch import', () => {
  it('recognizes only the retired nodes/edges envelope', () => {
    expect(parseLegacyPyblocksSystemSketch(JSON.stringify(legacy))).toEqual(legacy)
    expect(parseLegacyPyblocksSystemSketch('{"records":[]}')).toBeNull()
    expect(parseLegacyPyblocksSystemSketch('not json')).toBeNull()
  })

  it('parents each lane of a series board to its own selected function', () => {
    // PyBlocks stores one board per series, one lane per selected view. Every
    // lane has its own boundary, and picking the first for all of them nested
    // lane two inside lane one and left its boundary connections unbound.
    const plan = planLegacyPyblocksSystemSketch(seriesBoard)
    const byLegacyId = new Map(plan.blocks.map((block) => [block.legacyId, block]))
    for (const view of ['01_first', '02_second']) {
      const boundary = byLegacyId.get(`${view}/boundary`)
      const call = byLegacyId.get(`${view}/call:decode`)
      expect(boundary?.parentShapeId).toBeNull()
      expect(call?.parentShapeId).toBe(boundary?.shapeId)
    }
    expect(plan.connections).toHaveLength(2)
    for (const connection of plan.connections) {
      const view = connection.legacyId.split('/')[0]
      expect(connection.sourceShapeId).toBe(byLegacyId.get(`${view}/boundary`)?.shapeId)
      expect(connection.targetShapeId).toBe(byLegacyId.get(`${view}/call:decode`)?.shapeId)
      // The call is a child of its own boundary, so the boundary port uses its
      // inner face — the property that broke when the lanes were confused.
      expect(connection.sourceFace).toBe('inner')
      expect(connection.targetFace).toBe('outer')
    }
  })

  it('maps semantic Blocks, containment, ports, and boundary faces deterministically', () => {
    const plan = planLegacyPyblocksSystemSketch(legacy)
    const boundary = plan.blocks.find((block) => block.legacyId === 'function:run/boundary')!
    const child = plan.blocks.find((block) => block.legacyId === 'call:decode')!
    const connection = plan.connections[0]

    expect(boundary.props).toMatchObject({
      title: 'run()', view: 'expanded', w: 1000, h: 600, portLayout: 'offset',
    })
    expect(child.props).toMatchObject({
      title: 'decode()', view: 'port', w: 240, h: 140, portLayout: 'inline',
    })
    expect(child.parentShapeId).toBe(boundary.shapeId)
    expect({ x: child.x, y: child.y }).toEqual({ x: 160, y: 160 })
    expect(connection).toMatchObject({
      sourceShapeId: boundary.shapeId,
      targetShapeId: child.shapeId,
      sourcePortId: 'raw',
      targetPortId: 'raw',
      sourceFace: 'inner',
      targetFace: 'outer',
      routing: 'elbow',
    })
    expect(boundary.meta[LEGACY_PYBLOCKS_META_KEY]).toMatchObject({
      version: 1, kind: 'node', index: 0,
    })
    expect(plan.documentMeta[LEGACY_PYBLOCKS_META_KEY]).toMatchObject({
      version: 1, kind: 'document', metadata: legacy.metadata,
    })
    expect(plan.viewport).toEqual({ x: 12, y: -8, zoom: 0.75 })
  })
})
