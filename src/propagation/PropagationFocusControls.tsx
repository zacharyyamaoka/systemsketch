import { useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'
import {
  MAX_PROPAGATION_STEPS,
  clearPropagationFocus,
  getPropagationFocusSnapshot,
  propagationSeedFromSelection,
  reconcilePropagationFocus,
  setPropagationFocusSteps,
  startPropagationFocus,
  usePropagationFocus,
} from './propagationFocus'
import './propagation-focus.css'

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
          title="Highlight one upstream and downstream graph step (F)"
          aria-keyshortcuts="F"
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
              value={focus.downstreamSteps}
              onChange={(event) => setPropagationFocusSteps(editor, 'downstream', Number(event.currentTarget.value))}
            />
            <span aria-hidden="true">→</span>
          </label>
          <button
            type="button"
            data-testid="propagation-focus-clear"
            title="Clear propagation focus (Escape)"
            aria-keyshortcuts="Escape"
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
  const selectionKey = useValue(
    'propagation focus selection reconciliation',
    () => [...editor.getSelectedShapeIds()].sort().join(','),
    [editor],
  )
  // Reading shape and connection-binding ids through tldraw's reactive query
  // makes a lens recalculate when a cable is retargeted or removed, without
  // adding a second persisted "graph" record just to observe the board.
  const relationEpoch = useValue(
    'propagation focus live relation epoch',
    () => [
      ...editor.getCurrentPageShapes().map((shape) => `${shape.id}:${shape.type}:${JSON.stringify(shape.props)}`),
      ...editor.store.allRecords()
        .filter((record) => record.typeName === 'binding' && record.type === 'connection')
        .map((record) => `${record.id}:${record.fromId}:${record.toId}:${JSON.stringify(record.props)}`),
    ].join('|'),
    [editor],
  )
  useEffect(() => {
    reconcilePropagationFocus(editor)
  }, [editor, relationEpoch, selectionKey])
  useEffect(() => {
    const container = editor.getContainer()
    const included = focus.includedShapeIds
    container.toggleAttribute('data-propagation-focus-active', focus.seedId !== null)
    for (const element of container.querySelectorAll<HTMLElement>('[data-shape-id]')) {
      const id = element.dataset.shapeId
      if (id && included.has(id as never)) element.dataset.propagationFocus = 'included'
      else delete element.dataset.propagationFocus
    }
    return () => {
      container.removeAttribute('data-propagation-focus-active')
      for (const element of container.querySelectorAll<HTMLElement>('[data-shape-id]')) delete element.dataset.propagationFocus
    }
  }, [editor, focus])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return
      if (event.key === 'Escape' && getPropagationFocusSnapshot(editor).seedId) {
        event.preventDefault()
        clearPropagationFocus(editor)
      }
      if (event.key.toLowerCase() === 'f' && propagationSeedFromSelection(editor) && !getPropagationFocusSnapshot(editor).seedId) {
        event.preventDefault()
        startPropagationFocus(editor)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor])
  return null
}
