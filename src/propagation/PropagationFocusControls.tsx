import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useEditor, useValue } from 'tldraw'
import {
  MAX_PROPAGATION_STEPS,
  clearPropagationFocus,
  getPropagationRelationEpoch,
  propagationSeedFromSelection,
  reconcilePropagationFocus,
  setPropagationFocusSteps,
  startPropagationFocus,
  subscribePropagationRelations,
  usePropagationFocus,
} from './propagationFocus'
import './propagation-focus.css'

function usePropagationRelationEpoch(editor: ReturnType<typeof useEditor>): number {
  const subscribe = useCallback((listener: () => void) => subscribePropagationRelations(editor, listener), [editor])
  const getSnapshot = useCallback(() => getPropagationRelationEpoch(editor), [editor])
  return useSyncExternalStore(subscribe, getSnapshot, () => 0)
}

/** The small selection lens: one explicit seed, separately bounded directions. */
export function PropagationFocusControls() {
  const editor = useEditor()
  const selectionSeed = useValue(
    'propagation focus selection seed',
    () => propagationSeedFromSelection(editor),
    [editor],
  )
  const focus = usePropagationFocus(editor)
  useEffect(() => {
    reconcilePropagationFocus(editor)
  }, [editor, selectionSeed])
  if (!selectionSeed && !focus.seedId) return null
  const active = focus.seedId !== null
  return (
    <div className="systemsketch-propagation-focus" role="group" aria-label="Dataflow propagation focus">
      {!active ? (
        <button
          type="button"
          data-testid="propagation-focus-start"
          title="Highlight one upstream and downstream graph step"
          onClick={() => startPropagationFocus(editor)}
        >
          Focus flow
        </button>
      ) : (
        <>
          <label title="How far to follow producers backward">
            <span aria-hidden="true">←</span>
            <input
              aria-label="Upstream propagation steps"
              data-testid="propagation-focus-upstream"
              type="number"
              min={0}
              max={MAX_PROPAGATION_STEPS}
              step={1}
              value={focus.upstreamSteps}
              onChange={(event) => setPropagationFocusSteps(editor, 'upstream', Number(event.currentTarget.value))}
            />
          </label>
          <span className="systemsketch-propagation-focus__label">steps</span>
          <label title="How far to follow consumers forward">
            <input
              aria-label="Downstream propagation steps"
              data-testid="propagation-focus-downstream"
              type="number"
              min={0}
              max={MAX_PROPAGATION_STEPS}
              step={1}
              value={focus.downstreamSteps}
              onChange={(event) => setPropagationFocusSteps(editor, 'downstream', Number(event.currentTarget.value))}
            />
            <span aria-hidden="true">→</span>
          </label>
          <button
            type="button"
            data-testid="propagation-focus-clear"
            title="Clear propagation focus"
            onClick={() => clearPropagationFocus(editor)}
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}

/** Applies a CSS-only dimming lens to *existing* shape hosts. */
export function PropagationFocusDomLens() {
  const editor = useEditor()
  const focus = usePropagationFocus(editor)
  const markedHosts = useRef(new Map<string, HTMLElement>())
  const selectionKey = useValue(
    'propagation focus selection reconciliation',
    () => [...editor.getSelectedShapeIds()].sort().join(','),
    [editor],
  )
  const relationEpoch = usePropagationRelationEpoch(editor)
  useEffect(() => {
    reconcilePropagationFocus(editor)
  }, [editor, relationEpoch, selectionKey])
  useEffect(() => {
    const container = editor.getContainer()
    const included = focus.includedShapeIds
    container.toggleAttribute('data-propagation-focus-active', focus.seedId !== null)
    const nextIds = new Set([...included].map(String))
    for (const [id, element] of markedHosts.current) {
      if (nextIds.has(id) && element.isConnected) continue
      delete element.dataset.propagationFocus
      markedHosts.current.delete(id)
    }
    // Only included, actual canvas hosts are touched. CSS dims every other
    // shape host from the container attribute, so unrelated DOM is never
    // enumerated or rewritten on a graph update.
    for (const id of nextIds) {
      const previous = markedHosts.current.get(id)
      if (previous?.isConnected) continue
      const element = container.querySelector<HTMLElement>(`.tl-shape[data-shape-id="${CSS.escape(id)}"]`)
      if (!element) continue
      element.dataset.propagationFocus = 'included'
      markedHosts.current.set(id, element)
    }
    if (!focus.seedId) return
    // tldraw may unmount off-screen shapes while panning. Watch only the
    // canvas host list and only inspect added subtrees, then mark an added
    // host if it is already part of this focus result.
    const markAddedHost = (element: HTMLElement) => {
      if (!element.matches('.tl-shape[data-shape-id]')) return
      const id = element.dataset.shapeId
      if (!id || !nextIds.has(id)) return
      const previous = markedHosts.current.get(id)
      if (previous && previous !== element) delete previous.dataset.propagationFocus
      element.dataset.propagationFocus = 'included'
      markedHosts.current.set(id, element)
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        markAddedHost(node)
        for (const host of node.querySelectorAll<HTMLElement>('.tl-shape[data-shape-id]')) markAddedHost(host)
      }
    })
    observer.observe(container.querySelector('.tl-shapes') ?? container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [editor, focus])
  useEffect(() => () => {
    const container = editor.getContainer()
    container.removeAttribute('data-propagation-focus-active')
    for (const element of markedHosts.current.values()) delete element.dataset.propagationFocus
    markedHosts.current.clear()
  }, [editor])
  return null
}
