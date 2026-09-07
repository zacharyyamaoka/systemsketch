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
import { sharedValueAcross } from '../contextualMenus/sharedValues'

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

/** Narrow a menu option's raw string to one of the four stock size rungs. */
export function isSizeRung(value: unknown): value is SizeRung {
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
	if (!isSizeRung(props.size)) return null
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
	const shared = sharedValueAcross(
		fontSizeTargets(editor).map((shape) => effectiveFontPx(shape) ?? undefined),
		(a, b) => Math.abs(a - b) < 0.01,
	)
	if (!shared) return null
	return shared.type === 'shared' ? shared.value : 'mixed'
}

/**
 * The pixels one preset rung actually produces for this selection, or null
 * when the participants do not agree on a single base table.
 *
 * WHY this is not a constant: stock tldraw has THREE type scales behind the
 * one set of rung names — a Text shape's `xl` is 44px, a geo or note label's
 * is 32px, and the Code block's is 24px — because `size` is a type ROLE
 * (heading / label / code), not a pixel size. tldraw is right to keep them
 * apart (a sticky's box and a geo's stroke are sized off the same rung), but
 * a menu that prints only "Extra large" then lies by omission: two shapes
 * read as the same setting and render 12px apart. So the rows carry their own
 * px, measured from the shapes actually selected. FigJam can show names alone
 * because ITS named sizes are absolute; ours are not, so the number comes too.
 */
export function selectionRungPx(editor: Editor, rung: SizeRung): number | null {
	const table = sharedBaseTable(editor)
	return table ? table[rung] : null
}

/** The one base table behind the whole selection, or null when it is mixed. */
function sharedBaseTable(editor: Editor): Record<SizeRung, number> | null {
	const tables = fontSizeTargets(editor).map(baseTableFor)
	const first = tables[0]
	if (!first) return null
	return tables.every((table) => table === first) ? first : null
}

/**
 * True when the preset rows tell the truth about what is on screen: every
 * participant sits exactly on its rung (scale 1) AND every participant reads
 * that rung off the same base table. A Text shape and a sticky note both at
 * `xl` are both "on their rung" and still render 44px against 32px — checking
 * `Extra large` for that pair would claim a shared size the canvas does not
 * have, so the rows withhold the mark and the trigger falls back to `Mixed`.
 */
export function selectionOnPresetRungs(editor: Editor): boolean {
	const shapes = fontSizeTargets(editor)
	if (shapes.length === 0) return true
	return shapes.every((shape) => fontScaleOf(shape) === 1) && sharedBaseTable(editor) !== null
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
