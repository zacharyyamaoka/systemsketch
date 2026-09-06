/**
 * A shape's edge: its own colour, and the one line style tldraw has no value
 * for.
 *
 * FigJam paints a shape's fill and its edge separately — its Fill popover and
 * its Stroke popover each carry a palette — and SystemSketch needs a third
 * line style beside solid/dashed/dotted: the `async` packet cadence a cable
 * already draws (`connectionPresentation.ASYNC_PACKET_DASHARRAY`).
 *
 * Neither fits in a stock style prop, and both are deliberately kept out of
 * one:
 *
 * - WHY meta, not a `StyleProp`: a StyleProp only reaches shapes whose util
 *   declares it, and `geo` is tldraw's own shape. Adding a prop to it would
 *   change the on-disk schema of a stock record, so a `.tldr` written here
 *   would no longer open in plain tldraw — the property `stockPrimitiveVisuals`
 *   exists to protect. `meta` is the sanctioned escape hatch, and
 *   `getCustomDisplayValues` is the matching paint seam.
 * - WHY `async` is not a new dash value: `PathBuilder.toSvg` runs an
 *   exhaustive switch over the dash enum and throws on anything it does not
 *   know, so `DefaultDashStyle.addValues('async')` would crash every shape
 *   drawn with it. An async edge is therefore a `solid` dash wearing the
 *   packet cadence, which is also what makes it degrade to a plain outline
 *   anywhere but here.
 */
import {
	DefaultColorStyle,
	DefaultDashStyle,
	type Editor,
	type JsonObject,
	type SharedStyle,
	type StyleProp,
	type TLShape,
	type TLTheme,
} from 'tldraw'

export const SYSTEMSKETCH_STROKE_META_KEY = 'systemSketchStroke'

/** The one line style that is ours rather than tldraw's. */
export const ASYNC_LINE_VALUE = 'async'

/** The stock dash a shape actually stores while it wears the async cadence. */
export const ASYNC_BASE_DASH = 'solid'

export interface SystemSketchStrokeMeta {
	/** A palette colour name. Absent means the edge follows the shape's colour. */
	color?: string
	/** `async` only; absent means the stored `dash` is the whole story. */
	pattern?: typeof ASYNC_LINE_VALUE
}

/** Which half of the edge a control writes. */
export type StrokeMetaField = 'color' | 'pattern'

/**
 * The two fields the edge model reads. Deliberately structural rather than
 * `TLShape`: every shape type has its own props interface, and a test fixture
 * has neither, so this is the one description all three satisfy.
 */
export interface ShapeLike {
	meta?: Record<string, unknown>
	props?: object
}

