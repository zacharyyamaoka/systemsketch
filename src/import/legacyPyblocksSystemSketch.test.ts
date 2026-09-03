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

describe('legacy PyBlocks SystemSketch import', () => {
  it('recognizes only the retired nodes/edges envelope', () => {
    expect(parseLegacyPyblocksSystemSketch(JSON.stringify(legacy))).toEqual(legacy)
    expect(parseLegacyPyblocksSystemSketch('{"records":[]}')).toBeNull()
    expect(parseLegacyPyblocksSystemSketch('not json')).toBeNull()
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
