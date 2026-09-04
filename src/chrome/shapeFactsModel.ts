/**
 * What the inspector can honestly say about an ordinary tldraw shape.
 *
 * The selection pill offers `Inspect` for every selection, and until now a
 * rectangle that took the offer landed on a Block-shaped dock reading "Select a
 * Block to inspect it." — an action whose only outcome was a contradiction of
 * itself. A whiteboard bolted to Python has no semantics to add to a rectangle,
 * so this deliberately does not invent any: it reports the facts tldraw already
 * holds — what the thing is, where it is, how big, and which stock styles it
 * carries — and says where each editable one is edited.
 *
 * A pure read model over the public Editor API, so the panel never reads the
 * store and the facts stay unit-testable without a DOM.
 */
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  type Editor,
  type StyleProp,
  type TLShape,
} from 'tldraw'

export interface ShapeFact {
  label: string
  value: string
}

export interface ShapeFactsModel {
  /** How many shapes the facts describe. */
  count: number
  /** `Rectangle`, `Arrow`, `3 shapes`, `2 rectangles`… — never an internal id. */
  title: string
  /** The single shape's id, when there is exactly one. */
  shapeId: string | null
  /** Position/size/rotation, empty when a mixed selection makes them meaningless. */
  geometry: ShapeFact[]
  /** Stock styles the selection shares; `Mixed` where it does not. */
  styles: ShapeFact[]
  /** State worth naming: locked, hidden, faded. */
  flags: ShapeFact[]
  /** True when every selected shape is locked, so the panel can say so once. */
  locked: boolean
}

/** The stock styles worth naming, in the order the appearance pill shows them. */
const REPORTED_STYLES: ReadonlyArray<{ label: string; style: StyleProp<string> }> = [
  { label: 'Colour', style: DefaultColorStyle },
  { label: 'Fill', style: DefaultFillStyle },
  { label: 'Dash', style: DefaultDashStyle },
  { label: 'Size', style: DefaultSizeStyle },
  { label: 'Font', style: DefaultFontStyle },
]

/** `geo` shapes hide the interesting half of their identity in a prop. */
function shapeKind(shape: TLShape): string {
  const props = shape.props as Record<string, unknown>
  if (shape.type === 'geo' && typeof props.geo === 'string') return props.geo
  return shape.type
}

function verbatimToken(kind: string): string {
	return kind
}

/** Board units, rounded — a fraction of a unit is noise in a facts list. */
function round(value: number): string {
  return String(Math.round(value))
}

function titleFor(shapes: TLShape[]): string {
	if (shapes.length === 1) return verbatimToken(shapeKind(shapes[0]))
  const kinds = new Set(shapes.map(shapeKind))
  if (kinds.size === 1) {
		const kind = verbatimToken([...kinds][0])
    return `${shapes.length} ${kind}s`
  }
  return `${shapes.length} shapes`
}

/**
 * The facts for the current selection, or `null` when the inspector has a
 * better subject — a Block, a Branch or a cable each own their own panel, so
 * this reports only on the selections none of them claim.
 */
export function getShapeFactsModel(editor: Editor): ShapeFactsModel | null {
  const shapes = editor.getSelectedShapes()
  if (shapes.length === 0) return null

  const geometry: ShapeFact[] = []
  if (shapes.length === 1) {
    const [shape] = shapes
    const bounds = editor.getShapePageBounds(shape)
    if (bounds) {
      geometry.push({ label: 'Position', value: `${round(bounds.x)}, ${round(bounds.y)}` })
      geometry.push({ label: 'Size', value: `${round(bounds.w)} × ${round(bounds.h)}` })
    }
    if (shape.rotation) {
      geometry.push({
        label: 'Rotation',
        value: `${round((shape.rotation * 180) / Math.PI)}°`,
      })
    }
  } else {
    const bounds = editor.getSelectionPageBounds()
    if (bounds) {
      geometry.push({ label: 'Bounds', value: `${round(bounds.w)} × ${round(bounds.h)}` })
    }
  }

  const styles: ShapeFact[] = []
  for (const { label, style } of REPORTED_STYLES) {
    const shared = editor.getSharedStyles().get(style)
    if (!shared) continue
    styles.push({
      label,
		value: shared.type === 'shared' ? verbatimToken(String(shared.value)) : 'Mixed',
    })
  }

  const flags: ShapeFact[] = []
  const locked = shapes.every((shape) => shape.isLocked)
  if (locked) flags.push({ label: 'Locked', value: 'Editing is blocked' })
  const opacities = new Set(shapes.map((shape) => shape.opacity))
  if (opacities.size === 1 && shapes[0].opacity < 1) {
    flags.push({ label: 'Opacity', value: `${Math.round(shapes[0].opacity * 100)}%` })
  } else if (opacities.size > 1) {
    flags.push({ label: 'Opacity', value: 'Mixed' })
  }

  return {
    count: shapes.length,
    title: titleFor(shapes),
    shapeId: shapes.length === 1 ? shapes[0].id : null,
    geometry,
    styles,
    flags,
    locked,
  }
}

/**
 * The identity of a facts reading, for the reactive value that drives the
 * panel. The facts are recomputed on every frame a shape is dragged, so the
 * panel needs a cheap way to know when nothing it displays has changed.
 */
export function shapeFactsKey(model: ShapeFactsModel | null): string | null {
  if (!model) return null
  const facts = [...model.geometry, ...model.styles, ...model.flags]
  return `${model.count}:${model.title}:${facts.map((fact) => `${fact.label}=${fact.value}`).join(',')}`
}
