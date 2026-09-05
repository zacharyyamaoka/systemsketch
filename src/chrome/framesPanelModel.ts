import type { Editor, TLPage } from 'tldraw'
import { getBoardLandmarkState, type BoardLandmark } from '../landmarks/boardLandmarks'
import { getBoardOverviewModel, type BoardOverviewTarget } from './boardOverviewModel'

export const FRAMES_PANEL_ORDER_META_KEY = 'systemSketchFramesPanelOrder'
const FRAMES_PANEL_ORDER_VERSION = 1

export type FramesPanelItem =
  | { key: `shape:${string}`; kind: 'target'; target: BoardOverviewTarget }
  | { key: `landmark:${string}`; kind: 'landmark'; landmark: BoardLandmark }

export type FramesPanelOrderState = { kind: 'ready'; order: string[] } | { kind: 'protected' }
export type FramesPanelDropPosition = 'before' | 'after'

export interface FramesPanelBox { x: number; y: number; w: number; h: number }
export interface FramesPanelPreview {
  /** The local target bounds, or the page area visible through a saved camera. */
  viewport: FramesPanelBox
  /** Page shapes intersecting that local view. */
  shapes: FramesPanelBox[]
}

function readOrder(page: TLPage): FramesPanelOrderState {
  const value = (page.meta as Record<string, unknown>)[FRAMES_PANEL_ORDER_META_KEY]
  if (value === undefined) return { kind: 'ready', order: [] }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { kind: 'protected' }
  const candidate = value as { version?: unknown; order?: unknown }
  if (candidate.version !== FRAMES_PANEL_ORDER_VERSION || !Array.isArray(candidate.order)
    || candidate.order.some((key) => typeof key !== 'string')
    || new Set(candidate.order).size !== candidate.order.length) return { kind: 'protected' }
  return { kind: 'ready', order: candidate.order }
}

function ordered<T extends { key: string }>(items: T[], keys: readonly string[]): T[] {
  const positions = new Map(keys.map((key, index) => [key, index]))
  return [...items].sort((a, b) => (positions.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.key) ?? Number.MAX_SAFE_INTEGER))
}

/** A current-page navigation list; camera poses already belong to this page. */
export function getFramesPanelModel(editor: Editor): { items: FramesPanelItem[]; orderState: FramesPanelOrderState; landmarksProtected: boolean } {
  const pageId = editor.getCurrentPageId(); const page = editor.getCurrentPage(); const overview = getBoardOverviewModel(editor)
  const targets = overview.pages.find((entry) => entry.id === pageId)?.targets ?? []
  const landmarkState = getBoardLandmarkState(editor, pageId)
  const landmarks = landmarkState.kind === 'ready' ? landmarkState.landmarks : []
  const items: FramesPanelItem[] = [
    ...targets.map((target) => ({ key: `shape:${target.id}` as const, kind: 'target' as const, target })),
    ...landmarks.map((landmark) => ({ key: `landmark:${landmark.id}` as const, kind: 'landmark' as const, landmark })),
  ]
  const orderState = readOrder(page)
  return {
    // WHY: frames and landmarks share navigation intent, while the landmark
    // icon preserves its camera distinction instead of splitting the panel.
    items: orderState.kind === 'ready' ? ordered(items, orderState.order) : items,
    orderState,
    landmarksProtected: landmarkState.kind !== 'ready',
  }
}

function intersects(a: FramesPanelBox, b: FramesPanelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Build every card's preview in one store read.  A saved camera is converted
 * to the page-space viewport tldraw would show: camera x/y are already page
 * translations, while screen dimensions scale by z.
 */
export function getFramesPanelPreviews(editor: Editor, items: readonly FramesPanelItem[]): Map<string, FramesPanelPreview> {
  const pageId = editor.getCurrentPageId()
  const shapes = [...editor.getPageShapeIds(pageId)]
    .map((id) => editor.getShapePageBounds(id))
    .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
    .map(({ x, y, w, h }) => ({ x, y, w, h }))
  const screen = editor.getViewportScreenBounds()
  return new Map(items.map((item) => {
    const viewport = item.kind === 'landmark'
      ? { x: -item.landmark.camera.x, y: -item.landmark.camera.y, w: screen.w / item.landmark.camera.z, h: screen.h / item.landmark.camera.z }
      : (() => {
          const bounds = editor.getShapePageBounds(item.target.id)
          return bounds ? { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } : { x: 0, y: 0, w: 1, h: 1 }
        })()
    return [item.key, { viewport, shapes: shapes.filter((shape) => intersects(shape, viewport)) }]
  }))
}

/** Return a complete, duplicate-free order or null when a drag is stale. */
export function moveFramesPanelItemKey(
  currentKeys: readonly string[],
  sourceKey: string,
  targetKey: string,
  position: FramesPanelDropPosition,
): string[] | null {
  if (new Set(currentKeys).size !== currentKeys.length || sourceKey === targetKey) return null
  const source = currentKeys.indexOf(sourceKey)
  const target = currentKeys.indexOf(targetKey)
  if (source < 0 || target < 0) return null
  const next = [...currentKeys]
  next.splice(source, 1)
  const nextTarget = next.indexOf(targetKey)
  next.splice(nextTarget + (position === 'after' ? 1 : 0), 0, sourceKey)
  return next
}

/**
 * Single-page import keeps a known shape order when every source is readable.
 * Landmark ids can be collision-renamed by their migration, so those entries
 * intentionally fall back to the end of the merged list rather than pointing
 * at a different saved camera. An opaque source order stays on its imported
 * Frame metadata and blocks a root rewrite.
 */
export function mergeImportedFramesPanelOrder(rootPage: TLPage, pages: readonly TLPage[]): TLPage['meta'] | null {
  const sources = pages.filter((page) => page.id !== rootPage.id)
  const hasOrder = pages.some((page) => Object.hasOwn(page.meta as object, FRAMES_PANEL_ORDER_META_KEY))
  if (!hasOrder) return null
  const states = pages.map(readOrder)
  if (states.some((state) => state.kind !== 'ready')) return null
  const order = states.flatMap((state) => state.kind === 'ready' ? state.order.filter((key) => key.startsWith('shape:')) : [])
  const uniqueOrder = [...new Set(order)]
  // Do not write when only removed source pages declared an empty order.
  if (sources.length === 0) return null
  return { ...rootPage.meta, [FRAMES_PANEL_ORDER_META_KEY]: { version: FRAMES_PANEL_ORDER_VERSION, order: uniqueOrder } as unknown as TLPage['meta'][string] }
}

/** Persist only the order projection: Frame records remain owned by tldraw. */
export function reorderFramesPanelItems(editor: Editor, orderedKeys: readonly string[]): boolean {
  if (editor.getIsReadonly()) return false
  const page = editor.getCurrentPage()
  if (readOrder(page).kind !== 'ready') return false
  const actualKeys = getFramesPanelModel(editor).items.map((item) => item.key)
  if (orderedKeys.length !== actualKeys.length || new Set(orderedKeys).size !== orderedKeys.length
    || orderedKeys.some((key) => !actualKeys.includes(key as FramesPanelItem['key']))) return false
  editor.markHistoryStoppingPoint('reorder frames panel')
  editor.updatePage({ id: page.id, meta: { ...page.meta,
    [FRAMES_PANEL_ORDER_META_KEY]: { version: FRAMES_PANEL_ORDER_VERSION, order: [...orderedKeys] } as unknown as TLPage['meta'][string] } })
  return true
}
