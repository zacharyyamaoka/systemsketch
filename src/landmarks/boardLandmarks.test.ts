import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLCamera, TLPage, TLPageId } from 'tldraw'
import {
  addBoardLandmark,
  BOARD_LANDMARKS_META_KEY,
  type BoardLandmark,
  focusBoardLandmark,
  getBoardLandmarkState,
  getBoardLandmarks,
  mergeImportedPageLandmarks,
  removeBoardLandmark,
  renameBoardLandmark,
  suggestedLandmarkName,
} from './boardLandmarks'

const PAGE = 'page:board' as TLPageId
const landmarkMeta = (landmarks: unknown, version: unknown = 1) => ({ [BOARD_LANDMARKS_META_KEY]: { version, landmarks } })
const entry = (id: string, name: string, x = 240, y = -80, z = 0.8) => ({ id, name, camera: { x, y, z } })

function page(id: TLPageId, name: string, meta: Record<string, unknown> = {}) {
  return { id, typeName: 'page', name, index: 'a1', meta } as TLPage
}

function harness(initialMeta: Record<string, unknown> = {}, readonly = false) {
  let current = page(PAGE, 'Board', initialMeta)
  let camera = { id: 'camera:page:board', typeName: 'camera', x: 240, y: -80, z: 0.8 } as TLCamera
  const history: string[] = []
  const editor = {
    getCurrentPage: () => current,
    getCurrentPageId: () => PAGE,
    getPage: (id: TLPageId) => id === PAGE ? current : undefined,
    getCamera: () => camera,
    getIsReadonly: () => readonly,
    markHistoryStoppingPoint: vi.fn((label: string) => { history.push(label) }),
    updatePage: vi.fn((patch: Partial<TLPage>) => { current = { ...current, ...patch } }),
    setCamera: vi.fn((next: Partial<TLCamera>) => { camera = { ...camera, ...next } }),
  } as unknown as Editor
  return { editor, page: () => current, camera: () => camera, history }
}

