import { describe, expect, it, vi } from 'vitest'
import { type Editor } from 'tldraw'
import {
  MAX_SHAPE_LIBRARY_RECENTS,
  SHAPE_LIBRARY_ITEMS,
  SHAPE_LIBRARY_RECENTS_KEY,
  filterShapeLibraryItems,
  insertShapeLibraryItem,
  insertShapeLibraryItemAtPoint,
  normalizeShapeLibraryRecentIds,
  readShapeLibraryRecentIds,
  rememberShapeLibraryItem,
  shapeLibraryItemById,
  type ShapeLibraryStorage,
} from './shapeLibraryModel'

function memoryStorage(initial: Record<string, string> = {}): ShapeLibraryStorage {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

function insertionEditor() {
  const events: string[] = []
  let created: any = null
  const createShape = vi.fn((shape: unknown) => { events.push('create'); created = shape; return shape })
  const editor = {
    getViewportPageBounds: () => ({ center: { x: 500, y: 360 } }),
    markHistoryStoppingPoint: vi.fn(() => { events.push('mark') }),
    run: vi.fn((callback: () => void) => { events.push('run:start'); callback(); events.push('run:end') }),
    createShape,
    getShape: () => created,
    getShapePageBounds: () => created ? ({ center: { x: created.x + 90, y: created.y + 36 } }) : null,
    getShapesAtPoint: vi.fn(() => []),
    reparentShapes: vi.fn(),
    updateShape: vi.fn(),
    setCurrentTool: vi.fn(() => { events.push('tool') }),
    select: vi.fn(() => { events.push('select') }),
  } as unknown as Editor
  return { editor, events, createShape }
}

describe('shared shape library catalog', () => {
  it('has real stock arrow choices and filters labels, sections, and synonyms', () => {
    expect(SHAPE_LIBRARY_ITEMS.filter((item) => item.section === 'Connections').map((item) => item.id))
      .toEqual(['arrow-straight', 'arrow-curve', 'arrow-elbow'])
    expect(filterShapeLibraryItems('orthogonal connection').map((item) => item.id)).toEqual(['arrow-elbow'])
    expect(filterShapeLibraryItems('circle').map((item) => item.id)).toEqual(['ellipse'])
    expect(filterShapeLibraryItems('flow decision').map((item) => item.id)).toEqual(['decision'])
    expect(filterShapeLibraryItems('missing')).toEqual([])
  })

  it('keeps only valid, unique, bounded recents and survives malformed storage', () => {
    const allIds = SHAPE_LIBRARY_ITEMS.map((item) => item.id)
    expect(normalizeShapeLibraryRecentIds(['missing', allIds[0], allIds[0], ...allIds.slice(1)]))
      .toEqual(allIds.slice(0, MAX_SHAPE_LIBRARY_RECENTS))

    const broken = memoryStorage({ [SHAPE_LIBRARY_RECENTS_KEY]: '{oops' })
    expect(readShapeLibraryRecentIds(broken)).toEqual([])

    const storage = memoryStorage()
    rememberShapeLibraryItem('rectangle', storage)
    rememberShapeLibraryItem('arrow-elbow', storage)
    rememberShapeLibraryItem('rectangle', storage)
    expect(readShapeLibraryRecentIds(storage)).toEqual(['rectangle', 'arrow-elbow'])
  })

  it('inserts a centered geo in one editor transaction, selects it, and remembers it', () => {
    const { editor, events, createShape } = insertionEditor()
    const storage = memoryStorage()
    const item = shapeLibraryItemById('rectangle')!
    const id = insertShapeLibraryItem(editor, item, storage)

    expect(createShape).toHaveBeenCalledWith(expect.objectContaining({
      id,
      type: 'geo',
      x: 425,
      y: 310,
      props: expect.objectContaining({ geo: 'rectangle', w: 150, h: 100 }),
    }))
    expect(events).toEqual(['mark', 'run:start', 'create', 'tool', 'select', 'run:end'])
    expect(editor.setCurrentTool).toHaveBeenCalledWith('select')
    expect(editor.select).toHaveBeenCalledWith(id)
    expect(readShapeLibraryRecentIds(storage)).toEqual(['rectangle'])
  })

  it('inserts each connection choice as a supported stock arrow record', () => {
    for (const itemId of ['arrow-straight', 'arrow-curve', 'arrow-elbow']) {
      const { editor, createShape } = insertionEditor()
      insertShapeLibraryItem(editor, shapeLibraryItemById(itemId)!, memoryStorage())
      expect(createShape).toHaveBeenCalledWith(expect.objectContaining({
        type: 'arrow',
        props: expect.objectContaining({
          start: { x: 0, y: 0 },
          end: { x: 180, y: 72 },
        }),
      }))
      const partial = createShape.mock.calls[0][0] as { props: { kind: string; bend: number } }
      expect(partial.props.kind).toBe(itemId === 'arrow-elbow' ? 'elbow' : 'arc')
      expect(partial.props.bend).toBe(itemId === 'arrow-curve' ? 42 : 0)
    }
  })

  it('can centre a primitive on the pointer point without changing the shared transaction', () => {
    const { editor, createShape } = insertionEditor()
    const id = insertShapeLibraryItemAtPoint(
      editor,
      shapeLibraryItemById('rectangle')!,
      { x: 210, y: 170 },
      memoryStorage(),
    )

    expect(createShape).toHaveBeenCalledWith(expect.objectContaining({
      id,
      type: 'geo',
      x: 135,
      y: 120,
    }))
  })

  it('adopts a pointer-inserted primitive into the expanded function under that point', () => {
    const { editor } = insertionEditor()
    const container = { id: 'shape:function', type: 'block', props: { view: 'expanded' } }
    vi.mocked(editor.getShapesAtPoint).mockReturnValue([container] as any)

    const id = insertShapeLibraryItemAtPoint(
      editor,
      shapeLibraryItemById('rectangle')!,
      { x: 210, y: 170 },
      memoryStorage(),
    )

    expect(editor.reparentShapes).toHaveBeenCalledWith([id], container.id)
  })
})
