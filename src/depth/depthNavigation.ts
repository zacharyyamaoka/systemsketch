import { atom, isShapeId, type Atom, type Editor, type TLCamera, type TLPageId, type TLShapeId } from 'tldraw'

import { isBlockShape, isExpandedBlockShape, type BlockShape } from '../blocks/blockModel'
import { storedTextOr } from '../textFidelity'

const CAMERA_INSET = 84
const CAMERA_DURATION_MS = 260

export interface DepthNavigationSnapshot {
  scopeId: TLShapeId | null
  canGoBack: boolean
  canGoForward: boolean
}

export interface DepthPathEntry {
  id: TLShapeId
  name: string
  depth: number
  canFocus: boolean
  isCurrent: boolean
}

export interface DepthNavigationModel {
  pageId: TLPageId
  pageName: string
  current: BlockShape | null
  entries: DepthPathEntry[]
  depth: number
  parent: DepthPathEntry | null
}

interface DepthHistoryEntry {
  pageId: TLPageId
  scopeId: TLShapeId | null
  camera: TLCamera
  selectionIds: TLShapeId[]
}

interface DepthNavigationStore {
  scopeId: Atom<TLShapeId | null>
  snapshot: DepthNavigationSnapshot
  listeners: Set<() => void>
  rootCamera: TLCamera | null
  rootPageId: TLPageId | null
  history: DepthHistoryEntry[]
  historyIndex: number
  lastCameraTransactionAt: number
}

const stores = new WeakMap<Editor, DepthNavigationStore>()

function storeFor(editor: Editor): DepthNavigationStore {
  let store = stores.get(editor)
  if (!store) {
    store = {
      scopeId: atom('SystemSketch depth scope', null),
      snapshot: { scopeId: null, canGoBack: false, canGoForward: false },
      listeners: new Set(),
      rootCamera: null,
      rootPageId: null,
      history: [],
      historyIndex: -1,
      lastCameraTransactionAt: 0,
    }
    stores.set(editor, store)
  }
  return store
}

function publish(editor: Editor, scopeId: TLShapeId | null): void {
  const store = storeFor(editor)
  store.scopeId.set(scopeId)
  store.snapshot = {
    scopeId,
    canGoBack: store.historyIndex > 0,
    canGoForward: store.historyIndex >= 0 && store.historyIndex < store.history.length - 1,
  }
  for (const listener of store.listeners) listener()
}

function blockName(block: BlockShape): string {
  return storedTextOr(block.props.title, 'Untitled Block')
}

/**
 * Return the real, unbroken containment chain for a depth scope.
 *
 * WHY: a scope is an isolation boundary, not just a convenient shape id. A
 * deleted/orphaned parent or a collapsed enclosing Block must invalidate the
 * whole location; otherwise history could reveal children through a boundary
 * the canvas is deliberately hiding.
 */
function blockPath(editor: Editor, scopeId: TLShapeId): BlockShape[] | null {
  const current = editor.getShape(scopeId)
  if (!isExpandedBlockShape(current)) return null
  const pageId = editor.getAncestorPageId(current)
  if (!pageId || !editor.getPage(pageId)) return null
  const blocks: BlockShape[] = [current]
  const seen = new Set<TLShapeId>([current.id])
  let child: NonNullable<ReturnType<Editor['getShape']>> = current
  while (child.parentId !== pageId) {
    if (!isShapeId(child.parentId) || seen.has(child.parentId)) return null
    const parent: NonNullable<ReturnType<Editor['getShape']>> | undefined = editor.getShape(child.parentId)
    if (!parent) return null
    if (isBlockShape(parent)) {
      if (!isExpandedBlockShape(parent)) return null
      blocks.unshift(parent)
    }
    seen.add(parent.id)
    child = parent
  }
  return blocks
}

function copyCamera(camera: TLCamera): TLCamera {
  return { ...camera }
}

