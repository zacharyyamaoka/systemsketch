import {
  createShapeId,
  type Editor,
  type TLCamera,
  type TLPageId,
  type TLShape,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import {
  getDefaultBlockProps,
  setBlockViewProps,
  type BlockShape,
  type BlockView,
} from '../blocks/blockModel'
import {
  getDepthNavigationModel,
  getDepthNavigationSnapshot,
  focusDepthOverviewTarget,
  focusDepthOverviewPage,
  goBackInDepthHistory,
  goForwardInDepthHistory,
  returnToDepthRoot,
  stepIntoDepthScope,
  stepOutOfDepthScope,
  stepToDepthAncestor,
  toggleDepthScope,
} from './depthNavigation'

const TEST_PAGE_ID = 'page:page' as TLPageId

function block(
  name: string,
  parentId: BlockShape['parentId'],
  view: BlockView = 'expanded',
): BlockShape {
  return {
    id: createShapeId(name.toLowerCase().replaceAll(' ', '-')),
    typeName: 'shape',
    type: 'block',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as BlockShape['index'],
    parentId,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      ...setBlockViewProps(getDefaultBlockProps(), view),
      title: name,
    },
  }
}

function fakeEditor(shapes: BlockShape[], pages = [{ id: TEST_PAGE_ID, name: 'Robot sorter' }]) {
  let currentPageId = TEST_PAGE_ID
  const page = () => pages.find((candidate) => candidate.id === currentPageId)!
  let selected: TLShape['id'][] = []
  const byId = new Map<TLShape['id'], TLShape>(shapes.map((shape) => [shape.id, shape]))
  let camera: TLCamera = {
    id: 'camera:page:page' as TLCamera['id'],
    typeName: 'camera',
    x: 9,
    y: 12,
    z: 0.8,
    meta: {},
  }
  const ancestors = (shape: TLShape): TLShape[] => {
    const result: TLShape[] = []
    let current: TLShape | undefined = shape
    while (current && current.parentId !== TEST_PAGE_ID) {
      current = byId.get(current.parentId as TLShape['id'])
      if (current) result.push(current)
    }
    return result.reverse()
  }
  const editor = {
    getShape: vi.fn((id: TLShape['id']) => byId.get(id)),
    getShapeAncestors: (shape: TLShape | TLShape['id']) => ancestors(
      typeof shape === 'string' ? byId.get(shape)! : shape,
    ),
    getAncestorPageId: () => TEST_PAGE_ID,
    getCurrentPageId: () => currentPageId,
    getCurrentPage: () => page(),
    getPage: (id: TLPageId) => pages.find((candidate) => candidate.id === id),
    setCurrentPage: vi.fn((id: TLPageId) => { currentPageId = id }),
    getShapePageBounds: () => ({ x: 10, y: 20, w: 560, h: 380 }),
    getCurrentPageBounds: () => ({ x: 10, y: 20, w: 560, h: 380 }),
    getViewportScreenBounds: () => ({ x: 0, y: 0, w: 1000, h: 800, width: 1000, height: 800 }),
    getCameraOptions: () => ({ zoomSteps: [0.1, 8] }),
    getBaseZoom: () => 1,
    getCamera: () => camera,
    setCamera: vi.fn((next: TLCamera) => { camera = next }),
    zoomToBounds: vi.fn(),
    zoomToFit: vi.fn(),
    setCurrentTool: vi.fn(),
    getSelectedShapeIds: () => selected,
    select: vi.fn((...ids: TLShape['id'][]) => { selected = ids }),
    selectNone: vi.fn(() => { selected = [] }),
  } as unknown as Editor
  return { editor, camera: () => camera }
}

function focusCamera() {
  const z = 916 / 560
  return { x: -10 + 84 / (2 * z), y: -20 + (800 - 380 * z) / (2 * z), z }
}

