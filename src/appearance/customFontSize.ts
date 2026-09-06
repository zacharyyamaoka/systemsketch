/**
 * Custom (continuous) font size over stock tldraw's four size rungs.
 *
 * The mechanism is the one `docs/build_stock_tldr_capabilities.py` proved in
 * the bare stock viewer: every stock text-bearing record ALSO carries a plain
 * numeric `scale` prop that multiplies the rung's base pixel size, so any
 * effective size is `basePx[rung] × scale` — no fork, no custom paint, and a
 * detached file still renders at the exact size in stock tldraw. The Code
 * block is the one non-stock shape in the menu; it mirrors the same contract
 * through its own `fontScale` prop (`src/code/codeModel.ts`), because stock
 * `scale` is not part of its schema.
 *
 * WHY the base tables are mirrored here: tldraw marks `FONT_SIZES` /
 * `LABEL_FONT_SIZES` `@internal` and does not export them. They are em values
 * against the default 16px theme font (`theme.fontSize × table[rung]` in
 * TextShapeUtil/GeoShapeUtil/NoteShapeUtil), i.e. text 18/24/36/44 and shape
 * labels 18/22/26/32 — the same s=18 / m=24 the capability report measured on
 * screen. The browser journey asserts the rendered pixels, so a silent
 * upstream change fails loudly rather than drifting.
 */
import { DefaultSizeStyle, type Editor, type TLShape, type TLShapePartial } from 'tldraw'

import { CODE_FONT_SIZES, CODE_SHAPE_TYPE } from '../code/codeModel'

export type SizeRung = 's' | 'm' | 'l' | 'xl'
const RUNGS: readonly SizeRung[] = ['s', 'm', 'l', 'xl']

/** tldraw `FONT_SIZES` × 16 — the Text shape's own type scale. */
export const STOCK_TEXT_BASE_PX: Record<SizeRung, number> = { s: 18, m: 24, l: 36, xl: 44 }
/** tldraw `LABEL_FONT_SIZES` × 16 — geo and note labels. */
export const STOCK_LABEL_BASE_PX: Record<SizeRung, number> = { s: 18, m: 22, l: 26, xl: 32 }

/** Bounds for typed entry — wide enough for posters, tight enough to keep a
 * fat-fingered `1600` from producing an unrecoverable shape. */
export const CUSTOM_FONT_PX_MIN = 4
export const CUSTOM_FONT_PX_MAX = 400

export function clampCustomFontPx(px: number): number {
	if (!Number.isFinite(px)) return NaN
	return Math.min(CUSTOM_FONT_PX_MAX, Math.max(CUSTOM_FONT_PX_MIN, px))
}

/**
 * WHY an allowlist rather than "anything with a `scale` prop": draw,
 * highlight, line and arrow shapes carry the same stock `scale`, but there it
 * is the record of a whole-artwork resize gesture — steering or resetting it
 * from a FONT menu would silently rescale drawings. Only the shapes whose
 * scale this menu semantically owns (their text IS the shape) participate.
 */
function baseTableFor(shape: TLShape): Record<SizeRung, number> | null {
	switch (shape.type) {
		case 'text': return STOCK_TEXT_BASE_PX
		case 'geo':
		case 'note': return STOCK_LABEL_BASE_PX
		case CODE_SHAPE_TYPE: return CODE_FONT_SIZES
		default: return null
	}
}

function isRung(value: unknown): value is SizeRung {
	return typeof value === 'string' && (RUNGS as readonly string[]).includes(value)
}

interface FontProps {
	size?: unknown
	scale?: unknown
	fontScale?: unknown
}

function fontScaleOf(shape: TLShape): number {
	const props = shape.props as FontProps
	const raw = shape.type === CODE_SHAPE_TYPE ? props.fontScale : props.scale
	return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1
}

/**
 * The rung a target pixel size anchors to: nearest in RATIO (log distance),
 * so 30px on a text shape prefers l=36 (×0.83) over m=24 (×1.25).
 *
 * WHY nearest-rung instead of one fixed anchor: `size` also drives the rest
 * of the shape's presentation (a geo's stroke weight, a note's box), and
 * `scale` multiplies all of it — keeping the multiplier near 1 keeps the
 * shape closest to how stock tldraw would draw it at the asked size, instead
 * of e.g. a hairline stroke stretched 2.4×.
 */
export function nearestRungForPx(table: Record<SizeRung, number>, px: number): SizeRung {
	let best: SizeRung = 's'
	let bestDistance = Infinity
	for (const rung of RUNGS) {
		const distance = Math.abs(Math.log(px / table[rung]))
		if (distance < bestDistance) { best = rung; bestDistance = distance }
	}
	return best
}

