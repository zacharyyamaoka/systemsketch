import { describe, expect, it, vi } from 'vitest'
import {
  ArrowShapeKindStyle,
  type Editor,
  type StyleProp,
  type TLArrowShape,
  type TLGeoShape,
  type TLUiToolsContextType,
} from 'tldraw'
import {
  applyArrowPreset,
  applyStoredArrowPreset,
  CURVE_ARROW_BEND,
  prepareCreatedShapeForToolbarPreset,
  SYSTEMSKETCH_TOOLBAR_OVERRIDES,
} from './toolbarIntegration'
import { CONNECTION_SHAPE_TYPE, ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import { DEFAULT_TOOLBAR_PREFERENCES } from './toolbarModel'

function arrowShape(): TLArrowShape {
  return {
    id: 'shape:test-arrow',
    typeName: 'shape',
    type: 'arrow',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1',
    parentId: 'page:page',
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      kind: 'arc',
      labelColor: 'black',
      color: 'black',
      fill: 'none',
      dash: 'draw',
      size: 'm',
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      font: 'draw',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      bend: 0,
      richText: { type: 'doc', content: [] },
      labelPosition: 0.5,
      scale: 1,
      elbowMidPoint: 0.5,
    },
  } as unknown as TLArrowShape
}

describe('curved-arrow creation adapter', () => {
  it('adds a bend only to a Curve arrow created by arrow.pointing', () => {
    const original = arrowShape()
    const curved = prepareCreatedShapeForToolbarPreset(original, 'curve', true) as TLArrowShape
    expect(curved).not.toBe(original)
    expect(curved.props.bend).toBe(CURVE_ARROW_BEND)
    expect(curved.props.kind).toBe('arc')
    expect(original.props.bend).toBe(0)
  })

  it('leaves straight, elbow, pasted, and non-arrow records untouched', () => {
    const original = arrowShape()
    expect(prepareCreatedShapeForToolbarPreset(original, 'straight', true)).toBe(original)
    expect(prepareCreatedShapeForToolbarPreset(original, 'elbow', true)).toBe(original)
    expect(prepareCreatedShapeForToolbarPreset(original, 'curve', false)).toBe(original)

    const geo = { ...original, type: 'geo' } as unknown as TLGeoShape
    expect(prepareCreatedShapeForToolbarPreset(geo, 'curve', true)).toBe(geo)
  })
})

describe('Stable Block toolbar seam', () => {
  it('claims B for Block and releases it from Draw', () => {
    const setCurrentTool = vi.fn()
    const editor = { setCurrentTool } as unknown as Editor
    const tools = {
      draw: {
        id: 'draw',
        label: 'Draw',
        icon: 'tool-pencil',
        kbd: 'd,b,x',
        onSelect: vi.fn(),
      },
    } as TLUiToolsContextType

    const overridden = SYSTEMSKETCH_TOOLBAR_OVERRIDES.tools?.(editor, tools, {} as never)

    expect(overridden?.draw.kbd).toBe('d,x')
    expect(overridden?.block.kbd).toBe('b')
    overridden?.block.onSelect('toolbar')
    expect(setCurrentTool).toHaveBeenCalledWith('block')
  })
})

/**
 * An editor that records only what a preset writes to the next-shape channel.
 *
 * `shapeUtils` is part of the fake because it is what decides whether a
 * composition has cables: the stock-tldraw lab mounts tldraw without the
 * Connection shape, and a style prop it does not declare cannot be written.
 */
function recordingEditor({ connections = true } = {}) {
  const written = new Map<string, string>()
  const editor = {
    shapeUtils: connections ? { [CONNECTION_SHAPE_TYPE]: {} } : {},
    setStyleForNextShapes(style: StyleProp<string>, value: string) {
      written.set(style.id, value)
      return editor
    },
  } as unknown as Editor
  return { editor, written }
}

describe('one preset, two connectors', () => {
  it('writes the arrow kind and the edge routing from a single choice', () => {
    for (const [preset, kind, routing] of [
      ['elbow', 'elbow', 'elbow'],
      ['curve', 'arc', 'curved'],
      ['straight', 'arc', 'straight'],
    ] as const) {
      const { editor, written } = recordingEditor()
      applyArrowPreset(editor, preset)
      expect(written.get(ArrowShapeKindStyle.id)).toBe(kind)
      expect(written.get(ConnectionRoutingStyle.id)).toBe(routing)
    }
  })

  it('writes only the arrow half into a composition that has no cables', () => {
    // Regression: the stock-tldraw lab re-applies the stored preset on mount.
    // Writing `connectionRouting` there put an unknown property into
    // `instance.stylesForNextShape`, which tldraw validates — the lab came up
    // as a crash screen with no canvas at all.
    const { editor, written } = recordingEditor({ connections: false })
    applyStoredArrowPreset(editor)
    expect(written.get(ArrowShapeKindStyle.id)).toBe('elbow')
    expect(written.has(ConnectionRoutingStyle.id)).toBe(false)
  })

  it('seeds both styles from the remembered preset when an editor mounts', () => {
    const { editor, written } = recordingEditor()
    applyStoredArrowPreset(editor)
    expect(DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset).toBe('elbow')
    expect(written.get(ArrowShapeKindStyle.id)).toBe('elbow')
    expect(written.get(ConnectionRoutingStyle.id)).toBe('elbow')
  })
})