describe('Depth Stack navigation', () => {
  it('projects the single root canvas at depth zero without exposing an internal page name', () => {
    const { editor } = fakeEditor([])
    expect(getDepthNavigationModel(editor, null)).toMatchObject({
      pageName: 'Board',
      current: null,
      entries: [],
      depth: 0,
    })
  })

  it('projects an arbitrary real parent chain without a fixed depth ceiling', () => {
    const shapes: BlockShape[] = []
    let parentId = TEST_PAGE_ID as BlockShape['parentId']
    for (let index = 1; index <= 11; index += 1) {
      const next = block(`Level ${index}`, parentId)
      shapes.push(next)
      parentId = next.id
    }
    const { editor } = fakeEditor(shapes)
    const model = getDepthNavigationModel(editor, shapes[10].id)

    expect(model?.depth).toBe(11)
    expect(model?.entries.map((entry) => entry.name)).toEqual(
      Array.from({ length: 11 }, (_, index) => `Level ${index + 1}`),
    )
    expect(model?.parent?.name).toBe('Level 10')
  })

  it('enters only Expanded Blocks and constrains further descent to the active scope', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const sibling = block('Sibling', TEST_PAGE_ID)
    const collapsed = block('Collapsed', outer.id, 'simple')
    const { editor } = fakeEditor([outer, inner, sibling, collapsed])

    expect(stepIntoDepthScope(editor, collapsed.id)).toBe(false)
    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, sibling.id)).toBe(false)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(inner.id)
  })

  it('jumps to ancestors, steps out structurally, and restores the root camera', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const middle = block('Middle', outer.id)
    const inner = block('Inner', middle.id)
    const { editor } = fakeEditor([outer, middle, inner])
    const rootCamera = { ...editor.getCamera() }

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, middle.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(stepToDepthAncestor(editor, outer.id)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
    expect(stepIntoDepthScope(editor, middle.id)).toBe(true)
    expect(stepOutOfDepthScope(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
    expect(returnToDepthRoot(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(editor.setCamera).toHaveBeenLastCalledWith(
      rootCamera,
      expect.objectContaining({ animation: expect.any(Object) }),
    )
  })

  it('uses the same Block action to enter and leave the active scope', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor } = fakeEditor([outer, inner])

    expect(toggleDepthScope(editor, outer.id)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
    expect(toggleDepthScope(editor, outer.id)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
  })

  it('keeps structural Up separate from chronological Back and clears Forward on divergence', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const middle = block('Middle', outer.id)
    const inner = block('Inner', middle.id)
    const { editor } = fakeEditor([outer, middle, inner])

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, middle.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(stepOutOfDepthScope(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(middle.id)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(inner.id)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(middle.id)
    expect(getDepthNavigationSnapshot(editor).canGoForward).toBe(true)
    expect(stepToDepthAncestor(editor, outer.id)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
    expect(getDepthNavigationSnapshot(editor).canGoForward).toBe(false)
    expect(goForwardInDepthHistory(editor)).toBe(false)
  })

  it('skips a deleted history target and preserves the root camera snapshot', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor } = fakeEditor([outer, inner])
    const rootCamera = { ...editor.getCamera() }

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
    ;(editor.getShape as ReturnType<typeof vi.fn>).mockImplementation((id: TLShape['id']) => id === inner.id ? undefined : outer)
    expect(goForwardInDepthHistory(editor)).toBe(false)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(editor.setCamera).toHaveBeenCalledWith(rootCamera, expect.any(Object))
  })

  it('records the settled target camera for immediate navigation, not an animation sample', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor, camera } = fakeEditor([outer, inner])
    const root = { ...camera() }

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    const outerTarget = focusCamera()
    expect(camera()).toMatchObject(outerTarget)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(camera()).toMatchObject(outerTarget)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(camera()).toMatchObject(root)
    expect(goForwardInDepthHistory(editor)).toBe(true)
    expect(camera()).toMatchObject(outerTarget)
  })

  it('prunes locations whose containing Block collapses or whose ancestry is deleted', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor } = fakeEditor([outer, inner])

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    outer.props = setBlockViewProps(outer.props, 'simple')
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(goBackInDepthHistory(editor)).toBe(false)
    outer.props = setBlockViewProps(outer.props, 'expanded')
    expect(goForwardInDepthHistory(editor)).toBe(false)
  })

  it('does not punch through an orphaned ancestor while restoring history', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor } = fakeEditor([outer, inner])

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    ;(editor.getShape as ReturnType<typeof vi.fn>).mockImplementation((id: TLShape['id']) => id === inner.id ? inner : undefined)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(goBackInDepthHistory(editor)).toBe(false)
  })

  it('keeps one root camera lineage through root, Forward, and structural Up', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const { editor, camera } = fakeEditor([outer, inner])
    const root = { ...camera() }

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(camera()).toMatchObject(root)
    expect(goForwardInDepthHistory(editor)).toBe(true)
    expect(stepOutOfDepthScope(editor)).toBe(true)
    expect(camera()).toMatchObject(root)
  })

  it('routes an Overview target outside an isolation scope through one history hop', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const inner = block('Inner', outer.id)
    const landmark = block('Landmark', TEST_PAGE_ID, 'simple')
    const { editor } = fakeEditor([outer, inner, landmark])

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(stepIntoDepthScope(editor, inner.id)).toBe(true)
    expect(focusDepthOverviewTarget(editor, { id: landmark.id, pageId: TEST_PAGE_ID, kind: 'branch' })).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(editor.getSelectedShapeIds()).toEqual([landmark.id])
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(inner.id)
  })

  it('keeps Overview Expanded Blocks at root scope so siblings remain visible until explicit Step In', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const sibling = block('Sibling', TEST_PAGE_ID)
    const { editor } = fakeEditor([outer, sibling])

    expect(focusDepthOverviewTarget(editor, { id: outer.id, pageId: TEST_PAGE_ID, kind: 'expanded-block' })).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(editor.getSelectedShapeIds()).toEqual([outer.id])
    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
  })

  it('clears an old page scope in the page-focus transaction before the new page is visible', () => {
    const outer = block('Outer', TEST_PAGE_ID)
    const pageB = 'page:runtime' as TLPageId
    const { editor } = fakeEditor([outer], [
      { id: TEST_PAGE_ID, name: 'Architecture' },
      { id: pageB, name: 'Runtime' },
    ])

    expect(stepIntoDepthScope(editor, outer.id)).toBe(true)
    expect(focusDepthOverviewPage(editor, pageB)).toBe(true)
    expect(editor.getCurrentPageId()).toBe(pageB)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBeNull()
    expect(goBackInDepthHistory(editor)).toBe(true)
    expect(getDepthNavigationSnapshot(editor).scopeId).toBe(outer.id)
  })
})