function propOf(shape: ShapeLike, key: string): unknown {
	return (shape.props as Record<string, unknown> | undefined)?.[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** The edge overrides a shape carries, or an empty record. */
export function readStrokeMeta(shape: ShapeLike): SystemSketchStrokeMeta {
	const value = shape.meta?.[SYSTEMSKETCH_STROKE_META_KEY]
	if (!isRecord(value)) return {}
	const color = typeof value.color === 'string' ? value.color : undefined
	const pattern = value.pattern === ASYNC_LINE_VALUE ? ASYNC_LINE_VALUE : undefined
	return { ...(color ? { color } : {}), ...(pattern ? { pattern } : {}) }
}

/**
 * The shape's metadata with one edge field changed. An emptied record drops
 * the key outright, so a shape that carries no override is byte-identical to
 * one that never had one.
 */
export function writeStrokeMeta(
	shape: ShapeLike,
	field: StrokeMetaField,
	value: string | undefined,
): JsonObject {
	const next: SystemSketchStrokeMeta = { ...readStrokeMeta(shape) }
	if (value === undefined) delete next[field]
	else if (field === 'color') next.color = value
	else next.pattern = ASYNC_LINE_VALUE
	const meta = { ...(shape.meta ?? {}) } as JsonObject
	if (Object.keys(next).length === 0) delete meta[SYSTEMSKETCH_STROKE_META_KEY]
	else meta[SYSTEMSKETCH_STROKE_META_KEY] = next as unknown as JsonObject
	return meta
}

/** Only shapes with an outline to paint: a stored `dash` is the tell. */
export function hasPaintedEdge(shape: ShapeLike): boolean {
	return typeof propOf(shape, 'dash') === 'string'
}

/**
 * What the Line style popover shows as the edge's colour: the override, or —
 * with none — the shape's own colour, because that is what tldraw paints the
 * outline with. The palette is therefore never blank on a shape that has one.
 */
export function strokeColorOf(shape: ShapeLike): string | undefined {
	const override = readStrokeMeta(shape).color
	if (override) return override
	const color = propOf(shape, 'color')
	return typeof color === 'string' ? color : undefined
}

/** The line style in force: the async override, else the stored dash. */
export function linePatternOf(shape: ShapeLike): string | undefined {
	const pattern = readStrokeMeta(shape).pattern
	if (pattern) return pattern
	const dash = propOf(shape, 'dash')
	return typeof dash === 'string' ? dash : undefined
}

export function isAsyncStroke(shape: ShapeLike): boolean {
	return readStrokeMeta(shape).pattern === ASYNC_LINE_VALUE
}

/**
 * One value across the selection, or `mixed` — the same two states
 * `ReadonlySharedStyleMap` reports, so a meta-backed control reads exactly
 * like a style-backed one in the menu.
 */
export function sharedEdgeValue(
	shapes: readonly ShapeLike[],
	read: (shape: ShapeLike) => string | undefined,
): SharedStyle<string> | undefined {
	let found: string | undefined
	for (const shape of shapes) {
		if (!hasPaintedEdge(shape)) continue
		const value = read(shape)
		if (value === undefined) continue
		if (found === undefined) found = value
		else if (found !== value) return { type: 'mixed' }
	}
	return found === undefined ? undefined : { type: 'shared', value: found }
}

/** The edge colour a shape is painted with, resolved through the live theme. */
export function resolveStrokeHex(
	theme: TLTheme,
	colorMode: 'dark' | 'light',
	name: string | undefined,
): string | undefined {
	if (!name) return undefined
	const colors = theme.colors[colorMode] as unknown as Record<
		string,
		{ solid?: string } | string | undefined
	>
	const entry = colors?.[name]
	return typeof entry === 'object' ? entry?.solid : undefined
}

function editableShapes(editor: Editor): TLShape[] {
	return editor.getSelectedShapes().filter((shape) => hasPaintedEdge(shape))
}

/**
 * Apply an edge field to the selection in one history step, the way
 * `applyStyle` applies a stock style. There is no `setMetaForNextShapes`, so
 * an override lands on the shapes that exist; a newly drawn shape starts on
 * its own colour again.
 */
export function applyStrokeMeta(
	editor: Editor,
	field: StrokeMetaField,
	value: string | undefined,
): void {
	editor.markHistoryStoppingPoint('appearance')
	editor.run(() => {
		const shapes = editableShapes(editor)
		if (shapes.length === 0) return
		editor.updateShapes(
			shapes.map((shape) => ({
				id: shape.id,
				type: shape.type,
				meta: writeStrokeMeta(shape, field, value),
			})),
		)
	})
}

/**
 * The Line style chips write one control's worth of state across two homes:
 * a stock dash on the shape, and the async override beside it. Choosing a
 * stock style clears the override rather than leaving it to win invisibly.
 */
export function applyLinePattern(editor: Editor, value: string): void {
	const isAsync = value === ASYNC_LINE_VALUE
	editor.markHistoryStoppingPoint('appearance')
	editor.run(() => {
		const dash = isAsync ? ASYNC_BASE_DASH : value
		if (editor.isIn('select')) {
			editor.setStyleForSelectedShapes(DefaultDashStyle as StyleProp<string>, dash)
		}
		editor.setStyleForNextShapes(DefaultDashStyle as StyleProp<string>, dash)
		const shapes = editableShapes(editor)
		if (shapes.length === 0) return
		editor.updateShapes(
			shapes.map((shape) => ({
				id: shape.id,
				type: shape.type,
				meta: writeStrokeMeta(shape, 'pattern', isAsync ? ASYNC_LINE_VALUE : undefined),
			})),
		)
	})
}

/**
 * Seed the dash a fresh shape is drawn with.
 *
 * WHY: tldraw's own default is `draw` — the sketchy Excalidraw-ish outline the
 * Line style popover no longer offers, since SystemSketch's vocabulary is
 * FigJam's. Left alone, every new rectangle would land in a state its own menu
 * cannot express. Seeded only when the instance has no dash of its own, so a
 * choice made on the canvas still survives.
 */
export function seedDefaultLineStyle(editor: Editor): void {
	const stored = editor.getInstanceState().stylesForNextShape[DefaultDashStyle.id]
	if (stored !== undefined) return
	editor.setStyleForNextShapes(DefaultDashStyle as StyleProp<string>, ASYNC_BASE_DASH)
}

/** Exported for the tests that pin which stock styles the edge model touches. */
export const EDGE_STYLES = {
	dash: DefaultDashStyle as StyleProp<string>,
	color: DefaultColorStyle as StyleProp<string>,
}