function sameCamera(left: TLCamera, right: TLCamera): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z
}

/** Calculate tldraw's zoom-to-bounds destination before starting animation. */
function cameraForBounds(editor: Editor, bounds: { x: number; y: number; w: number; h: number }): TLCamera | null {
  // The narrow fallback preserves compatibility with the small unit harness;
  // real tldraw always supplies these public camera APIs.
  if (!editor.getViewportScreenBounds || !editor.getCameraOptions || !editor.getBaseZoom) return null
  const viewport = editor.getViewportScreenBounds()
  if (bounds.w <= 0 || bounds.h <= 0) return null
  const options = editor.getCameraOptions()
  const steps = options.zoomSteps
  const baseZoom = editor.getBaseZoom()
  const minimum = steps[0] * baseZoom
  const maximum = steps[steps.length - 1] * baseZoom
  const rawZoom = Math.min((viewport.width - CAMERA_INSET) / bounds.w, (viewport.height - CAMERA_INSET) / bounds.h)
  const z = Math.max(minimum, Math.min(maximum, rawZoom))
  const current = editor.getCamera()
  return {
    ...copyCamera(current),
    x: -bounds.x + (viewport.width - bounds.w * z) / 2 / z,
    y: -bounds.y + (viewport.height - bounds.h * z) / 2 / z,
    z,
  }
}

function pageCamera(editor: Editor): TLCamera | null {
  const bounds = editor.getCurrentPageBounds?.()
  return bounds ? cameraForBounds(editor, bounds) : null
}

/**
 * Set a known target in one call. `setCamera` cancels the prior animation, so
 * rapid Back/Forward/crumb actions never leave history holding a 260 ms tween
 * sample as though it were a settled location.
 */
function moveCamera(editor: Editor, target: TLCamera | null, fallback: () => void): TLCamera {
  if (!target) {
    fallback()
    return copyCamera(editor.getCamera())
  }
  editor.setCamera(copyCamera(target), { animation: { duration: CAMERA_DURATION_MS } })
  return target
}

function captureLocation(editor: Editor): DepthHistoryEntry {
  const store = storeFor(editor)
  const pageId = editor.getCurrentPageId()
  const scopeId = store.scopeId.get()
  return {
    pageId,
    scopeId: scopeId && blockPath(editor, scopeId) ? scopeId : null,
    camera: copyCamera(editor.getCamera()),
    selectionIds: [...editor.getSelectedShapeIds()],
  }
}

function sameLocation(left: DepthHistoryEntry, right: DepthHistoryEntry): boolean {
  return left.pageId === right.pageId && left.scopeId === right.scopeId
}

function locationIsValid(editor: Editor, location: DepthHistoryEntry): boolean {
  if (!editor.getPage(location.pageId)) return false
  if (!location.scopeId) return true
  const scope = editor.getShape(location.scopeId)
  return Boolean(
    isExpandedBlockShape(scope)
    && editor.getAncestorPageId(scope) === location.pageId
    && blockPath(editor, location.scopeId),
  )
}

/** Remove invalid entries before either UI or visibility consumes the scope. */
function reconcileDepthNavigation(editor: Editor): DepthNavigationStore {
  const store = storeFor(editor)
  const prior = store.history
  const priorIndex = store.historyIndex
  const validWithIndices = prior
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => locationIsValid(editor, entry))
  const scopeId = store.scopeId.get()
  const activeLocation = scopeId ? {
    pageId: editor.getCurrentPageId(), scopeId, camera: copyCamera(editor.getCamera()), selectionIds: [],
  } : null
  const activeIsValid = !activeLocation || locationIsValid(editor, activeLocation)
  let changed = validWithIndices.length !== prior.length
  if (!activeIsValid) {
    store.scopeId.set(null)
    changed = true
  }
  if (changed) {
    store.history = validWithIndices.map(({ entry }) => entry)
    const previousIndex = validWithIndices.findIndex(({ index }) => index === priorIndex)
    store.historyIndex = previousIndex >= 0
      ? previousIndex
      : Math.max(0, validWithIndices.filter(({ index }) => index < priorIndex).length - 1)
    if (store.history.length === 0) {
      store.history = [captureLocation(editor)]
      store.historyIndex = 0
    }
    publish(editor, store.scopeId.get())
  }
  return store
}

