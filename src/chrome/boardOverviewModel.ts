import {
  type Editor,
  type TLFrameShape,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { isExpandedBlockShape } from '../blocks'
import { isBranchShape } from '../branch/branchModel'
import { storedTextOr } from '../textFidelity'
import { focusDepthOverviewTarget } from '../depth/depthNavigation'

export type BoardOverviewTargetKind = 'frame' | 'branch' | 'expanded-block'

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
      label: storedTextOr(frame.props.name, 'Untitled frame'),
      selected: selectedIds.has(frame.id),
    }
  }
  if (isBranchShape(shape)) {
    return {
      id: shape.id,
      pageId,
      kind: 'branch',
      label: storedTextOr(shape.props.title, 'Untitled Branch'),
      selected: selectedIds.has(shape.id),
    }
  }
  if (isExpandedBlockShape(shape)) {
    return {
      id: shape.id,
      pageId,
      kind: 'expanded-block',
      label: storedTextOr(shape.props.title, 'Untitled Block'),
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
      name: storedTextOr(page.name, 'Untitled page'),
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
  // WHY: Overview is a flat landmark index, but its jumps must respect the
  // current isolation boundary. The shared transaction makes an outside
  // target visible and keeps Back/Forward coherent instead of bypassing depth.
  return focusDepthOverviewTarget(editor, target)
}
