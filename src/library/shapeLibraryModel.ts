import {
  createShapeId,
  type Editor,
  type TLArrowShape,
  type TLGeoShape,
  type TLShapeId,
} from 'tldraw'
import { isExpandedBlockShape } from '../blocks/blockModel'

export const SHAPE_LIBRARY_SECTIONS = ['Connections', 'Basic', 'Flowchart'] as const
export type ShapeLibrarySection = (typeof SHAPE_LIBRARY_SECTIONS)[number]

interface ShapeLibraryItemBase {
  id: string
  label: string
  section: ShapeLibrarySection
  icon: string
  searchTerms?: readonly string[]
}

export interface ShapeLibraryGeoItem extends ShapeLibraryItemBase {
  kind: 'geo'
  geo: TLGeoShape['props']['geo']
  width?: number
  height?: number
}

export interface ShapeLibraryArrowItem extends ShapeLibraryItemBase {
  kind: 'arrow'
  arrowKind: TLArrowShape['props']['kind']
  bend: number
}

export type ShapeLibraryItem = ShapeLibraryGeoItem | ShapeLibraryArrowItem

/**
 * One catalog for every SystemSketch library surface.
 *
 * The connection entries are stock tldraw arrows, not decorative placeholders:
 * choosing one creates the same public `arrow` record that the toolbar's Arrow
 * family creates. Semantic Block cables still start from a real Block port,
 * where their required endpoint bindings can be created honestly.
 */
export const SHAPE_LIBRARY_ITEMS: readonly ShapeLibraryItem[] = [
  {
    id: 'arrow-straight',
    label: 'Straight arrow',
    section: 'Connections',
    kind: 'arrow',
    arrowKind: 'arc',
    bend: 0,
    icon: 'tool-arrow',
    searchTerms: ['connection', 'line'],
  },
  {
    id: 'arrow-curve',
    label: 'Curved arrow',
    section: 'Connections',
    kind: 'arrow',
    arrowKind: 'arc',
    bend: 42,
    icon: 'arrow-arc',
    searchTerms: ['connection', 'arc'],
  },
  {
    id: 'arrow-elbow',
    label: 'Elbow arrow',
    section: 'Connections',
    kind: 'arrow',
    arrowKind: 'elbow',
    bend: 0,
    icon: 'arrow-elbow',
    searchTerms: ['connection', 'orthogonal'],
  },
  { id: 'rectangle', label: 'Rectangle', section: 'Basic', kind: 'geo', geo: 'rectangle', icon: 'geo-rectangle' },
  { id: 'ellipse', label: 'Ellipse', section: 'Basic', kind: 'geo', geo: 'ellipse', icon: 'geo-ellipse', searchTerms: ['circle'] },
  { id: 'triangle', label: 'Triangle', section: 'Basic', kind: 'geo', geo: 'triangle', icon: 'geo-triangle' },
  { id: 'diamond', label: 'Diamond', section: 'Basic', kind: 'geo', geo: 'diamond', icon: 'geo-diamond' },
  { id: 'hexagon', label: 'Hexagon', section: 'Basic', kind: 'geo', geo: 'hexagon', icon: 'geo-hexagon' },
  { id: 'star', label: 'Star', section: 'Basic', kind: 'geo', geo: 'star', icon: 'geo-star' },
  { id: 'cloud', label: 'Cloud', section: 'Basic', kind: 'geo', geo: 'cloud', icon: 'geo-cloud', width: 170 },
  { id: 'process', label: 'Process', section: 'Flowchart', kind: 'geo', geo: 'rectangle', icon: 'geo-rectangle', width: 190 },
  { id: 'decision', label: 'Decision', section: 'Flowchart', kind: 'geo', geo: 'diamond', icon: 'geo-diamond' },
  { id: 'terminator', label: 'Terminator', section: 'Flowchart', kind: 'geo', geo: 'oval', icon: 'geo-oval', width: 180, height: 80 },
  { id: 'data', label: 'Data', section: 'Flowchart', kind: 'geo', geo: 'rhombus', icon: 'geo-rhombus' },
  { id: 'manual-input', label: 'Manual input', section: 'Flowchart', kind: 'geo', geo: 'trapezoid', icon: 'geo-trapezoid', width: 180 },
  { id: 'cloud-service', label: 'Cloud service', section: 'Flowchart', kind: 'geo', geo: 'cloud', icon: 'geo-cloud', width: 180 },
]

const ITEM_BY_ID = new Map(SHAPE_LIBRARY_ITEMS.map((item) => [item.id, item]))

export function shapeLibraryItemById(id: string): ShapeLibraryItem | undefined {
  return ITEM_BY_ID.get(id)
}

