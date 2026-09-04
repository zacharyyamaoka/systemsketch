import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLCamera, TLPage, TLPageId } from 'tldraw'
import {
  addBoardLandmark,
  BOARD_LANDMARKS_META_KEY,
  focusBoardLandmark,
  getBoardLandmarks,
  removeBoardLandmark,
  renameBoardLandmark,
  suggestedLandmarkName,
} from './boardLandmarks'

const PAGE = 'page:board' as TLPageId

function harness(initialMeta: Record<string, unknown> = {}) {
  let page = { id: PAGE, typeName: 'page', name: 'Board', index: 'a1', meta: initialMeta } as TLPage
  let camera = { id: 'camera:page:board', typeName: 'camera', x: 240, y: -80, z: 0.8 } as TLCamera
  const editor = {
    getCurrentPage: () => page,
    getCurrentPageId: () => PAGE,
    getPage: (id: TLPageId) => id === PAGE ? page : undefined,
    getCamera: () => camera,
    updatePage: vi.fn((patch: Partial<TLPage>) => { page = { ...page, ...patch } }),
    setCamera: vi.fn((next: Partial<TLCamera>) => { camera = { ...camera, ...next } }),
  } as unknown as Editor
  return { editor, page: () => page, camera: () => camera }
}

describe('named board landmarks', () => {
  it('persists a current camera pose in page metadata, not browser-local state', () => {
    const { editor, page } = harness({ anotherFeature: { keep: true } })
    const result = addBoardLandmark(editor, 'Pipeline', 'landmark-pipeline')

    expect(result).toEqual({
      ok: true,
      landmark: { id: 'landmark-pipeline', name: 'Pipeline', camera: { x: 240, y: -80, z: 0.8 } },
    })
    expect(page().meta).toMatchObject({
      anotherFeature: { keep: true },
      [BOARD_LANDMARKS_META_KEY]: {
        version: 1,
        landmarks: [{ id: 'landmark-pipeline', name: 'Pipeline', camera: { x: 240, y: -80, z: 0.8 } }],
      },
    })
  })

  it('filters malformed persisted entries without losing the readable saved view', () => {
    const { editor } = harness({
      [BOARD_LANDMARKS_META_KEY]: {
        version: 1,
        landmarks: [
          { id: 'good', name: 'Runtime', camera: { x: 1, y: 2, z: 1.2 } },
          { id: 'bad-camera', name: 'Broken', camera: { x: 1, y: 2, z: 'no' } },
          { id: 'good', name: 'Repeated', camera: { x: 1, y: 2, z: 1 } },
        ],
      },
    })

    expect(getBoardLandmarks(editor)).toEqual([
      { id: 'good', name: 'Runtime', camera: { x: 1, y: 2, z: 1.2 } },
    ])
  })

  it('requires a distinct, nonblank name and supports a durable rename', () => {
    const { editor } = harness()
    addBoardLandmark(editor, 'Pipeline', 'pipeline')
    addBoardLandmark(editor, 'Runtime', 'runtime')

    expect(addBoardLandmark(editor, ' pipeline ', 'again')).toEqual({ ok: false, reason: 'duplicate-name' })
    expect(renameBoardLandmark(editor, 'runtime', '   ')).toEqual({ ok: false, reason: 'invalid-name' })
    expect(renameBoardLandmark(editor, 'runtime', 'Live runtime')).toEqual({
      ok: true,
      landmark: expect.objectContaining({ id: 'runtime', name: 'Live runtime' }),
    })
    expect(getBoardLandmarks(editor).map((landmark) => landmark.name)).toEqual(['Pipeline', 'Live runtime'])
  })

  it('jumps by camera only, preserving the current tool and selection state', () => {
    const { editor, camera } = harness()
    addBoardLandmark(editor, 'Pipeline', 'pipeline')
    ;(editor as unknown as { getCamera(): TLCamera }).getCamera = () => ({ ...camera(), x: 0, y: 0, z: 1 })

    expect(focusBoardLandmark(editor, 'pipeline')).toBe(true)
    expect(editor.setCamera).toHaveBeenCalledWith(
      { x: 240, y: -80, z: 0.8 },
      { animation: { duration: 220 } },
    )
    expect(focusBoardLandmark(editor, 'missing')).toBe(false)
  })

  it('deletes deliberately and produces a human-sized next default', () => {
    const { editor } = harness()
    addBoardLandmark(editor, 'View 1', 'first')
    addBoardLandmark(editor, 'View 3', 'third')
    expect(suggestedLandmarkName(getBoardLandmarks(editor))).toBe('View 4')
    expect(removeBoardLandmark(editor, 'first')).toBe(true)
    expect(getBoardLandmarks(editor).map((landmark) => landmark.id)).toEqual(['third'])
    expect(removeBoardLandmark(editor, 'missing')).toBe(false)
  })
})
