import { atom, type Atom, type Editor, type TLCamera, type TLPageId, type TLShapeId } from 'tldraw'

import {
  isBlockShape,
  isExpandedBlockShape,
  type BlockShape,
} from '../blocks/blockModel'

const CAMERA_INSET = 84
const CAMERA_DURATION_MS = 260

export interface DepthNavigationSnapshot {
  scopeId: TLShapeId | null
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

interface DepthNavigationStore {
  scopeId: Atom<TLShapeId | null>
  snapshot: DepthNavigationSnapshot
  listeners: Set<() => void>
  rootCamera: TLCamera | null
  rootPageId: TLPageId | null
}

const stores = new WeakMap<Editor, DepthNavigationStore>()

function storeFor(editor: Editor): DepthNavigationStore {
  let store = stores.get(editor)
  if (!store) {
    store = {
      scopeId: atom('SystemSketch depth scope', null),
      snapshot: { scopeId: null },
      listeners: new Set(),
      rootCamera: null,
      rootPageId: null,
    }
    stores.set(editor, store)
  }
  return store
}

function publish(editor: Editor, scopeId: TLShapeId | null): void {
  const store = storeFor(editor)
  if (store.snapshot.scopeId === scopeId) return
  store.scopeId.set(scopeId)
  store.snapshot = { scopeId }
  for (const listener of store.listeners) listener()
}

function blockName(block: BlockShape): string {
  return block.props.title.trim() || 'Untitled Block'
}

function blockPath(editor: Editor, scopeId: TLShapeId): BlockShape[] | null {
  const current = editor.getShape(scopeId)
  if (!isExpandedBlockShape(current)) return null
  if (editor.getAncestorPageId(current) !== editor.getCurrentPageId()) return null
  const ancestors = editor.getShapeAncestors(current).filter(isBlockShape)
  return [...ancestors, current]
}

function focusBounds(editor: Editor, shapeId: TLShapeId): boolean {
  const bounds = editor.getShapePageBounds(shapeId)
  if (!bounds) return false
  editor.zoomToBounds(bounds, {
    inset: CAMERA_INSET,
    animation: { duration: CAMERA_DURATION_MS },
  })
  return true
}

export function getDepthNavigationSnapshot(editor: Editor): DepthNavigationSnapshot {
  return storeFor(editor).snapshot
}

/**
 * The active scope as a reactive tldraw value.
 *
 * Shape visibility is computed by tldraw, not React. Reading the atom from
 * that computation invalidates its visibility cache the instant Step In
 * changes, so hidden siblings also disappear from hit testing in the same
 * transaction.
 */
export function getActiveDepthScopeId(editor: Editor): TLShapeId | null {
  return storeFor(editor).scopeId.get()
}

export function subscribeDepthNavigation(editor: Editor, listener: () => void): () => void {
  const store = storeFor(editor)
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export function getDepthNavigationModel(
  editor: Editor,
  scopeId: TLShapeId | null,
): DepthNavigationModel | null {
  const page = editor.getCurrentPage()
  const rootName = 'Board'
  if (!scopeId) {
    return {
      pageId: page.id,
      pageName: rootName,
      current: null,
      entries: [],
      depth: 0,
      parent: null,
    }
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

  const store = storeFor(editor)
  const active = store.snapshot.scopeId
    ? getDepthNavigationModel(editor, store.snapshot.scopeId)
    : null
  if (active?.current) {
    const activeScopeId = active.current.id
    if (activeScopeId === target.id) return false
    const isDescendant = editor
      .getShapeAncestors(target)
      .some((ancestor) => ancestor.id === activeScopeId)
    if (!isDescendant) return false
  } else {
    store.rootCamera = { ...editor.getCamera() }
    store.rootPageId = editor.getCurrentPageId()
  }

  editor.setCurrentTool('select')
  editor.selectNone()
  publish(editor, target.id)
  return focusBounds(editor, target.id)
}

/** Jump to a real Expanded-Block ancestor already present in the current path. */
export function stepToDepthAncestor(editor: Editor, shapeId: TLShapeId): boolean {
  const store = storeFor(editor)
  const active = store.snapshot.scopeId
    ? getDepthNavigationModel(editor, store.snapshot.scopeId)
    : null
  if (!active?.current || active.current.id === shapeId) return false
  const target = active.entries.find((entry) => entry.id === shapeId)
  if (!target?.canFocus) return false

  editor.setCurrentTool('select')
  editor.selectNone()
  publish(editor, shapeId)
  return focusBounds(editor, shapeId)
}

/** Ascend through the nearest focusable Block parent, or return to the page root. */
export function stepOutOfDepthScope(editor: Editor): boolean {
  const store = storeFor(editor)
  const active = store.snapshot.scopeId
    ? getDepthNavigationModel(editor, store.snapshot.scopeId)
    : null
  if (!active) return false
  const parent = [...active.entries]
    .slice(0, -1)
    .reverse()
    .find((entry) => entry.canFocus)
  return parent
    ? stepToDepthAncestor(editor, parent.id)
    : returnToDepthRoot(editor)
}

/** The shared Step in / Step out action used by every Block command surface. */
export function toggleDepthScope(editor: Editor, shapeId: TLShapeId): boolean {
  return getActiveDepthScopeId(editor) === shapeId
    ? stepOutOfDepthScope(editor)
    : stepIntoDepthScope(editor, shapeId)
}

/** Restore the camera that existed before the first step-in on this page. */
export function returnToDepthRoot(editor: Editor): boolean {
  const store = storeFor(editor)
  if (!store.snapshot.scopeId) return false
  const camera = store.rootPageId === editor.getCurrentPageId()
    ? store.rootCamera
    : null

  editor.setCurrentTool('select')
  editor.selectNone()
  publish(editor, null)
  if (camera) {
    editor.setCamera(camera, { animation: { duration: CAMERA_DURATION_MS } })
  } else {
    editor.zoomToFit({ animation: { duration: CAMERA_DURATION_MS } })
  }
  store.rootCamera = null
  store.rootPageId = null
  return true
}

/** Clear stale session scope after page changes, deletion, or view collapse. */
export function discardDepthScope(editor: Editor): void {
  const store = storeFor(editor)
  publish(editor, null)
  store.rootCamera = null
  store.rootPageId = null
}