/** Effective rendered font pixels for one shape, or null when it has none. */
export function effectiveFontPx(shape: TLShape): number | null {
	const table = baseTableFor(shape)
	if (!table) return null
	const props = shape.props as FontProps
	if (!isRung(props.size)) return null
	return table[props.size] * fontScaleOf(shape)
}

/**
 * The selection's font-size participants, groups included: tldraw's own
 * `setStyleForSelectedShapes` descends into groups, so the custom write and
 * the readbacks must see the same shapes it would touch.
 */
export function fontSizeTargets(editor: Editor): TLShape[] {
	const collect = (shape: TLShape): TLShape[] => {
		if (shape.type === 'group') {
			return editor.getSortedChildIdsForParent(shape.id)
				.map((id) => editor.getShape(id))
				.filter((child): child is TLShape => Boolean(child))
				.flatMap(collect)
		}
		return baseTableFor(shape) ? [shape] : []
	}
	return editor.getSelectedShapes().flatMap(collect)
}

/** One shared effective px across the selection, 'mixed', or null (none apply). */
export function sharedFontPx(editor: Editor): number | 'mixed' | null {
	const values = fontSizeTargets(editor)
		.map(effectiveFontPx)
		.filter((px): px is number => px !== null)
	if (values.length === 0) return null
	const first = values[0]
	return values.every((px) => Math.abs(px - first) < 0.01) ? first : 'mixed'
}

/** True when every participant sits exactly on its rung (scale 1), so the
 * preset rows' check marks tell the truth. */
export function selectionOnPresetRungs(editor: Editor): boolean {
	return fontSizeTargets(editor).every((shape) => fontScaleOf(shape) === 1)
}

/**
 * Apply an exact pixel size to every font-bearing shape in the selection:
 * nearest rung + the residual as the shape's scale (stock `scale` for
 * text/geo/note, the Code block's own `fontScale`). A plain-prop write, not a
 * style write — `scale` is not a StyleProp, so `setStyleForSelectedShapes`
 * cannot carry it, and (deliberately) the next drawn shape does NOT inherit a
 * custom px; only the rung participates in tldraw's next-shape style memory.
 */
export function applyCustomFontPx(editor: Editor, px: number): void {
	const target = clampCustomFontPx(px)
	if (!Number.isFinite(target)) return
	const shapes = fontSizeTargets(editor)
	if (shapes.length === 0) return
	const updates: TLShapePartial[] = shapes.map((shape) => {
		const table = baseTableFor(shape)!
		const rung = nearestRungForPx(table, target)
		const scale = target / table[rung]
		// Cast: TLShapePartial is a distributive union keyed by literal shape
		// type; a runtime-narrowed `shape.type` can't index it statically.
		return (shape.type === CODE_SHAPE_TYPE
			? { id: shape.id, type: shape.type, props: { size: rung, fontScale: scale } }
			: { id: shape.id, type: shape.type, props: { size: rung, scale } }) as TLShapePartial
	})
	editor.markHistoryStoppingPoint('custom font size')
	editor.run(() => {
		editor.updateShapes(updates)
		// Keep tldraw's next-shape memory on the rung the custom size anchored
		// to, so the next text drawn lands near the chosen size.
		const rungs = new Set(updates.map((update) => (update.props as { size: SizeRung }).size))
		if (rungs.size === 1) editor.setStyleForNextShapes(DefaultSizeStyle, [...rungs][0])
	})
}

/**
 * Snap the selection back onto its rungs (scale → 1) — used by the preset
 * rows. WHY: after a custom size, clicking `Medium` must actually render
 * Medium; leaving a residual ×1.3 scale would make the check-marked row a
 * lie. Scoped to the same allowlist as everything above, so a drawing's
 * resize scale is never touched.
 */
export function resetCustomFontScale(editor: Editor): void {
	const updates: TLShapePartial[] = fontSizeTargets(editor)
		.filter((shape) => fontScaleOf(shape) !== 1)
		.map((shape) => (shape.type === CODE_SHAPE_TYPE
			? { id: shape.id, type: shape.type, props: { fontScale: 1 } }
			: { id: shape.id, type: shape.type, props: { scale: 1 } }) as TLShapePartial)
	if (updates.length > 0) editor.updateShapes(updates)
}

/** Display formatting: whole numbers stay whole, else one decimal. */
export function formatFontPx(px: number): string {
	const rounded = Math.round(px * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
