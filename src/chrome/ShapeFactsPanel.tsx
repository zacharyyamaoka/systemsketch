/**
 * The inspector's third subject: an ordinary tldraw shape.
 *
 * `Inspect` is offered for every selection, so it has to lead somewhere for
 * every selection. A Block, a Branch and a cable each have a panel that edits
 * them; a rectangle has nothing to edit that the appearance pill does not
 * already own, so this states what the shape is and where its controls live
 * rather than pretending to be an editor. An Arrow is the one exception: its
 * uncommon Slanted route belongs in this quiet, selection-specific dock rather
 * than the quick appearance pill. Two real actions ride along, both stock
 * editor calls: fit the camera to it, and unlock it when it is locked.
 */
import { useEditor, useValue, type Editor } from 'tldraw'

import {
  getShapeFactsModel,
  shapeFactsKey,
  type ShapeFact,
  type ShapeFactsModel,
} from './shapeFactsModel'
import {
  getArrowInspectorRouting,
  setArrowInspectorRouting,
  type ArrowInspectorRouting,
} from '../systemSketchArrow'
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
            <dd title={fact.value}>{fact.value}</dd>
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
  arrowRouting?: ArrowInspectorRouting | null
  onSetArrowRouting?(routing: Exclude<ArrowInspectorRouting, 'mixed'>): void
}

function SlantedArrowGlyph() {
  return (
    <svg viewBox="0 0 40 24" aria-hidden="true">
      <path d="M 3 17 H 20 L 33 4" />
      <path d="M 26 6 L 33 4 L 31 11" />
    </svg>
  )
}

function ArrowRoutingControls({
  routing,
  onSetRouting,
}: {
  routing: ArrowInspectorRouting
  onSetRouting(routing: Exclude<ArrowInspectorRouting, 'mixed'>): void
}) {
  return (
    <section className="systemsketch-shape-facts__group" data-inspector-section="Arrow routing">
      <h3>Arrow routing</h3>
      <div className="systemsketch-shape-facts__routing" role="group" aria-label="Arrow routing">
        <button
          type="button"
          data-testid="shape-facts-arrow-routing-straight"
          aria-pressed={routing === 'straight'}
          onClick={() => onSetRouting('straight')}
        >
          <svg viewBox="0 0 40 24" aria-hidden="true">
            <path d="M 3 12 H 33" />
            <path d="M 26 6 L 33 12 L 26 18" />
          </svg>
          Straight
        </button>
        <button
          type="button"
          data-testid="shape-facts-arrow-routing-slanted"
          aria-pressed={routing === 'slanted'}
          onClick={() => onSetRouting('slanted')}
        >
          <SlantedArrowGlyph />
          Slanted
        </button>
      </div>
      <p className="systemsketch-shape-facts__routing-hint">
        {routing === 'mixed'
          ? 'Mixed — choose one route to settle the selection.'
          : routing === 'slanted'
            ? 'Leaves horizontally, then climbs or descends diagonally. It keeps the ordinary arrowhead.'
            : 'Use Slanted for compact behavior-tree branches without adding a common toolbar tool.'}
      </p>
    </section>
  )
}

/** Pure presentation, exported so the facts stay assertable without an editor. */
export function ShapeFactsView({
  model,
  onZoomToSelection,
  onUnlock,
  arrowRouting = null,
  onSetArrowRouting,
}: ShapeFactsViewProps) {
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

      {arrowRouting && onSetArrowRouting ? (
        <ArrowRoutingControls routing={arrowRouting} onSetRouting={onSetArrowRouting} />
      ) : null}

      <p className="systemsketch-shape-facts__hint">
        {arrowRouting
          ? 'Arrow routing is edited here; colour, fill and text remain on the selection pill over the shape.'
          : model.styles.length > 0
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
  const arrowRouting = useValue(
    'SystemSketch inspected arrow routing',
    () => getArrowInspectorRouting(editor),
    [editor],
  )
  if (!model) return null
  return (
    <ShapeFactsView
      model={model}
      arrowRouting={arrowRouting}
      onSetArrowRouting={(routing) => setArrowInspectorRouting(editor, routing)}
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
