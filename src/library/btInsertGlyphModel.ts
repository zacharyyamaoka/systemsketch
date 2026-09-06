import { T, type TLShape } from 'tldraw'

/**
 * The library's static clone of the Behavior Tree region's "+" insert
 * affordance (`.BehaviorTree-insert` in behaviorTree/behavior-tree.css).
 *
 * WHY its own shape type rather than a stock `geo` catalog entry like
 * Flowchart's Process/Decision boxes: no stock geo kind carries an arbitrary
 * flat fill, a baked-in "+" glyph and this exact corner radius at once, and
 * every other Behavior Tree primitive on the roadmap (node cards, Sequence /
 * Fallback / Parallel glyphs) is the same kind of bespoke app visual with no
 * stock equivalent — so this establishes the "library item creates a custom
 * shape" seam the rest of that roadmap will also need, rather than special
 * -casing one geo shape. See BtInsertGlyphShapeUtil.tsx for the rendering
 * and the token reuse that keeps it in sync with the live affordance.
 */
export const BT_INSERT_GLYPH_SHAPE_TYPE = 'systemsketch-bt-insert-glyph' as const
export const BT_INSERT_GLYPH_TOOL_ID = BT_INSERT_GLYPH_SHAPE_TYPE
/** Exact match to the live `.BehaviorTree-insert` button's 28px resting size. */
export const BT_INSERT_GLYPH_SIZE = 28 as const

export const BT_INSERT_GLYPH_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[BT_INSERT_GLYPH_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type BtInsertGlyphShape = TLShape<typeof BT_INSERT_GLYPH_SHAPE_TYPE>
export type BtInsertGlyphShapeProps = BtInsertGlyphShape['props']

export function getDefaultBtInsertGlyphProps(): BtInsertGlyphShapeProps {
	return { w: BT_INSERT_GLYPH_SIZE, h: BT_INSERT_GLYPH_SIZE }
}

export function isBtInsertGlyphShape(shape: TLShape | null | undefined): shape is BtInsertGlyphShape {
	return shape?.type === BT_INSERT_GLYPH_SHAPE_TYPE
}
