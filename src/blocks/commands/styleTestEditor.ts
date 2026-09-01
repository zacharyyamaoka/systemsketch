/**
 * A deliberately small stand-in for the tldraw Editor's style surface.
 *
 * SystemSketch's unit tests run without a DOM, so a real `Editor` cannot be
 * constructed here. This fixture exists to test *SystemSketch's* behavior —
 * which command runs, how many history marks a gesture makes, what the
 * inspector context resolves to — and it records every delegation so a test
 * can assert that the batch write goes through `setStyleForSelectedShapes`
 * rather than a loop of our own.
 *
 * It is not the oracle for tldraw's own fold-and-write semantics. That claim
 * is proven against the real editor in `tests/block_batch_editing_smoke.mjs`.
 */
import type { Editor, SharedStyle, StyleProp, TLShape, TLShapeId } from 'tldraw'

import { BLOCK_SHAPE_TYPE, getDefaultBlockProps, type BlockShape } from '../blockModel'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'

/** The same registry `Editor` builds from each ShapeUtil's `props`. */
const STYLE_PROP_KEYS: Record<string, Record<string, string>> = {
  [BLOCK_SHAPE_TYPE]: {
    'systemsketch:blockView': 'view',
    'systemsketch:blockPortLayout': 'portLayout',
    'systemsketch:blockShowDescription': 'showDescription',
  },
  [CONNECTION_SHAPE_TYPE]: {
    'systemsketch:connectionRouting': 'routing',
  },
}

export interface FakeShape {
  id: TLShapeId
  type: string
  parentId: string
  props: Record<string, unknown>
}

export function fakeBlock(
  id: string,
  props: Partial<BlockShape['props']> = {},
  parentId = 'page:page',
): FakeShape {
  return {
    id: `shape:${id}` as TLShapeId,
    type: BLOCK_SHAPE_TYPE,
    parentId,
    props: { ...getDefaultBlockProps(), ...props } as unknown as Record<string, unknown>,
  }
}

export function fakeConnection(id: string, routing: 'curved' | 'straight' = 'curved'): FakeShape {
  return {
    id: `shape:${id}` as TLShapeId,
    type: CONNECTION_SHAPE_TYPE,
    parentId: 'page:page',
    props: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, routing },
  }
}

export function fakeGroup(id: string): FakeShape {
  return { id: `shape:${id}` as TLShapeId, type: 'group', parentId: 'page:page', props: {} }
}

export function fakeGeo(id: string): FakeShape {
  return { id: `shape:${id}` as TLShapeId, type: 'geo', parentId: 'page:page', props: { w: 1, h: 1 } }
}

export interface StyleEditorFixture {
  editor: Editor
  /** Every `setStyleForSelectedShapes` delegation, in order. */
  styleWrites: Array<{ style: string; value: unknown }>
  historyLabels: string[]
  select(ids: string[]): void
  setTool(id: string): void
  shape(id: string): FakeShape | undefined
}

export function styleTestEditor(
  shapes: FakeShape[],
  selectedIds: string[] = shapes.map((shape) => shape.id),
): StyleEditorFixture {
  const byId = new Map(shapes.map((shape) => [String(shape.id), shape]))
  let selected = selectedIds.map(String)
  let tool = 'select'
  const styleWrites: StyleEditorFixture['styleWrites'] = []
  const historyLabels: string[] = []

  const flatten = (): FakeShape[] => {
    const out: FakeShape[] = []
    const visit = (shape: FakeShape | undefined) => {
      if (!shape) return
      if (shape.type === 'group') {
        for (const child of byId.values()) {
          if (child.parentId === String(shape.id)) visit(child)
        }
        return
      }
      out.push(shape)
    }
    for (const id of selected) visit(byId.get(id))
    return out
  }

  const styleKey = (shape: FakeShape, style: StyleProp<unknown>): string | undefined =>
    STYLE_PROP_KEYS[shape.type]?.[style.id]

  const editor = {
    getShape: (id: TLShapeId) => byId.get(String(id)) as unknown as TLShape | undefined,
    getSelectedShapes: () => selected
      .map((id) => byId.get(id))
      .filter(Boolean) as unknown as TLShape[],
    getSelectedShapeIds: () => selected as unknown as TLShapeId[],
    getCurrentToolId: () => tool,
    isShapeOfType: (shape: TLShape, type: string) => shape.type === type,
    getSortedChildIdsForParent: (id: TLShapeId) => [...byId.values()]
      .filter((shape) => shape.parentId === String(id))
      .map((shape) => shape.id),
    getShapeStyleIfExists: (shape: TLShape, style: StyleProp<unknown>) => {
      const key = styleKey(shape as unknown as FakeShape, style)
      return key === undefined ? undefined : (shape as unknown as FakeShape).props[key]
    },
    // Mirrors SharedStyleMap.applyValue: first value wins, a disagreement is mixed.
    getSharedStyles: () => ({
      get: <T,>(style: StyleProp<T>): SharedStyle<T> | undefined => {
        let shared: SharedStyle<T> | undefined
        for (const shape of flatten()) {
          const key = styleKey(shape, style as StyleProp<unknown>)
          if (key === undefined) continue
          const value = shape.props[key] as T
          if (!shared) shared = { type: 'shared', value }
          else if (shared.type === 'shared' && shared.value !== value) shared = { type: 'mixed' }
        }
        return shared
      },
    }),
    setStyleForSelectedShapes: (style: StyleProp<unknown>, value: unknown) => {
      styleWrites.push({ style: style.id, value })
      for (const shape of flatten()) {
        const key = styleKey(shape, style)
        if (key !== undefined) shape.props[key] = value
      }
      return editor
    },
    markHistoryStoppingPoint: (label: string) => {
      historyLabels.push(label)
      return `mark:${historyLabels.length}`
    },
    updateShape: (partial: { id: TLShapeId; props?: Record<string, unknown> }) => {
      const shape = byId.get(String(partial.id))
      if (shape) shape.props = { ...shape.props, ...partial.props }
      return editor
    },
    deleteShapes: (ids: TLShapeId[]) => {
      for (const id of ids) byId.delete(String(id))
      selected = selected.filter((id) => byId.has(id))
      return editor
    },
  }

  return {
    editor: editor as unknown as Editor,
    styleWrites,
    historyLabels,
    select: (ids) => (selected = ids.map(String)),
    setTool: (id) => (tool = id),
    shape: (id) => byId.get(id.startsWith('shape:') ? id : `shape:${id}`),
  }
}
