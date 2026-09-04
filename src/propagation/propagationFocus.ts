import { useCallback, useSyncExternalStore } from 'react'
import type { Editor, RecordsDiff, TLRecord, TLShapeId } from 'tldraw'
import {
  CONNECTION_SHAPE_TYPE,
  connectionBindingsForTerminal,
  connectionEndpointsAreValid,
  getConnectionBindings,
  getConnectionDirection,
  isPortHostShape,
  type ConnectionShape,
} from '../blocks/connections'
import { walkPropagationGraph, type DirectedPropagationEdge } from './propagationGraph'

export const MAX_PROPAGATION_STEPS = 5

/** Browser number inputs can yield blanks, decimals, and NaN while being edited. */
export function normalizePropagationSteps(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_PROPAGATION_STEPS, Math.max(0, Math.trunc(value)))
}

export interface PropagationFocusSnapshot {
  seedId: TLShapeId | null
  upstreamSteps: number
  downstreamSteps: number
  /** Shape ids only: these are the real canvas objects allowed to stay bright. */
  includedShapeIds: ReadonlySet<TLShapeId>
}

interface PropagationFocusStore {
  snapshot: PropagationFocusSnapshot
  listeners: Set<() => void>
}

const EMPTY_SNAPSHOT: PropagationFocusSnapshot = {
  seedId: null,
  upstreamSteps: 0,
  downstreamSteps: 0,
  includedShapeIds: new Set(),
}
const stores = new WeakMap<Editor, PropagationFocusStore>()

interface PropagationRelationStore {
  connectionIds: Set<TLShapeId>
  watchedByConnection: Map<TLShapeId, Set<TLShapeId>>
  watchedByShape: Map<TLShapeId, Set<TLShapeId>>
  listeners: Set<() => void>
  stop: () => void
  epoch: number
  /** Regression metric: this lane must never enumerate page shapes. */
  pageShapeReads: number
  publishes: number
}

const relationStores = new WeakMap<Editor, PropagationRelationStore>()

function isConnectionRecord(record: TLRecord): boolean {
  return record.typeName === 'shape' && 'type' in record && record.type === CONNECTION_SHAPE_TYPE
}

function isConnectionBindingRecord(record: TLRecord): boolean {
  return record.typeName === 'binding' && 'type' in record && record.type === 'connection'
}

function watchedShapeIds(editor: Editor, connectionId: TLShapeId): Set<TLShapeId> {
  const watched = new Set<TLShapeId>()
  for (const terminal of ['start', 'end'] as const) {
    for (const binding of connectionBindingsForTerminal(editor, connectionId, terminal)) {
      let current = editor.getShape(binding.toId)
      while (current && !watched.has(current.id)) {
        watched.add(current.id)
        current = editor.getShapeParent(current.id)
      }
    }
  }
  return watched
}

function refreshConnectionWatches(editor: Editor, store: PropagationRelationStore, connectionId: TLShapeId): void {
  for (const shapeId of store.watchedByConnection.get(connectionId) ?? []) {
    const connections = store.watchedByShape.get(shapeId)
    connections?.delete(connectionId)
    if (connections?.size === 0) store.watchedByShape.delete(shapeId)
  }
  store.watchedByConnection.delete(connectionId)
  const connection = editor.getShape(connectionId)
  if (connection?.type !== CONNECTION_SHAPE_TYPE) {
    store.connectionIds.delete(connectionId)
    return
  }
  store.connectionIds.add(connectionId)
  const watched = watchedShapeIds(editor, connectionId)
  store.watchedByConnection.set(connectionId, watched)
  for (const shapeId of watched) {
    const connections = store.watchedByShape.get(shapeId) ?? new Set<TLShapeId>()
    connections.add(connectionId)
    store.watchedByShape.set(shapeId, connections)
  }
}

function relationChangeMayMatter(changes: RecordsDiff<TLRecord>, store: PropagationRelationStore): Set<TLShapeId> {
  const affected = new Set<TLShapeId>()
  const addRecord = (record: TLRecord) => {
    if (isConnectionRecord(record)) affected.add(record.id as TLShapeId)
    if (isConnectionBindingRecord(record)) affected.add((record as { fromId: TLShapeId }).fromId)
    if (record.typeName === 'shape') for (const id of store.watchedByShape.get(record.id as TLShapeId) ?? []) affected.add(id)
  }
  for (const record of Object.values(changes.added)) addRecord(record)
  for (const record of Object.values(changes.removed)) addRecord(record)
  for (const [before, after] of Object.values(changes.updated)) {
    if (isConnectionRecord(before) || isConnectionRecord(after)) {
      if (!isConnectionRecord(before) || !isConnectionRecord(after)
        || (before as { parentId: unknown }).parentId !== (after as { parentId: unknown }).parentId) addRecord(after)
      continue
    }
    if (isConnectionBindingRecord(before) || isConnectionBindingRecord(after)) {
      addRecord(before)
      addRecord(after)
      continue
    }
    if (before.typeName === 'shape' && after.typeName === 'shape'
      && store.watchedByShape.has(after.id as TLShapeId)
      && (before.parentId !== after.parentId || before.type !== after.type || before.props !== after.props)) addRecord(after)
  }
  return affected
}

