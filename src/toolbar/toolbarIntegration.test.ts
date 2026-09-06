import { describe, expect, it, vi } from 'vitest'
import {
  ArrowShapeKindStyle,
  type Editor,
  type StyleProp,
  type TLArrowShape,
  type TLGeoShape,
  type TLShape,
  type TLShapeId,
  type TLUiActionsContextType,
  type TLUiOverrideHelpers,
  type TLUiToolsContextType,
} from 'tldraw'
import {
  applyArrowPreset,
  applyArrowPresetToSelection,
  applyStoredArrowPreset,
  arrowPresetForShape,
  CURVE_ARROW_BEND,
  prepareCreatedShapeForToolbarPreset,
  SYSTEMSKETCH_TOOLBAR_OVERRIDES,
} from './toolbarIntegration'
import { BEHAVIOR_TREE_SHAPE_TYPE } from '../behaviorTree/behaviorTreeModel'
import { CONNECTION_SHAPE_TYPE, ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import { DEFAULT_TOOLBAR_PREFERENCES, updateToolbarPreferences } from './toolbarModel'

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
	it('reads straight, curved, and elbow from stock kind plus bend', () => {
		const straight = arrowShape()
		expect(arrowPresetForShape(straight)).toBe('straight')
		expect(arrowPresetForShape({
			...straight,
			props: { ...straight.props, bend: -24 },
		})).toBe('curve')
		expect(arrowPresetForShape({
			...straight,
			props: { ...straight.props, kind: 'elbow' },
		})).toBe('elbow')
	})

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
	it('translates a straight appearance choice to stock arc plus zero bend', () => {
		const straight = arrowShape()
		const curved = { ...straight, props: { ...straight.props, bend: 18 } }
		const updated: unknown[] = []
		const nextStyles = new Map<string, string>()
		const editor = {
			shapeUtils: { [CONNECTION_SHAPE_TYPE]: {} },
			getSelectedShapes: () => [curved],
			updateShapes: (patches: unknown[]) => updated.push(...patches),
			setStyleForNextShapes: (style: StyleProp<string>, value: string) => {
				nextStyles.set(style.id, value)
			},
		} as unknown as Editor

		applyArrowPresetToSelection(editor, 'straight')
		expect(updated).toEqual([{
			id: straight.id,
			type: 'arrow',
			props: { kind: 'arc', bend: 0 },
		}])
		expect(nextStyles.get(ArrowShapeKindStyle.id)).toBe('arc')
		expect(nextStyles.get(ConnectionRoutingStyle.id)).toBe('straight')
		updateToolbarPreferences({
			lastArrowPreset: DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset,
			lastShapeTool: DEFAULT_TOOLBAR_PREFERENCES.lastShapeTool,
		})
	})

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

/**
 * Stock tldraw's export skips a lone selected frame-like shape's own `toSvg`
 * (`getSvgJsx.tsx`'s `singleFrameShapeId`), which for a Behavior Tree region
 * throws away the wires, Start marker and header title — the actual diagram,
 * not decorative chrome. `SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions` widens the
 * exported ids before that skip can trigger; see the `WHY:` comment above
 * `widenSingleRegionExportIds`. `tests/behavior_tree_export_smoke.mjs` proves
 * this end to end through the real context menu; this is the fast unit-level
 * guard on the id-widening logic itself.
 */
describe('Behavior Tree region export widening', () => {
  function fakeEditor(opts: {
    selectedIds: TLShapeId[]
    pageIds?: TLShapeId[]
    shapesById: Record<string, TLShape>
    descendantsById?: Record<string, TLShapeId[]>
  }) {
    const pageIds = opts.pageIds ?? opts.selectedIds
    return {
      getSelectedShapeIds: () => opts.selectedIds,
      getSelectedShapes: () => opts.selectedIds.map((id) => opts.shapesById[id]).filter(Boolean),
      getCurrentPageShapeIds: () => new Set(pageIds),
      getShape: (id: TLShapeId) => opts.shapesById[id],
      getShapeAndDescendantIds: (ids: TLShapeId[]) =>
        new Set(ids.flatMap((id) => [id, ...(opts.descendantsById?.[id] ?? [])])),
      getDocumentSettings: () => ({ name: '' }),
    } as unknown as Editor
  }

  function fakeActions(): TLUiActionsContextType {
    return {
      'export-as-svg': { id: 'export-as-svg', label: 'Export as SVG', onSelect: vi.fn() },
      'export-as-png': { id: 'export-as-png', label: 'Export as PNG', onSelect: vi.fn() },
    } as unknown as TLUiActionsContextType
  }

  it('widens a lone selected region to itself plus its descendants', () => {
    const region = { id: 'shape:region', type: BEHAVIOR_TREE_SHAPE_TYPE } as unknown as TLShape
    const exportAs = vi.fn()
    const editor = fakeEditor({
      selectedIds: ['shape:region' as TLShapeId],
      shapesById: { 'shape:region': region },
      descendantsById: { 'shape:region': ['shape:child-a' as TLShapeId, 'shape:child-b' as TLShapeId] },
    })
    const helpers = { exportAs, msg: () => 'Untitled' } as unknown as TLUiOverrideHelpers

    const overridden = SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions?.(editor, fakeActions(), helpers)
    overridden?.['export-as-svg'].onSelect('context-menu')
    expect(exportAs).toHaveBeenCalledWith(
      ['shape:region', 'shape:child-a', 'shape:child-b'],
      { format: 'svg', name: undefined },
    )

    overridden?.['export-as-png'].onSelect('context-menu')
    expect(exportAs).toHaveBeenCalledWith(
      ['shape:region', 'shape:child-a', 'shape:child-b'],
      { format: 'png', name: undefined },
    )
  })

  it('leaves ids alone when more than one shape is selected', () => {
    const region = { id: 'shape:region', type: BEHAVIOR_TREE_SHAPE_TYPE } as unknown as TLShape
    const other = { id: 'shape:other', type: 'geo' } as unknown as TLShape
    const exportAs = vi.fn()
    const editor = fakeEditor({
      selectedIds: ['shape:region' as TLShapeId, 'shape:other' as TLShapeId],
      shapesById: { 'shape:region': region, 'shape:other': other },
      descendantsById: { 'shape:region': ['shape:child-a' as TLShapeId] },
    })
    const helpers = { exportAs, msg: () => 'Untitled' } as unknown as TLUiOverrideHelpers

    const overridden = SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions?.(editor, fakeActions(), helpers)
    overridden?.['export-as-svg'].onSelect('context-menu')
    expect(exportAs).toHaveBeenCalledWith(['shape:region', 'shape:other'], { format: 'svg', name: undefined })
  })

  it('leaves ids alone when the lone selected shape is not a Behavior Tree region', () => {
    const geo = { id: 'shape:geo', type: 'geo' } as unknown as TLShape
    const exportAs = vi.fn()
    const editor = fakeEditor({
      selectedIds: ['shape:geo' as TLShapeId],
      shapesById: { 'shape:geo': geo },
    })
    const helpers = { exportAs, msg: () => 'Untitled' } as unknown as TLUiOverrideHelpers

    const overridden = SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions?.(editor, fakeActions(), helpers)
    overridden?.['export-as-svg'].onSelect('context-menu')
    expect(exportAs).toHaveBeenCalledWith(['shape:geo'], { format: 'svg', name: undefined })
  })

  it('falls back to every page shape when nothing is selected, same as stock', () => {
    const region = { id: 'shape:region', type: BEHAVIOR_TREE_SHAPE_TYPE } as unknown as TLShape
    const exportAs = vi.fn()
    const editor = fakeEditor({
      selectedIds: [],
      pageIds: ['shape:region' as TLShapeId],
      shapesById: { 'shape:region': region },
    })
    const helpers = { exportAs, msg: () => 'Untitled' } as unknown as TLUiOverrideHelpers

    const overridden = SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions?.(editor, fakeActions(), helpers)
    overridden?.['export-as-svg'].onSelect('context-menu')
    // Nothing selected + a single page shape is exactly the ids.length === 1
    // case stock tldraw also hits; widening it too is the correct behavior,
    // not just tolerated — an empty-selection export of a lone region should
    // include its own paint as well.
    expect(exportAs).toHaveBeenCalledWith(['shape:region'], { format: 'svg', name: 'Untitled' })
  })
})
