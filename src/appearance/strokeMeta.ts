/**
 * A shape's edge: its own colour, its thickness, and the one line style
 * tldraw has no value for.
 *
 * FigJam paints a shape's fill and its edge separately — its Fill popover and
 * its Stroke popover each carry a palette — and SystemSketch needs a third
 * line style beside solid/dashed/dotted: the `async` packet cadence a cable
 * already draws (`connectionPresentation.ASYNC_PACKET_DASHARRAY`).
 *
 * None of the three fits in a stock style prop, and all are deliberately kept
 * out of one:
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
 * - WHY thickness is not the `size` style: stock tldraw derives a geo shape's
 *   stroke width AND its label font size from the one `size` rung, so the
 *   Font size list was silently the line-thickness control too — pick Extra
 *   large for a title and the rectangle's outline jumps from 3.5px to 10px.
 *   Zach's report ("it seems linked to the thickness of the text which is
 *   bad!!!"). An edge thickness of its own is the only way to break that
 *   coupling without forking the geo shape's schema.
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

import { sharedValueAcross } from '../contextualMenus/sharedValues'

export const SYSTEMSKETCH_STROKE_META_KEY = 'systemSketchStroke'

/** The one line style that is ours rather than tldraw's. */
export const ASYNC_LINE_VALUE = 'async'

/** The stock dash a shape actually stores while it wears the async cadence. */
export const ASYNC_BASE_DASH = 'solid'

/** Where a remembered thickness rides between shapes — see `rememberStrokeWidth`. */
const STROKE_WIDTH_INSTANCE_KEY = 'systemSketchStrokeWidth'

/** The three rungs the Line style popover offers, Excalidraw's ladder. */
export type StrokeWidthRung = 'thin' | 'medium' | 'thick'

const STROKE_WIDTH_RUNGS: readonly StrokeWidthRung[] = ['thin', 'medium', 'thick']

/**
 * tldraw's own `STROKE_SIZES` × the default theme's `strokeWidth` (2): the
 * width the engine paints a geo outline at for each `size` rung.
 *
 * WHY mirrored here: tldraw marks `STROKE_SIZES` `@internal` and does not
 * export it, exactly as with the font tables in `customFontSize.ts`. The
 * browser journey asserts rendered pixels, so an upstream change fails loudly
 * rather than drifting.
 */
export const STOCK_STROKE_PX: Record<string, number | undefined> = {
	s: 2, m: 3.5, l: 5, xl: 10,
}

/**
 * The thickness each rung paints, in scene units.
 *
 * The ladder is anchored, not invented: `thin` is tldraw's own `s` width, and
 * `medium` is exactly what every shape is already drawn at — so nothing on an
 * existing board moves when the control appears, and an untouched rectangle
 * reads truthfully as Medium instead of blank. `thick` is double medium,
 * because a three-rung ladder is only useful if the top rung is visibly the
 * top: tldraw's own `s`/`m`/`l` span just 2.5x end to end, which is why
 * Excalidraw's own three (1 : 2 : 4) read as a ladder and those would not.
 */
export const STROKE_WIDTH_PX: Record<StrokeWidthRung, number> = {
	thin: 2,
	medium: 3.5,
	thick: 7,
}

export interface SystemSketchStrokeMeta {
	/** A palette colour name. Absent means the edge follows the shape's colour. */
	color?: string
	/** `async` only; absent means the stored `dash` is the whole story. */
	pattern?: typeof ASYNC_LINE_VALUE
	/** Scene units. Absent means the stock `size` rung still sets the width. */
	width?: number
}

/** Which part of the edge a control writes. */
export type StrokeMetaField = 'color' | 'pattern' | 'width'

/**
 * The two fields the edge model reads. Deliberately structural rather than
 * `TLShape`: every shape type has its own props interface, and a test fixture
 * has neither, so this is the one description all three satisfy.
 */
