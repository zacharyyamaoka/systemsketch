/**
 * The inspector's third subject: an ordinary tldraw shape.
 *
 * `Inspect` is offered for every selection, so it has to lead somewhere for
 * every selection. A Block, a Branch and a cable each have a panel that edits
 * them; a rectangle has nothing to edit that the appearance pill does not
 * already own, so this states what the shape is and where its controls live
 * rather than pretending to be an editor. Two real actions ride along, both
 * stock editor calls: fit the camera to it, and unlock it when it is locked.
 */
import { useEditor, useValue, type Editor } from 'tldraw'

import {
  getShapeFactsModel,
  shapeFactsKey,
  type ShapeFact,
  type ShapeFactsModel,
} from './shapeFactsModel'
import './shape-facts.css'

function FactList({ label, facts }: { label: string; facts: ShapeFact[] }) {
  if (facts.length === 0) return null
  return (
    <section className="systemsketch-shape-facts__group">
      <h3>{label}</h3>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export interface ShapeFactsViewProps {
  model: ShapeFactsModel
  onZoomToSelection(): void
  onUnlock(): void
}

/** Pure presentation, exported so the facts stay assertable without an editor. */
export function ShapeFactsView({ model, onZoomToSelection, onUnlock }: ShapeFactsViewProps) {
  return (
    <div
      className="systemsketch-shape-facts"
      data-testid="systemsketch-shape-facts"
      data-shape-count={model.count}
    >
      {/* No eyebrow: the dock's own header already reads "Right panel /
          Selection" directly above this, and repeating the word is the same
          double-titling the Comments panel has. The kind is the new fact. */}
      <header className="systemsketch-shape-facts__header">
        <h2>{model.title}</h2>
      </header>

      <FactList label="Geometry" facts={model.geometry} />
      <FactList label="Appearance" facts={model.styles} />
      <FactList label="State" facts={model.flags} />

      <p className="systemsketch-shape-facts__hint">
        {model.styles.length > 0
          ? 'Colour, fill and text are edited on the selection pill over the shape.'
          : 'This shape carries no editable styles.'}
      </p>

      <div className="systemsketch-shape-facts__actions">
        <button type="button" data-testid="shape-facts-zoom" onClick={onZoomToSelection}>
          Fit to view
        </button>
        {model.locked ? (
          <button type="button" data-testid="shape-facts-unlock" onClick={onUnlock}>
            Unlock
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** The reactive adapter. Nothing above this line reads the editor. */
export function ShapeFactsPanel({ editor }: { editor: Editor }) {
  // Keyed on the facts themselves: the model is re-derived on every frame a
  // shape is dragged, and only a changed reading should re-render the panel.
  const key = useValue(
    'SystemSketch shape facts identity',
    () => shapeFactsKey(getShapeFactsModel(editor)),
    [editor],
  )
  const model = useValue(
    'SystemSketch shape facts',
    () => (key === null ? null : getShapeFactsModel(editor)),
    [editor, key],
  )
  if (!model) return null
  return (
    <ShapeFactsView
      model={model}
      onZoomToSelection={() => editor.zoomToSelection()}
      onUnlock={() => {
        editor.markHistoryStoppingPoint('unlock shapes')
        editor.updateShapes(
          editor.getSelectedShapes().map((shape) => ({ id: shape.id, type: shape.type, isLocked: false })),
        )
      }}
    />
  )
}

/** The same panel, wired to the ambient editor, for use inside the dock. */
export function EditorShapeFactsPanel() {
  return <ShapeFactsPanel editor={useEditor()} />
}
