import { describe, expect, it, vi } from 'vitest'
import {
  type Editor,
  type TLPage,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import {
  focusBoardOverviewPage,
  focusBoardOverviewTarget,
  getBoardOverviewModel,
} from './boardOverviewModel'

const PAGE_A = 'page:architecture' as TLPageId
const PAGE_B = 'page:runtime' as TLPageId

function shape(
  id: string,
  type: 'frame' | 'branch' | 'block' | 'geo',
  pageId: TLPageId,
  props: Record<string, unknown>,
  index: string,
): TLShape {
  return {
    id: `shape:${id}` as TLShapeId,
    typeName: 'shape',
    type,
    parentId: pageId,
    index,
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props,
  } as unknown as TLShape
}

function overviewEditor() {
  const pages = [
    { id: PAGE_A, name: 'Architecture', index: 'a1' },
    { id: PAGE_B, name: 'Runtime', index: 'a2' },
  ] as TLPage[]
  const shapes = [
    shape('collapsed', 'block', PAGE_A, { view: 'simple', title: 'Collapsed' }, 'a1'),
    shape('frame', 'frame', PAGE_A, { name: 'Pipeline Frame' }, 'a2'),
    shape('expanded', 'block', PAGE_A, { view: 'expanded', title: 'Scheduler' }, 'a3'),
    shape('verbatim-frame', 'frame', PAGE_B, { name: ' frame_name ' }, 'a1'),
    shape('blank-block', 'block', PAGE_B, { view: 'expanded', title: '' }, 'a2'),
    shape('decision', 'branch', PAGE_B, { title: 'Retry policy' }, 'a3'),
    shape('rectangle', 'geo', PAGE_B, { geo: 'rectangle' }, 'a4'),
  ]
  const byId = new Map(shapes.map((item) => [item.id, item]))
  const byPage = new Map([
    [PAGE_A, new Set(shapes.filter((item) => item.parentId === PAGE_A).map((item) => item.id))],
    [PAGE_B, new Set(shapes.filter((item) => item.parentId === PAGE_B).map((item) => item.id))],
  ])
  let currentPageId = PAGE_A
  let selection: TLShapeId[] = [shapes[2].id]
  const camera = { id: 'camera:page:architecture' as const, typeName: 'camera' as const, x: 0, y: 0, z: 1, meta: {} }
  const editor = {
    getPages: () => pages,
    getPage: (id: TLPageId) => pages.find((page) => page.id === id),
    getCurrentPageId: () => currentPageId,
    getCurrentPage: () => pages.find((page) => page.id === currentPageId)!,
    getSelectedShapeIds: () => selection,
    getPageShapeIds: (page: TLPageId | TLPage) => byPage.get(typeof page === 'string' ? page : page.id) ?? new Set(),
    getShape: (id: TLShapeId) => byId.get(id),
    getAncestorPageId: (candidate: TLShape) => candidate.parentId as TLPageId,
    setCurrentPage: vi.fn((next: TLPageId) => { currentPageId = next }),
    setCurrentTool: vi.fn(),
    select: vi.fn((...ids: TLShapeId[]) => { selection = ids }),
    selectNone: vi.fn(() => { selection = [] }),
    getCamera: () => camera,
    setCamera: vi.fn(),
    getShapePageBounds: vi.fn(() => ({ x: 20, y: 30, w: 400, h: 260 })),
    zoomToBounds: vi.fn(),
    zoomToFit: vi.fn(),
  } as unknown as Editor
  return { editor, shapes }
}

describe('live board overview', () => {
  it('projects every page, Frame, Branch, and Expanded Block without unrelated shapes', () => {
    const { editor } = overviewEditor()
    const model = getBoardOverviewModel(editor)

    expect(model.targetCount).toBe(5)
    expect(model.pages.map((page) => [page.name, page.current])).toEqual([
      ['Architecture', true],
      ['Runtime', false],
    ])
    expect(model.pages[0].targets.map((target) => [target.kind, target.label, target.selected]))
      .toEqual([
        ['frame', 'Pipeline Frame', false],
        ['expanded-block', 'Scheduler', true],
      ])
    expect(model.pages[1].targets.map((target) => target.label))
      .toEqual([' frame_name ', 'Untitled Block', 'Retry policy'])
  })

  it('selects and camera-fits a target after switching to its page', () => {
    const { editor } = overviewEditor()
    const target = getBoardOverviewModel(editor).pages[1].targets.find(({ kind }) => kind === 'branch')!
    expect(focusBoardOverviewTarget(editor, target)).toBe(true)
    expect(editor.setCurrentPage).toHaveBeenCalledWith(PAGE_B)
    expect(editor.setCurrentTool).toHaveBeenCalledWith('select')
    expect(editor.select).toHaveBeenCalledWith(target.id)
    expect(editor.zoomToBounds).toHaveBeenCalledWith(
      { x: 20, y: 30, w: 400, h: 260 },
      { inset: 84, animation: { duration: 260 } },
    )
  })

  it('opens and fits a page while clearing a stale selection', () => {
    const { editor } = overviewEditor()
    expect(focusBoardOverviewPage(editor, PAGE_B)).toBe(true)
    expect(editor.setCurrentPage).toHaveBeenCalledWith(PAGE_B)
    expect(editor.selectNone).toHaveBeenCalledOnce()
    expect(editor.zoomToFit).toHaveBeenCalledWith({ animation: { duration: 220 } })
  })
})