function ensureHistoryAtCurrentLocation(editor: Editor): DepthNavigationStore {
  const store = reconcileDepthNavigation(editor)
  const current = captureLocation(editor)
  const recorded = store.history[store.historyIndex]
  if (!recorded || !sameLocation(recorded, current)) {
    // WHY: history is intentionally session-local and must never turn a page
    // switch made outside our chrome into a surprise cross-page "Back" jump.
    store.history = [current]
    store.historyIndex = 0
  } else {
    // Camera animations are visual only. Keep the transaction's known target
    // unless a person genuinely moved the root camera between lineages.
    store.history[store.historyIndex] = {
      ...recorded,
      selectionIds: current.selectionIds,
    }
  }
  return store
}

function recordNavigation(editor: Editor, previous: DepthHistoryEntry, destination: DepthHistoryEntry): void {
  const store = storeFor(editor)
  store.history[store.historyIndex] = previous
  store.history = [...store.history.slice(0, store.historyIndex + 1), destination]
  store.historyIndex = store.history.length - 1
  store.lastCameraTransactionAt = Date.now()
  publish(editor, destination.scopeId)
}

function selectionVisibleAt(editor: Editor, id: TLShapeId, location: DepthHistoryEntry): boolean {
  const shape = editor.getShape(id)
  if (!shape || editor.getAncestorPageId(shape) !== location.pageId) return false
  if (!location.scopeId || id === location.scopeId) return true
  return editor.getShapeAncestors(shape).some((ancestor) => ancestor.id === location.scopeId)
}

function restoreLocation(editor: Editor, location: DepthHistoryEntry): boolean {
  if (!locationIsValid(editor, location)) return false
  if (editor.getCurrentPageId() !== location.pageId) editor.setCurrentPage(location.pageId)
  editor.setCurrentTool('select')
  storeFor(editor).scopeId.set(location.scopeId)
  const safeSelection = location.selectionIds.filter((id) => selectionVisibleAt(editor, id, location))
  if (safeSelection.length > 0) editor.select(...safeSelection)
  else editor.selectNone()
  moveCamera(editor, location.camera, () => editor.setCamera(copyCamera(location.camera), { animation: { duration: CAMERA_DURATION_MS } }))
  return true
}

function moveToScope(
  editor: Editor,
  pageId: TLPageId,
  scopeId: TLShapeId | null,
  options: { focusShapeId?: TLShapeId; restoreRootCamera?: boolean; selectShapeId?: TLShapeId } = {},
): boolean {
  const prospective: DepthHistoryEntry = {
    pageId,
    scopeId,
    camera: copyCamera(editor.getCamera()),
    selectionIds: [],
  }
  if (!locationIsValid(editor, prospective)) return false

  const store = ensureHistoryAtCurrentLocation(editor)
  const recorded = store.history[store.historyIndex]
  const live = captureLocation(editor)
  const previous = recorded && sameLocation(recorded, live)
    ? { ...recorded, selectionIds: live.selectionIds }
    : live
  if (sameLocation(previous, prospective) && !options.focusShapeId) return false

  if (editor.getCurrentPageId() !== pageId) editor.setCurrentPage(pageId)
  editor.setCurrentTool('select')
  store.scopeId.set(scopeId)
  if (options.selectShapeId) editor.select(options.selectShapeId)
  else editor.selectNone()

  let targetCamera: TLCamera | null = null
  if (options.focusShapeId) {
    const bounds = editor.getShapePageBounds(options.focusShapeId)
    targetCamera = bounds ? cameraForBounds(editor, bounds) : null
    targetCamera = moveCamera(editor, targetCamera, () => {
      if (bounds) editor.zoomToBounds(bounds, { inset: CAMERA_INSET, animation: { duration: CAMERA_DURATION_MS } })
    })
  } else if (!scopeId && options.restoreRootCamera && store.rootPageId === pageId && store.rootCamera) {
    targetCamera = moveCamera(editor, store.rootCamera, () => editor.setCamera(copyCamera(store.rootCamera!), { animation: { duration: CAMERA_DURATION_MS } }))
  } else if (!scopeId) {
    targetCamera = moveCamera(editor, pageCamera(editor), () => editor.zoomToFit({ animation: { duration: CAMERA_DURATION_MS } }))
  } else {
    targetCamera = copyCamera(editor.getCamera())
  }
  recordNavigation(editor, previous, {
    pageId,
    scopeId,
    camera: targetCamera,
    selectionIds: options.selectShapeId ? [options.selectShapeId] : [],
  })
  return true
}

