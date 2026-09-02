import {
  type Editor,
  type TLFrameShape,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { isExpandedBlockShape } from '../blocks'

export type BoardOverviewTargetKind = 'frame' | 'expanded-block'

export interface BoardOverviewTarget {
  id: TLShapeId
  pageId: TLPageId
  kind: BoardOverviewTargetKind
  label: string
  selected: boolean
}

export interface BoardOverviewPage {
  id: TLPageId
  name: string
  current: boolean
  targets: BoardOverviewTarget[]
}

export interface BoardOverviewModel {
  pages: BoardOverviewPage[]
  targetCount: number
}

function targetForShape(
  shape: TLShape,
  pageId: TLPageId,
  selectedIds: Set<TLShapeId>,
): BoardOverviewTarget | null {
  if (shape.type === 'frame') {
    const frame = shape as TLFrameShape
    return {
      id: frame.id,
      pageId,
      kind: 'frame',
      label: frame.props.name.trim() || 'Untitled frame',
      selected: selectedIds.has(frame.id),
    }
  }
  if (isExpandedBlockShape(shape)) {
    return {
      id: shape.id,
      pageId,
      kind: 'expanded-block',
      label: shape.props.title.trim() || 'Untitled Block',
      selected: selectedIds.has(shape.id),
    }
  }
  return null
}

/** A live, read-only projection of the editor's page and frame-like records. */
export function getBoardOverviewModel(editor: Editor): BoardOverviewModel {
  const currentPageId = editor.getCurrentPageId()
  const selectedIds = new Set(editor.getSelectedShapeIds())
  let targetCount = 0
  const pages = editor.getPages().map((page) => {
    const shapes = [...editor.getPageShapeIds(page)]
      .map((id) => editor.getShape(id))
      .filter((shape): shape is TLShape => Boolean(shape))
      .sort((a, b) => String(a.index).localeCompare(String(b.index)))
    const targets = shapes
      .map((shape) => targetForShape(shape, page.id, selectedIds))
      .filter((target): target is BoardOverviewTarget => Boolean(target))
    targetCount += targets.length
    return {
      id: page.id,
      name: page.name.trim() || 'Untitled page',
      current: page.id === currentPageId,
      targets,
    }
  })
  return { pages, targetCount }
}

const CAMERA_ANIMATION = { duration: 220 }

export function focusBoardOverviewPage(editor: Editor, pageId: TLPageId): boolean {
  if (!editor.getPage(pageId)) return false
  editor.setCurrentPage(pageId)
  editor.setCurrentTool('select')
  editor.selectNone()
  editor.zoomToFit({ animation: CAMERA_ANIMATION })
  return true
}

export function focusBoardOverviewTarget(editor: Editor, target: BoardOverviewTarget): boolean {
  if (!editor.getPage(target.pageId) || !editor.getShape(target.id)) return false
  editor.setCurrentPage(target.pageId)
  editor.setCurrentTool('select')
  editor.select(target.id)
  const bounds = editor.getShapePageBounds(target.id)
  if (!bounds) return false
  editor.zoomToBounds(bounds, { inset: 72, animation: CAMERA_ANIMATION })
  return true
}
