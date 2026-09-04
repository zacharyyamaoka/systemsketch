import {
  createShapeId,
  type Editor,
  type TLFrameShape,
  type TLPage,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { storedTextOr } from './textFidelity'

const FRAME_PADDING = 64
const FRAME_GAP = 160
const MIN_FRAME_WIDTH = 720
const MIN_FRAME_HEIGHT = 480
const IMPORTED_PAGE_KIND = 'imported-page'

interface PageFramePlan {
  page: TLPage
  frameId: TLShapeId
  rootIds: TLShapeId[]
  initial: { x: number; y: number }
  destination: { x: number; y: number }
  w: number
  h: number
}

export interface SinglePageConsolidation {
  changed: boolean
  pageCountBefore: number
  frameIds: TLShapeId[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A stock Frame that preserves the boundary of one imported tldraw page. */
export function isImportedPageFrame(shape: TLShape | undefined): shape is TLFrameShape {
  if (shape?.type !== 'frame') return false
  const systemSketch = isObject(shape.meta.systemSketch) ? shape.meta.systemSketch : null
  return systemSketch?.kind === IMPORTED_PAGE_KIND
}

function initialFrameForPage(editor: Editor, page: TLPage, rootIds: TLShapeId[]) {
  const bounds = editor.getShapesPageBounds(rootIds)
  const contentW = bounds?.w ?? 0
  const contentH = bounds?.h ?? 0
  const w = Math.max(MIN_FRAME_WIDTH, contentW + FRAME_PADDING * 2)
  const h = Math.max(MIN_FRAME_HEIGHT, contentH + FRAME_PADDING * 2)
  return {
    page,
    frameId: createShapeId(),
    rootIds,
    initial: {
      x: bounds ? bounds.x - (w - contentW) / 2 : 0,
      y: bounds ? bounds.y - (h - contentH) / 2 : 0,
    },
    destination: { x: 0, y: 0 },
    w,
    h,
  } satisfies PageFramePlan
}

function arrangePageFrames(plans: PageFramePlan[]): void {
  const columns = Math.max(1, Math.ceil(Math.sqrt(plans.length)))
  let x = 0
  let y = 0
  let rowHeight = 0
  plans.forEach((plan, index) => {
    if (index > 0 && index % columns === 0) {
      x = 0
      y += rowHeight + FRAME_GAP
      rowHeight = 0
    }
    plan.destination = { x, y }
    x += plan.w + FRAME_GAP
    rowHeight = Math.max(rowHeight, plan.h)
  })
}

function translatedAnchor(anchor: unknown, frame: PageFramePlan): unknown {
  if (!isObject(anchor)) return anchor
  const dx = frame.destination.x - frame.initial.x
  const dy = frame.destination.y - frame.initial.y
  if (anchor.type === 'page') {
    return {
      type: 'shape',
      shapeId: frame.frameId,
      x: 1,
      y: 0,
      isPrecise: false,
    }
  }
  if ((anchor.type === 'point' || anchor.type === 'region')
    && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
    return { ...anchor, x: anchor.x + dx, y: anchor.y + dy }
  }
  return anchor
}

/** Keep comment records attached when their former page becomes a Frame. */
function relocatePageRecords(
  editor: Editor,
  plans: PageFramePlan[],
  rootPageId: TLPageId,
): void {
  const byPage = new Map(plans.map((plan) => [plan.page.id, plan]))
  const records = editor.store.allRecords() as unknown as Array<Record<string, unknown>>
  const replacements = records.flatMap((record) => {
    if (
      record.typeName !== 'comment-thread'
      && record.typeName !== 'comment'
      && record.typeName !== 'comment-reaction'
    ) return []
    const candidate = record as unknown as Record<string, unknown>
    const frame = typeof candidate.pageId === 'string'
      ? byPage.get(candidate.pageId as TLPageId)
      : undefined
    if (!frame) return []
    return [{
      ...candidate,
      pageId: rootPageId,
      ...(candidate.typeName === 'comment-thread'
        ? { anchor: translatedAnchor(candidate.anchor, frame) }
        : {}),
    }]
  })
  if (replacements.length === 0) return
  const store = editor.store as unknown as {
    put(records: Array<Record<string, unknown>>): void
  }
  store.put(replacements)
}

/**
 * Replace a loaded multi-page document with one canvas containing one stock
 * Frame per former page.
 *
 * This runs immediately after tldraw has parsed the document and before
 * autosave / host listeners attach. It is therefore an import migration, not
 * an undoable user edit, and a protected source file remains untouched.
 */
export function consolidateDocumentToSinglePage(editor: Editor): SinglePageConsolidation {
  const pages = [...editor.getPages()].sort((left, right) => (
    String(left.index).localeCompare(String(right.index))
    || String(left.id).localeCompare(String(right.id))
  ))
  if (pages.length <= 1) {
    return { changed: false, pageCountBefore: pages.length, frameIds: [] }
  }

  const rootPage = pages[0]
  const plans = pages.map((page) => initialFrameForPage(
    editor,
    page,
    [...editor.getSortedChildIdsForParent(page.id)],
  ))
  arrangePageFrames(plans)

  const wasReadonly = editor.getIsReadonly()
  if (wasReadonly) editor.updateInstanceState({ isReadonly: false })
  try {
    editor.store.mergeRemoteChanges(() => {
      editor.run(() => {
        editor.setCurrentPage(rootPage.id)
        for (const plan of plans) {
          editor.createShape<TLFrameShape>({
            id: plan.frameId,
            type: 'frame',
            parentId: rootPage.id,
            x: plan.initial.x,
            y: plan.initial.y,
            props: {
              w: plan.w,
              h: plan.h,
              name: storedTextOr(plan.page.name, 'Untitled'),
              color: 'black',
            },
            meta: {
              systemSketch: {
                kind: IMPORTED_PAGE_KIND,
                sourcePageId: plan.page.id,
                sourcePageName: plan.page.name,
                sourcePageIndex: String(plan.page.index),
              },
            },
          })
        }
        for (const plan of plans) {
          if (plan.rootIds.length > 0) editor.reparentShapes(plan.rootIds, plan.frameId)
          editor.updateShape<TLFrameShape>({
            id: plan.frameId,
            type: 'frame',
            x: plan.destination.x,
            y: plan.destination.y,
          })
        }
        relocatePageRecords(editor, plans, rootPage.id)
        for (const page of pages.slice(1)) editor.deletePage(page.id)
        editor.setCurrentPage(rootPage.id)
        editor.selectNone()
        editor.zoomToFit({ animation: { duration: 0 } })
      }, { history: 'ignore' })
    })
  } finally {
    if (wasReadonly) editor.updateInstanceState({ isReadonly: true })
  }

  return {
    changed: true,
    pageCountBefore: pages.length,
    frameIds: plans.map((plan) => plan.frameId),
  }
}
