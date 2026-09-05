import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLPage, TLPageId, TLShape, TLShapeId } from 'tldraw'
import { FRAMES_PANEL_ORDER_META_KEY, getFramesPanelModel, getFramesPanelPreviews, mergeImportedFramesPanelOrder, moveFramesPanelItemKey, reorderFramesPanelItems } from './framesPanelModel'

const PAGE = 'page:frames' as TLPageId
const frame = (id: string, name: string, index: string): TLShape => ({ id: `shape:${id}` as TLShapeId, typeName: 'shape', type: 'frame', parentId: PAGE, index, x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, props: { name } } as unknown as TLShape)

function harness(meta: Record<string, unknown> = {}) {
  let page = { id: PAGE, name: 'Frames', index: 'a1', meta } as unknown as TLPage
  const shapes = [frame('architecture', 'Architecture', 'a1'), frame('runtime', 'Runtime', 'a2')]
  const editor = {
    getCurrentPageId: () => PAGE, getCurrentPage: () => page, getPages: () => [page], getPage: () => page,
    getPageShapeIds: () => new Set(shapes.map((shape) => shape.id)), getShape: (id: TLShapeId) => shapes.find((shape) => shape.id === id),
    getShapePageBounds: (id: TLShapeId) => ({ ...(shapes.find((shape) => shape.id === id) ?? { x: 0, y: 0, props: { w: 1, h: 1 } }), w: 120, h: 80 }),
    getViewportScreenBounds: () => ({ w: 1200, h: 800 }),
    getSelectedShapeIds: () => [], getIsReadonly: () => false, markHistoryStoppingPoint: vi.fn(),
    updatePage: vi.fn((update: { meta: TLPage['meta'] }) => { page = { ...page, meta: update.meta } }),
  } as unknown as Editor
  return { editor, page: () => page }
}

describe('Frames panel ordering', () => {
  it('mixes persisted camera views with frame records and restores an explicit order', () => {
    const { editor } = harness({
      systemSketchLandmarks: { version: 1, landmarks: [{ id: 'camera', name: 'Saved camera', camera: { x: 2, y: 3, z: 1 } }] },
      [FRAMES_PANEL_ORDER_META_KEY]: { version: 1, order: ['landmark:camera', 'shape:shape:runtime', 'shape:shape:architecture'] },
    })
    expect(getFramesPanelModel(editor).items.map((item) => item.key)).toEqual(['landmark:camera', 'shape:shape:runtime', 'shape:shape:architecture'])
  })

  it('writes only an order projection to page metadata, leaving landmark records intact', () => {
    const { editor, page } = harness({ systemSketchLandmarks: { version: 1, landmarks: [{ id: 'camera', name: 'Saved camera', camera: { x: 2, y: 3, z: 1 } }] } })
    expect(reorderFramesPanelItems(editor, ['shape:shape:runtime', 'landmark:camera', 'shape:shape:architecture'])).toBe(true)
    expect((page().meta as Record<string, unknown>).systemSketchLandmarks).toEqual({ version: 1, landmarks: [{ id: 'camera', name: 'Saved camera', camera: { x: 2, y: 3, z: 1 } }] })
    expect((page().meta as Record<string, { order: string[] }>)[FRAMES_PANEL_ORDER_META_KEY].order[0]).toBe('shape:shape:runtime')
  })

  it('projects a saved camera into its own page-space viewport, not the entire board', () => {
    const { editor } = harness({
      systemSketchLandmarks: { version: 1, landmarks: [{ id: 'camera', name: 'Saved camera', camera: { x: -410, y: -230, z: 0.72 } }] },
    })
    const model = getFramesPanelModel(editor)
    const preview = getFramesPanelPreviews(editor, model.items).get('landmark:camera')
    expect(preview?.viewport).toEqual({ x: 410, y: 230, w: 1200 / 0.72, h: 800 / 0.72 })
  })

  it('moves a key before or after the hovered item without duplicate persistence', () => {
    expect(moveFramesPanelItemKey(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(moveFramesPanelItemKey(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(moveFramesPanelItemKey(['a', 'a'], 'a', 'a', 'after')).toBeNull()
  })

  it('migrates only readable shape ordering and preserves an opaque source order untouched', () => {
    const root = { id: PAGE, name: 'Root', index: 'a1', meta: { [FRAMES_PANEL_ORDER_META_KEY]: { version: 1, order: ['shape:root', 'landmark:root-camera'] } } } as unknown as TLPage
    const source = { id: 'page:source' as TLPageId, name: 'Source', index: 'a2', meta: { [FRAMES_PANEL_ORDER_META_KEY]: { version: 1, order: ['shape:source', 'landmark:colliding-camera'] } } } as unknown as TLPage
    expect((mergeImportedFramesPanelOrder(root, [root, source]) as Record<string, { order: string[] }>)[FRAMES_PANEL_ORDER_META_KEY].order).toEqual(['shape:root', 'shape:source'])
    const opaque = { ...source, meta: { [FRAMES_PANEL_ORDER_META_KEY]: { version: 9, order: ['shape:opaque'] } } } as TLPage
    expect(mergeImportedFramesPanelOrder(root, [root, opaque])).toBeNull()
  })
})