export function getDepthNavigationSnapshot(editor: Editor): DepthNavigationSnapshot {
  return reconcileDepthNavigation(editor).snapshot
}

/** The reactive active scope consumed by canvas visibility computation. */
export function getActiveDepthScopeId(editor: Editor): TLShapeId | null {
  return reconcileDepthNavigation(editor).scopeId.get()
}

export function subscribeDepthNavigation(editor: Editor, listener: () => void): () => void {
  const store = storeFor(editor)
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export function getDepthNavigationModel(editor: Editor, scopeId: TLShapeId | null): DepthNavigationModel | null {
  reconcileDepthNavigation(editor)
  const page = editor.getCurrentPage()
  const rootName = 'Board'
  if (!scopeId) {
    return { pageId: page.id, pageName: rootName, current: null, entries: [], depth: 0, parent: null }
  }
  const blocks = blockPath(editor, scopeId)
  if (!blocks) return null
  const entries = blocks.map<DepthPathEntry>((block, index) => ({
    id: block.id,
    name: blockName(block),
    depth: index + 1,
    canFocus: isExpandedBlockShape(block),
    isCurrent: block.id === scopeId,
  }))
  return {
    pageId: page.id,
    pageName: rootName,
    current: blocks[blocks.length - 1],
    entries,
    depth: entries.length,
    parent: entries.length > 1 ? entries[entries.length - 2] : null,
  }
}

/** Enter a concrete Expanded Block without mutating its shape or parent chain. */
export function stepIntoDepthScope(editor: Editor, shapeId: TLShapeId): boolean {
  const target = editor.getShape(shapeId)
  if (!isExpandedBlockShape(target)) return false
  if (editor.getAncestorPageId(target) !== editor.getCurrentPageId()) return false

  const store = ensureHistoryAtCurrentLocation(editor)
  const active = store.snapshot.scopeId ? getDepthNavigationModel(editor, store.snapshot.scopeId) : null
  if (active?.current) {
    if (active.current.id === target.id) return false
    if (!editor.getShapeAncestors(target).some((ancestor) => ancestor.id === active.current!.id)) return false
  } else if (store.rootPageId !== editor.getCurrentPageId() || !store.rootCamera) {
    store.rootCamera = copyCamera(editor.getCamera())
    store.rootPageId = editor.getCurrentPageId()
  } else if (
    Date.now() - store.lastCameraTransactionAt > CAMERA_DURATION_MS
    && !sameCamera(editor.getCamera(), store.rootCamera)
  ) {
    store.rootCamera = copyCamera(editor.getCamera())
    store.rootPageId = editor.getCurrentPageId()
  }
  return moveToScope(editor, editor.getCurrentPageId(), target.id, { focusShapeId: target.id })
}

/** Jump to a real Expanded-Block ancestor already present in the current path. */
export function stepToDepthAncestor(editor: Editor, shapeId: TLShapeId): boolean {
  const store = storeFor(editor)
  const active = store.snapshot.scopeId ? getDepthNavigationModel(editor, store.snapshot.scopeId) : null
  if (!active?.current || active.current.id === shapeId) return false
  const target = active.entries.find((entry) => entry.id === shapeId)
  if (!target?.canFocus) return false
  return moveToScope(editor, editor.getCurrentPageId(), shapeId, { focusShapeId: shapeId })
}

/** Ascend structurally; this is deliberately separate from chronological Back. */
export function stepOutOfDepthScope(editor: Editor): boolean {
  const store = storeFor(editor)
  const active = store.snapshot.scopeId ? getDepthNavigationModel(editor, store.snapshot.scopeId) : null
  if (!active) return false
  const parent = [...active.entries].slice(0, -1).reverse().find((entry) => entry.canFocus)
  return parent ? stepToDepthAncestor(editor, parent.id) : returnToDepthRoot(editor)
}

/** The shared Step in / Step out action used by every Block command surface. */
export function toggleDepthScope(editor: Editor, shapeId: TLShapeId): boolean {
  return getActiveDepthScopeId(editor) === shapeId ? stepOutOfDepthScope(editor) : stepIntoDepthScope(editor, shapeId)
}

/** Restore the camera that existed before the first step-in on this page. */
export function returnToDepthRoot(editor: Editor): boolean {
  const store = storeFor(editor)
  if (!store.snapshot.scopeId) return false
  return moveToScope(editor, editor.getCurrentPageId(), null, { restoreRootCamera: true })
}

/** Go to the prior session navigation location, independently of structural Up. */
export function goBackInDepthHistory(editor: Editor): boolean {
  const store = ensureHistoryAtCurrentLocation(editor)
  for (let index = store.historyIndex - 1; index >= 0; index -= 1) {
    const target = store.history[index]
    if (!locationIsValid(editor, target)) continue
    store.historyIndex = index
    if (!restoreLocation(editor, target)) continue
    publish(editor, target.scopeId)
    return true
  }
  publish(editor, store.snapshot.scopeId)
  return false
}

/** Go to the next session navigation location after a Back, if it still exists. */
export function goForwardInDepthHistory(editor: Editor): boolean {
  const store = ensureHistoryAtCurrentLocation(editor)
  for (let index = store.historyIndex + 1; index < store.history.length; index += 1) {
    const target = store.history[index]
    if (!locationIsValid(editor, target)) continue
    store.historyIndex = index
    if (!restoreLocation(editor, target)) continue
    publish(editor, target.scopeId)
    return true
  }
  publish(editor, store.snapshot.scopeId)
  return false
}

/** Route a flat Overview landmark through the same depth-aware transaction. */
export function focusDepthOverviewTarget(
  editor: Editor,
  target: { id: TLShapeId; pageId: TLPageId; kind: string },
): boolean {
  const shape = editor.getShape(target.id)
  if (!shape || !editor.getPage(target.pageId)) return false
  if (editor.getAncestorPageId(shape) !== target.pageId) return false
  // Overview is a root-level landmark index. Selecting an Expanded Block here
  // must not silently enter it: Step In remains the sole isolation action.
  return moveToScope(editor, target.pageId, null, {
    focusShapeId: target.id,
    selectShapeId: target.id,
  })
}

/** Route an Overview page heading through the same scope/history transaction. */
export function focusDepthOverviewPage(editor: Editor, pageId: TLPageId): boolean {
  if (!editor.getPage(pageId)) return false
  return moveToScope(editor, pageId, null)
}

/** Clear stale session scope after page changes, deletion, or view collapse. */
export function discardDepthScope(editor: Editor): void {
  const store = storeFor(editor)
  store.scopeId.set(null)
  store.history = [captureLocation(editor)]
  store.historyIndex = 0
  publish(editor, null)
}