describe('named board landmarks', () => {
  it('persists a current camera pose in page metadata with one undo boundary', () => {
    const { editor, page: current, history } = harness({ anotherFeature: { keep: true } })
    expect(addBoardLandmark(editor, 'Pipeline', 'landmark-pipeline')).toEqual({
      ok: true, landmark: entry('landmark-pipeline', 'Pipeline'),
    })
    expect(current().meta).toMatchObject({ anotherFeature: { keep: true }, ...landmarkMeta([entry('landmark-pipeline', 'Pipeline')]) })
    expect(history).toEqual(['save board landmark'])
  })

  it('refuses unknown/future metadata without overwriting one byte of its envelope', () => {
    const meta = landmarkMeta([{ opaque: true }], 9)
    const { editor, page: current, history } = harness(meta)
    expect(getBoardLandmarkState(editor)).toEqual({ kind: 'unsupported-version', version: 9 })
    expect(addBoardLandmark(editor, 'Pipeline', 'pipeline')).toEqual({ ok: false, reason: 'unsupported-version' })
    expect(renameBoardLandmark(editor, 'pipeline', 'Renamed')).toEqual({ ok: false, reason: 'unsupported-version' })
    expect(removeBoardLandmark(editor, 'pipeline')).toEqual({ ok: false, reason: 'unsupported-version' })
    expect(current().meta).toEqual(meta)
    expect(history).toEqual([])
  })

  it('refuses malformed, blank-id, duplicate-id, and normalized duplicate-name lists without data loss', () => {
    for (const landmarks of [
      [entry(' ', 'Blank id')],
      [entry('same', 'One'), entry('same', 'Two')],
      [entry('one', ' Runtime '), entry('two', 'runtime')],
      { not: 'an array' },
    ]) {
      const meta = landmarkMeta(landmarks)
      const { editor, page: current } = harness(meta)
      expect(getBoardLandmarkState(editor).kind).toBe('malformed')
      expect(addBoardLandmark(editor, 'New view', 'new')).toEqual({ ok: false, reason: 'malformed' })
      expect(current().meta).toEqual(meta)
    }
  })

  it('marks save, rename, and delete as independent history steps; no-op rename writes nothing', () => {
    const { editor, page: current, history } = harness()
    addBoardLandmark(editor, 'Pipeline', 'pipeline')
    expect(renameBoardLandmark(editor, 'pipeline', 'Pipeline')).toEqual({ ok: false, reason: 'unchanged' })
    expect(current().meta).toMatchObject(landmarkMeta([entry('pipeline', 'Pipeline')]))
    expect(renameBoardLandmark(editor, 'pipeline', 'Execution')).toEqual({ ok: true, landmark: entry('pipeline', 'Execution') })
    expect(removeBoardLandmark(editor, 'pipeline')).toEqual({ ok: true, landmark: entry('pipeline', 'Execution') })
    expect(history).toEqual(['save board landmark', 'rename board landmark', 'delete board landmark'])
  })

  it('rejects writes to a protected document without false success or an undo mark', () => {
    const { editor, page: current, history } = harness(landmarkMeta([entry('pipeline', 'Pipeline')]), true)
    expect(addBoardLandmark(editor, 'New', 'new')).toEqual({ ok: false, reason: 'readonly' })
    expect(renameBoardLandmark(editor, 'pipeline', 'Execution')).toEqual({ ok: false, reason: 'readonly' })
    expect(removeBoardLandmark(editor, 'pipeline')).toEqual({ ok: false, reason: 'readonly' })
    expect(current().meta).toMatchObject(landmarkMeta([entry('pipeline', 'Pipeline')]))
    expect(history).toEqual([])
  })

  it('jumps by camera only while the board is zoomed, preserving selection, tool, and depth state', () => {
    const { editor, camera } = harness()
    addBoardLandmark(editor, 'Pipeline', 'pipeline')
    ;(editor as unknown as { getCamera(): TLCamera }).getCamera = () => ({ ...camera(), x: 0, y: 0, z: 1.7 })
    const untouched = { tool: 'select', selection: ['shape:subject'], depth: 'shape:expanded' }
    Object.assign(editor as object, {
      getCurrentToolId: vi.fn(() => untouched.tool),
      getSelectedShapeIds: vi.fn(() => untouched.selection),
    })
    expect(focusBoardLandmark(editor, 'pipeline')).toBe(true)
    expect(editor.setCamera).toHaveBeenCalledWith({ x: 240, y: -80, z: 0.8 }, { animation: { duration: 220 } })
    expect((editor as unknown as { getCurrentToolId(): string }).getCurrentToolId()).toBe('select')
    expect((editor as unknown as { getSelectedShapeIds(): string[] }).getSelectedShapeIds()).toEqual(['shape:subject'])
    expect(untouched.depth).toBe('shape:expanded')
  })

  it('merges secondary-page landmarks through the same frame displacement while retaining root metadata', () => {
    const root = page(PAGE, 'Architecture', { keep: { root: true }, ...landmarkMeta([entry('shared', 'Overview', 10, 20, 1)]) })
    const runtime = page('page:runtime' as TLPageId, 'Runtime', {
      keep: { secondary: true },
      ...landmarkMeta([entry('shared', 'Overview', 50, 70, 0.5), entry('runtime', 'Worker', 30, 40, 2)]),
    })
    const merged = mergeImportedPageLandmarks(root, [{ page: runtime, displacement: { x: 864, y: -36 } }])!
    expect(merged.keep).toEqual({ root: true })
    expect((merged[BOARD_LANDMARKS_META_KEY] as unknown as { landmarks: BoardLandmark[] }).landmarks).toEqual([
      entry('shared', 'Overview', 10, 20, 1),
      entry('page-runtime:shared', 'Runtime · Overview', -382, 88, 0.5),
      entry('runtime', 'Worker', -1698, 112, 2),
    ])
  })

  it('does not merge secondary data into an unknown root envelope and names the next view predictably', () => {
    const root = page(PAGE, 'Architecture', landmarkMeta([], 2))
    const runtime = page('page:runtime' as TLPageId, 'Runtime', landmarkMeta([entry('runtime', 'Worker')]))
    expect(mergeImportedPageLandmarks(root, [{ page: runtime, displacement: { x: 1, y: 2 } }])).toBeNull()
    expect(suggestedLandmarkName([entry('first', 'View 1'), entry('third', 'View 3')])).toBe('View 4')
    expect(getBoardLandmarks(harness(landmarkMeta([], 4)).editor)).toEqual([])
  })
})