function relationStoreFor(editor: Editor): PropagationRelationStore | null {
  if (!editor.store) return null
  let store = relationStores.get(editor)
  if (store) return store
  const connectionIds = new Set<TLShapeId>()
  store = {
    connectionIds,
    watchedByConnection: new Map(),
    watchedByShape: new Map(),
    listeners: new Set(),
    stop: () => undefined,
    epoch: 0,
    pageShapeReads: 0,
    publishes: 0,
  }
  // A typed store query gives this lens only connection records at attachment;
  // all later updates are driven by diffs and touch only their dependencies.
  for (const record of editor.store.query.records('shape', () => ({
    type: { eq: CONNECTION_SHAPE_TYPE },
  })).get()) connectionIds.add(record.id as TLShapeId)
  for (const id of connectionIds) refreshConnectionWatches(editor, store, id)
  store.stop = editor.store.listen((entry) => {
    const affected = relationChangeMayMatter(entry.changes, store!)
    if (affected.size === 0) return
    for (const id of affected) refreshConnectionWatches(editor, store!, id)
    store!.epoch += 1
    store!.publishes += 1
    for (const listener of store!.listeners) listener()
  }, { scope: 'document' })
  relationStores.set(editor, store)
  return store
}

function connectionIdsFor(editor: Editor): Iterable<TLShapeId> {
  const store = relationStoreFor(editor)
  if (store) return store.connectionIds
  // Test doubles have no document store. This fallback still reads ids only.
  return [...editor.getCurrentPageShapeIds()].filter((id) => editor.getShape(id)?.type === CONNECTION_SHAPE_TYPE)
}