export function filterShapeLibraryItems(query: string): ShapeLibraryItem[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...SHAPE_LIBRARY_ITEMS]
  return SHAPE_LIBRARY_ITEMS.filter((item) => {
    const haystack = [item.label, item.section, ...(item.searchTerms ?? [])].join(' ').toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export const SHAPE_LIBRARY_RECENTS_KEY = 'systemsketch.shape-library.recents.v1'
export const SHAPE_LIBRARY_RECENTS_EVENT = 'systemsketch:shape-library-recents'
export const MAX_SHAPE_LIBRARY_RECENTS = 8

export interface ShapeLibraryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ShapeLibraryPoint {
  x: number
  y: number
}

function browserStorage(): ShapeLibraryStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function normalizeShapeLibraryRecentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const id of value) {
    if (typeof id !== 'string' || !ITEM_BY_ID.has(id) || result.includes(id)) continue
    result.push(id)
    if (result.length === MAX_SHAPE_LIBRARY_RECENTS) break
  }
  return result
}

export function readShapeLibraryRecentIds(storage = browserStorage()): string[] {
  if (!storage) return []
  try {
    return normalizeShapeLibraryRecentIds(JSON.parse(storage.getItem(SHAPE_LIBRARY_RECENTS_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function rememberShapeLibraryItem(
  itemId: string,
  storage = browserStorage(),
): string[] {
  const next = normalizeShapeLibraryRecentIds([itemId, ...readShapeLibraryRecentIds(storage)])
  if (storage) {
    try {
      storage.setItem(SHAPE_LIBRARY_RECENTS_KEY, JSON.stringify(next))
    } catch {
      // A blocked storage preference must not block a canvas insertion.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string[]>(SHAPE_LIBRARY_RECENTS_EVENT, { detail: next }))
  }
  return next
}

/**
 * Insert one catalog item at the visible viewport centre as one undoable edit.
 * Selection and tool state ride the same public Editor transaction, leaving the
 * inserted object ready to move or style immediately.
 */
export function insertShapeLibraryItem(
  editor: Editor,
  item: ShapeLibraryItem,
  storage = browserStorage(),
): TLShapeId {
  return insertShapeLibraryItemAtPointInternal(
    editor,
    item,
    editor.getViewportPageBounds().center,
    storage,
    false,
  )
}

/** Insert a catalog primitive with its visual centre at one explicit page point. */
export function insertShapeLibraryItemAtPoint(
  editor: Editor,
  item: ShapeLibraryItem,
  center: ShapeLibraryPoint,
  storage = browserStorage(),
): TLShapeId {
  return insertShapeLibraryItemAtPointInternal(editor, item, center, storage, true)
}

function insertShapeLibraryItemAtPointInternal(
  editor: Editor,
  item: ShapeLibraryItem,
  center: ShapeLibraryPoint,
  storage: ShapeLibraryStorage | undefined,
  adoptExpandedBlock: boolean,
): TLShapeId {
  const id = createShapeId()

  editor.markHistoryStoppingPoint(`insert_library_shape:${item.id}`)
  editor.run(() => {
    if (item.kind === 'geo') {
      const width = item.width ?? 150
      const height = item.height ?? 100
      editor.createShape<TLGeoShape>({
        id,
        type: 'geo',
        x: center.x - width / 2,
        y: center.y - height / 2,
        props: { geo: item.geo, w: width, h: height },
      })
    } else {
      const width = 180
      const height = 72
      editor.createShape<TLArrowShape>({
        id,
        type: 'arrow',
        x: center.x - width / 2,
        y: center.y - height / 2,
        props: {
          kind: item.arrowKind,
          start: { x: 0, y: 0 },
          end: { x: width, y: height },
          bend: item.bend,
          elbowMidPoint: 0.5,
        },
      })
      const created = editor.getShape(id)
      const bounds = editor.getShapePageBounds(id)
      if (created && bounds) {
        const dx = center.x - bounds.center.x
        const dy = center.y - bounds.center.y
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          editor.updateShape({
            id: created.id,
            type: created.type,
            x: created.x + dx,
            y: created.y + dy,
          })
        }
      }
    }
    if (adoptExpandedBlock) {
      const container = editor.getShapesAtPoint(center, { hitInside: true })
        .find(isExpandedBlockShape)
      // WHY: this path promises to place a primitive *where S was pressed*.
      // Inside a function, visual overlap without parentage would look right
      // until the function moved. Reparenting preserves the page pose while
      // making the insertion an honest child of the Expanded Block.
      if (container) editor.reparentShapes([id], container.id)
    }
    editor.setCurrentTool('select')
    editor.select(id)
  })
  rememberShapeLibraryItem(item.id, storage)
  return id
}