export interface ShapeLike {
	meta?: Record<string, unknown>
	props?: object
	/** Present on real records only; the thickness model is the one reader. */
	type?: string
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
	const width = typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0
		? value.width
		: undefined
	return {
		...(color ? { color } : {}),
		...(pattern ? { pattern } : {}),
		...(width !== undefined ? { width } : {}),
	}
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
	else if (field === 'width') {
		const px = strokeWidthPxForRung(value)
		if (px === undefined) delete next.width
		else next.width = px
	} else next.pattern = ASYNC_LINE_VALUE
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

/** The rung a control value names, or undefined for anything else. */
export function strokeWidthPxForRung(value: string | undefined): number | undefined {
	return value && value in STROKE_WIDTH_PX
		? STROKE_WIDTH_PX[value as StrokeWidthRung]
		: undefined
}

function scaleOf(shape: ShapeLike): number {
	const scale = propOf(shape, 'scale')
	return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1
}

/**
 * Where a thickness override is actually painted.
 *
 * WHY a shape-type list rather than the broader `hasPaintedEdge`: the override
 * rides `getCustomDisplayValues`, and only these four utils are configured to
 * read it. A Block's cable carries a `dash` too, but its width is semantic —
 * an effect cable is thicker than a data cable on purpose — so the broad
 * predicate would offer a row whose paint the cable would silently ignore.
 * The row reads nothing on a cable and is dropped, rather than lying.
 *
 * The same reasoning keeps thickness off the Block-title and Code pills: a
 * title is a run of text and a Code block's frame is chrome, so neither
 * carries a user-painted edge to thicken. Audited through the lab's
 * `block-title` and `code` presets — see `menuLabModel.test.ts`.
 */
const STROKE_WIDTH_SHAPE_TYPES = new Set(['geo', 'draw', 'line', 'arrow'])

export function hasAdjustableStrokeWidth(shape: ShapeLike): boolean {
	return STROKE_WIDTH_SHAPE_TYPES.has(shape.type ?? '') && hasPaintedEdge(shape)
}

/**
 * The thickness a shape is actually painted at, in scene units — the
 * override, else the width its stock `size` rung derives.
 *
 * The stock reading is multiplied by `scale` because tldraw multiplies its own
 * display value by it, so this is what is on screen rather than what is stored.
 */
export function strokeWidthPxOf(shape: ShapeLike): number | undefined {
	if (!hasAdjustableStrokeWidth(shape)) return undefined
	const override = readStrokeMeta(shape).width
	if (override !== undefined) return override
	const size = propOf(shape, 'size')
	const base = typeof size === 'string' ? STOCK_STROKE_PX[size] : undefined
	return base === undefined ? undefined : base * scaleOf(shape)
}

/**
 * What the thickness row shows: the rung whose width is being painted, or the
 * raw number when none is — a shape still on tldraw's `xl` rung reads `10`,
 * and no row is check-marked, rather than a rung claiming a width it does not
 * have.
 */
export function strokeWidthOf(shape: ShapeLike): string | undefined {
	const px = strokeWidthPxOf(shape)
	if (px === undefined) return undefined
	const rung = STROKE_WIDTH_RUNGS.find(
		(name) => Math.abs(STROKE_WIDTH_PX[name] - px) < 0.001,
	)
	return rung ?? String(Math.round(px * 100) / 100)
}

/**
 * The unscaled width to hand `getCustomDisplayValues`, or undefined to leave
 * tldraw's own size-derived one alone.
 *
 * WHY divided by `scale`: tldraw multiplies the display value by the shape's
 * `scale`, and this app moves `scale` to reach an exact font size
 * (`customFontSize.ts`). Dividing here is what makes a chosen thickness
 * survive a text-size change — which is the entire point of the control.
 */
export function strokeWidthDisplayValue(shape: ShapeLike): number | undefined {
	const width = readStrokeMeta(shape).width
	return width === undefined ? undefined : width / scaleOf(shape)
}

/**
 * The one display value a thickness override contributes, ready to spread into
 * any `getCustomDisplayValues` result — geo, draw, line and arrow all name
 * this field the same way, which is what lets one control paint four shapes.
 */
export function strokeWidthDisplay(shape: ShapeLike): { strokeWidth?: number } {
	const width = strokeWidthDisplayValue(shape)
	return width === undefined ? {} : { strokeWidth: width }
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
	return sharedValueAcross(
		shapes.map((shape) => (hasPaintedEdge(shape) ? read(shape) : undefined)),
	)
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
 * Apply a thickness rung to every width-bearing shape in the selection, and
 * remember it for the next one.
 *
 * WHY the write is not `setStyleForSelectedShapes`: thickness lives in meta,
 * for the reasons at the top of this file. `editor.updateShapes` is the same
 * one-history-step shape `applyStrokeMeta` uses, so undo takes the whole row
 * back at once.
 */
export function applyStrokeWidth(editor: Editor, rung: string): void {
	const px = strokeWidthPxForRung(rung)
	if (px === undefined) return
	editor.markHistoryStoppingPoint('appearance')
	editor.run(() => {
		rememberStrokeWidth(editor, px)
		const shapes = editor.getSelectedShapes().filter(hasAdjustableStrokeWidth)
		if (shapes.length === 0) return
		editor.updateShapes(
			shapes.map((shape) => ({
				id: shape.id,
				type: shape.type,
				meta: writeStrokeMeta(shape, 'width', rung),
			})),
		)
	})
}

/**
 * Freeze the thickness a selection is currently painted at, before something
 * else moves it.
 *
 * WHY this exists: Zach's actual report was not "there is no thickness
 * control", it was "it seems linked to the thickness of the text which is
 * bad!!!" — stock tldraw derives a geo shape's stroke width AND its label font
 * size from the one `size` rung, so choosing Extra large for a title jumped
 * the outline from 3.5px to 10px. Adding a control does not fix that on its
 * own; the Font size write has to stop dragging the outline with it. Pinning
 * the CURRENT painted width first means the type change is visibly a type
 * change, and the thickness row still reads exactly what it read before.
 *
 * Only shapes with no thickness of their own are touched — a chosen rung is
 * already immune — so this converges rather than rewriting meta every time.
 */
export function pinStrokeWidth(editor: Editor): void {
	const updates = editor.getSelectedShapes()
		.filter((shape) => hasAdjustableStrokeWidth(shape) && readStrokeMeta(shape).width === undefined)
		.flatMap((shape) => {
			const px = strokeWidthPxOf(shape)
			if (px === undefined) return []
			const meta = { ...(shape.meta ?? {}) } as JsonObject
			const existing = meta[SYSTEMSKETCH_STROKE_META_KEY]
			meta[SYSTEMSKETCH_STROKE_META_KEY] = {
				...(isRecord(existing) ? (existing as JsonObject) : {}),
				width: px,
			}
			return [{ id: shape.id, type: shape.type, meta }]
		})
	if (updates.length > 0) editor.updateShapes(updates)
}

/**
 * tldraw's `stylesForNextShape` for a value that is not a style.
 *
 * WHY the instance record's own `meta`: there is no `setMetaForNextShapes`,
 * and a chosen thickness that the next rectangle silently forgets would read
 * as broken beside Colour and Line style, which both persist. The instance
 * record is the same place tldraw keeps its own next-shape memory.
 */
function rememberStrokeWidth(editor: Editor, px: number): void {
	const meta = { ...editor.getInstanceState().meta }
	meta[STROKE_WIDTH_INSTANCE_KEY] = px
	editor.updateInstanceState({ meta })
}

/** The thickness the next drawn shape will take, if one has been chosen. */
export function nextStrokeWidth(editor: Editor): number | undefined {
	const value = editor.getInstanceState().meta[STROKE_WIDTH_INSTANCE_KEY]
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Give a freshly created shape the remembered thickness.
 *
 * `getInitialMetaForShape` is tldraw's own seam for exactly this, and its
 * result is spread UNDER the shape's own meta — so a duplicate, a paste, and
 * a detached composite all keep the thickness they were carrying, and only a
 * genuinely new shape picks up the remembered one.
 */
export function installStrokeWidthDefault(editor: Editor): () => void {
	const stock = editor.getInitialMetaForShape.bind(editor)
	editor.getInitialMetaForShape = (shape) => {
		const base = stock(shape)
		const px = nextStrokeWidth(editor)
		if (px === undefined || !hasAdjustableStrokeWidth(shape)) return base
		const existing = base[SYSTEMSKETCH_STROKE_META_KEY]
		return {
			...base,
			[SYSTEMSKETCH_STROKE_META_KEY]: {
				...(isRecord(existing) ? (existing as JsonObject) : {}),
				width: px,
			},
		}
	}
	return () => {
		editor.getInitialMetaForShape = stock
	}
}

/**
 * Seed the dash a fresh shape is drawn with.
 *
 * WHY: tldraw's own default is `draw`, the sketchy Excalidraw-ish outline.
 * The Line style popover offers it too now ("Hand-drawn", the excalidraw
 * icon vendoring's `SloppinessArtistIcon` — see `contextualControlRegistry.ts`
 * and `AppearanceGlyph.tsx`), so this is no longer a menu-vocabulary gap this
 * seed papers over — it is SystemSketch's own house style: new shapes still
 * start crisp, and Hand-drawn is something a person opts into rather than the
 * shape they get by default. Seeded only when the instance has no dash of its
 * own, so a choice made on the canvas still survives.
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