export function subscribePropagationRelations(editor: Editor, listener: () => void): () => void {
  const store = relationStoreFor(editor)
  if (!store) return () => undefined
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export function getPropagationRelationEpoch(editor: Editor): number {
  return relationStoreFor(editor)?.epoch ?? 0
}

/** Development-only proof seam for the no-page-scan regression test. */
export function getPropagationRelationMetrics(editor: Editor) {
  const store = relationStoreFor(editor)
  return {
    connections: store?.connectionIds.size ?? 0,
    pageShapeReads: store?.pageShapeReads ?? 0,
    publishes: store?.publishes ?? 0,
  }
}

function storeFor(editor: Editor): PropagationFocusStore {
  let store = stores.get(editor)
  if (!store) {
    store = { snapshot: EMPTY_SNAPSHOT, listeners: new Set() }
    stores.set(editor, store)
  }
  return store
}

function publish(editor: Editor, snapshot: PropagationFocusSnapshot): void {
  const store = storeFor(editor)
  store.snapshot = snapshot
  for (const listener of store.listeners) listener()
}

export function getPropagationFocusSnapshot(editor: Editor): PropagationFocusSnapshot {
  return storeFor(editor).snapshot
}

export function subscribePropagationFocus(editor: Editor, listener: () => void): () => void {
  const store = storeFor(editor)
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

/** A selected Block/value host or canonically admitted cable can anchor a graph reading. */
export function propagationSeedFromSelection(editor: Editor): TLShapeId | null {
  const selected = editor.getSelectedShapes()
  if (selected.length !== 1) return null
  const shape = selected[0]
  if (isPortHostShape(shape)) return shape.id
  if (shape.type === CONNECTION_SHAPE_TYPE && livePropagationEdges(editor).some((edge) => edge.edgeId === shape.id)) return shape.id
  return null
}

/**
 * Read only settled, canonical cables as dataflow.
 *
 * WHY: the canvas deliberately permits an in-progress or even malformed cable
 * while someone is sketching. A reading lens must not turn that geometry into
 * a made-up dependency, so its admission test is stricter than rendering.
 */
export function livePropagationEdges(editor: Editor): DirectedPropagationEdge[] {
  const edges: DirectedPropagationEdge[] = []
  const currentPageId = editor.getCurrentPageId()
  for (const connectionId of connectionIdsFor(editor)) {
    const candidate = editor.getShape(connectionId)
    if (candidate?.type !== CONNECTION_SHAPE_TYPE || editor.getAncestorPageId(connectionId) !== currentPageId) continue
    const connection = candidate as ConnectionShape
    // `getConnectionBindings` deliberately picks a representative for legacy
    // callers. The graph may not: every terminal must have exactly one weld.
    if (connectionBindingsForTerminal(editor, connection, 'start').length !== 1
      || connectionBindingsForTerminal(editor, connection, 'end').length !== 1
      || !connectionEndpointsAreValid(editor, connection)) continue
    const bindings = getConnectionBindings(editor, connection)
    if (!bindings.start || !bindings.end) continue
    const direction = getConnectionDirection(editor, connection)
    const source = bindings[direction.sourceTerminal]
    const sink = bindings[direction.sinkTerminal]
    if (!source || !sink || !isPortHostShape(editor.getShape(source.toId)) || !isPortHostShape(editor.getShape(sink.toId))) continue
    edges.push({ edgeId: connection.id, sourceId: source.toId, sinkId: sink.toId })
  }
  return edges
}

function snapshotFor(
  editor: Editor,
  seedId: TLShapeId,
  upstreamSteps: number,
  downstreamSteps: number,
): PropagationFocusSnapshot {
  const seed = editor.getShape(seedId)
  if (!seed) return EMPTY_SNAPSHOT
  const edges = livePropagationEdges(editor)
  const selectedEdge = seed.type === CONNECTION_SHAPE_TYPE
    ? edges.find((edge) => edge.edgeId === seedId)
    : undefined
  if (seed.type === CONNECTION_SHAPE_TYPE && !selectedEdge) return EMPTY_SNAPSHOT
  if (seed.type !== CONNECTION_SHAPE_TYPE && !isPortHostShape(seed)) return EMPTY_SNAPSHOT
  // A selected cable begins with its two concrete endpoints lit. Its controls
  // then expand past either end; selecting it never fabricates a "node" for a
  // wire, and selecting a Block uses the Block itself as both directional root.
  const roots = selectedEdge
    ? {
        upstreamStarts: [selectedEdge.sourceId],
        downstreamStarts: [selectedEdge.sinkId],
        initialNodes: [selectedEdge.sourceId, selectedEdge.sinkId],
        initialEdges: [selectedEdge.edgeId],
      }
    : {
        upstreamStarts: [seedId],
        downstreamStarts: [seedId],
        initialNodes: [seedId],
        initialEdges: [],
      }
  const walk = walkPropagationGraph({
    edges,
    ...roots,
    upstreamSteps,
    downstreamSteps,
  })
  return {
    seedId,
    upstreamSteps,
    downstreamSteps,
    includedShapeIds: new Set([...walk.nodes, ...walk.edges] as TLShapeId[]),
  }
}

export function startPropagationFocus(
  editor: Editor,
  seedId = propagationSeedFromSelection(editor),
  upstreamSteps = 1,
  downstreamSteps = 1,
): boolean {
  if (!seedId || !editor.getShape(seedId)) return false
  const snapshot = snapshotFor(
    editor,
    seedId,
    normalizePropagationSteps(upstreamSteps),
    normalizePropagationSteps(downstreamSteps),
  )
  if (!snapshot.seedId) return false
  publish(editor, snapshot)
  return true
}

export function setPropagationFocusSteps(
  editor: Editor,
  direction: 'upstream' | 'downstream',
  steps: number,
): void {
  const current = getPropagationFocusSnapshot(editor)
  if (!current.seedId) return
  startPropagationFocus(
    editor,
    current.seedId,
    direction === 'upstream' ? steps : current.upstreamSteps,
    direction === 'downstream' ? steps : current.downstreamSteps,
  )
}

/** WHY: a focus path is a disposable reading aid, never a board assertion. */
export function clearPropagationFocus(editor: Editor): void {
  if (!getPropagationFocusSnapshot(editor).seedId) return
  publish(editor, EMPTY_SNAPSHOT)
}

/**
 * Keep a lens honest as its board changes. It is intentionally not a writer:
 * deleting a seed only clears the view, and selecting another object clears it
 * rather than silently retargeting a path the reader did not ask to inspect.
 */
export function reconcilePropagationFocus(editor: Editor): void {
  const current = getPropagationFocusSnapshot(editor)
  if (!current.seedId) return
  if (!editor.getShape(current.seedId) || !editor.getSelectedShapeIds().includes(current.seedId)) {
    clearPropagationFocus(editor)
    return
  }
  if (!startPropagationFocus(editor, current.seedId, current.upstreamSteps, current.downstreamSteps)) clearPropagationFocus(editor)
}

export function usePropagationFocus(editor: Editor): PropagationFocusSnapshot {
  const subscribe = useCallback((listener: () => void) => subscribePropagationFocus(editor, listener), [editor])
  const getSnapshot = useCallback(() => getPropagationFocusSnapshot(editor), [editor])
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT)
}
