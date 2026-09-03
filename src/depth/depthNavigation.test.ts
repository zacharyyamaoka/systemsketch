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
  returnToDepthRoot,
  stepIntoDepthScope,
  stepOutOfDepthScope,
  stepToDepthAncestor,
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

function fakeEditor(shapes: BlockShape[]) {
  const page = { id: TEST_PAGE_ID, name: 'Robot sorter' }
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
    while (current && current.parentId !== page.id) {
      current = byId.get(current.parentId as TLShape['id'])
      if (current) result.push(current)
    }
    return result.reverse()
  }
  const editor = {
    getShape: (id: TLShape['id']) => byId.get(id),
    getShapeAncestors: (shape: TLShape | TLShape['id']) => ancestors(
      typeof shape === 'string' ? byId.get(shape)! : shape,
    ),
    getAncestorPageId: () => page.id,
    getCurrentPageId: () => page.id,
    getCurrentPage: () => page,
    getShapePageBounds: () => ({ x: 10, y: 20, w: 560, h: 380 }),
    getCamera: () => camera,
    setCamera: vi.fn((next: TLCamera) => { camera = next }),
    zoomToBounds: vi.fn(),
    zoomToFit: vi.fn(),
    setCurrentTool: vi.fn(),
    selectNone: vi.fn(),
  } as unknown as Editor
  return { editor, camera: () => camera }
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
    expect(editor.setCamera).toHaveBeenCalledWith(
      rootCamera,
      expect.objectContaining({ animation: expect.any(Object) }),
    )
  })
})
