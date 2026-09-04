import { useCallback, useSyncExternalStore } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import {
  CONNECTION_SHAPE_TYPE,
  connectionBindingIsValid,
  getConnectionBindings,
  getConnectionDirection,
  isPortHostShape,
  type ConnectionShape,
} from '../blocks/connections'
import { walkPropagationGraph, type DirectedPropagationEdge } from './propagationGraph'

export const MAX_PROPAGATION_STEPS = 5

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

/** A selected Block/value host or settled cable can anchor a graph reading. */
export function propagationSeedFromSelection(editor: Editor): TLShapeId | null {
  const selected = editor.getSelectedShapes()
  if (selected.length !== 1) return null
  const shape = selected[0]
  if (shape.type === CONNECTION_SHAPE_TYPE || isPortHostShape(shape)) return shape.id
  return null
}

function liveDirectedEdges(editor: Editor): DirectedPropagationEdge[] {
  const edges: DirectedPropagationEdge[] = []
  for (const candidate of editor.getCurrentPageShapes()) {
    if (candidate.type !== CONNECTION_SHAPE_TYPE) continue
    const connection = candidate as ConnectionShape
    const bindings = getConnectionBindings(editor, connection)
    // A half-drag, deleted port, or malformed binding is visual geometry, not
    // trustworthy dataflow. The lens skips it instead of guessing a relation.
    if (!bindings.start || !bindings.end
      || !connectionBindingIsValid(editor, bindings.start)
      || !connectionBindingIsValid(editor, bindings.end)) continue
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
  const edges = liveDirectedEdges(editor)
  const selectedEdge = seed.type === CONNECTION_SHAPE_TYPE
    ? edges.find((edge) => edge.edgeId === seedId)
    : undefined
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
  publish(editor, snapshotFor(
    editor,
    seedId,
    Math.min(MAX_PROPAGATION_STEPS, Math.max(0, upstreamSteps)),
    Math.min(MAX_PROPAGATION_STEPS, Math.max(0, downstreamSteps)),
  ))
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
  startPropagationFocus(editor, current.seedId, current.upstreamSteps, current.downstreamSteps)
}

export function usePropagationFocus(editor: Editor): PropagationFocusSnapshot {
  const subscribe = useCallback((listener: () => void) => subscribePropagationFocus(editor, listener), [editor])
  const getSnapshot = useCallback(() => getPropagationFocusSnapshot(editor), [editor])
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT)
}
