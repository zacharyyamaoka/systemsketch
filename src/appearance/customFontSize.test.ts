import { describe, expect, it } from 'vitest'
import type { Editor, TLShape } from 'tldraw'

import { CODE_FONT_SIZES } from '../code/codeModel'
import {
	CUSTOM_FONT_PX_MAX,
	CUSTOM_FONT_PX_MIN,
	STOCK_LABEL_BASE_PX,
	STOCK_TEXT_BASE_PX,
	clampCustomFontPx,
	formatFontPx,
	nearestRungForPx,
	selectionOnPresetRungs,
	selectionRungPx,
	sharedFontPx,
} from './customFontSize'

/** Only the two readers the selection helpers actually call. */
function editorSelecting(...shapes: { type: string; props: Record<string, unknown> }[]): Editor {
	return {
		getSelectedShapes: () => shapes as unknown as TLShape[],
		getSortedChildIdsForParent: () => [],
	} as unknown as Editor
}

const text = (size: string, scale = 1) => ({ type: 'text', props: { size, scale } })
const note = (size: string, scale = 1) => ({ type: 'note', props: { size, scale } })

describe('custom font size math', () => {
	it('mirrors the capability report base rungs: text s=18, m=24', () => {
		// docs/build_stock_tldr_capabilities.py proved 11px = s x 11/18 and
		// 29px = m x 29/24 in the bare stock viewer; these tables are what
		// makes the same arithmetic reproduce those exact records.
		expect(STOCK_TEXT_BASE_PX.s).toBe(18)
		expect(STOCK_TEXT_BASE_PX.m).toBe(24)
		expect(STOCK_TEXT_BASE_PX.l).toBe(36)
		expect(STOCK_TEXT_BASE_PX.xl).toBe(44)
		expect(STOCK_LABEL_BASE_PX).toEqual({ s: 18, m: 22, l: 26, xl: 32 })
	})

	it('anchors on the rung nearest in ratio, keeping the multiplier near 1', () => {
		expect(nearestRungForPx(STOCK_TEXT_BASE_PX, 18)).toBe('s')
		expect(nearestRungForPx(STOCK_TEXT_BASE_PX, 11)).toBe('s')
		expect(nearestRungForPx(STOCK_TEXT_BASE_PX, 24)).toBe('m')
		// 30px: m needs x1.25, l needs x0.833 -> l wins on log distance.
		expect(nearestRungForPx(STOCK_TEXT_BASE_PX, 30)).toBe('l')
		expect(nearestRungForPx(STOCK_TEXT_BASE_PX, 100)).toBe('xl')
		expect(nearestRungForPx(CODE_FONT_SIZES, 13)).toBe('s')
		expect(nearestRungForPx(CODE_FONT_SIZES, 17)).toBe('m')
	})

	it('rung base times the derived scale reproduces the asked px exactly', () => {
		for (const px of [7, 11, 17, 29, 64, 200]) {
			for (const table of [STOCK_TEXT_BASE_PX, STOCK_LABEL_BASE_PX, CODE_FONT_SIZES]) {
				const rung = nearestRungForPx(table, px)
				expect(table[rung] * (px / table[rung])).toBeCloseTo(px, 10)
			}
		}
	})

	it('clamps typed entry into a recoverable range', () => {
		expect(clampCustomFontPx(1)).toBe(CUSTOM_FONT_PX_MIN)
		expect(clampCustomFontPx(1600)).toBe(CUSTOM_FONT_PX_MAX)
		expect(clampCustomFontPx(17)).toBe(17)
		expect(Number.isNaN(clampCustomFontPx(Number.NaN))).toBe(true)
	})

	it('formats whole px without a decimal and others with one', () => {
		expect(formatFontPx(24)).toBe('24')
		expect(formatFontPx(16.666)).toBe('16.7')
	})
})

describe('the named rungs are a type role, not a size', () => {
	it('reads xl off a different table for a Text shape and a sticky note', () => {
		expect(selectionRungPx(editorSelecting(text('xl')), 'xl')).toBe(44)
		expect(selectionRungPx(editorSelecting(note('xl')), 'xl')).toBe(32)
	})

	it('prints no px where the selection spans two tables', () => {
		const mixed = editorSelecting(text('xl'), note('xl'))
		expect(selectionRungPx(mixed, 'xl')).toBeNull()
		// ...and the same pair carries no single effective size either, which
		// is precisely why the row must not be checked.
		expect(sharedFontPx(mixed)).toBe('mixed')
		expect(selectionOnPresetRungs(mixed)).toBe(false)
	})

	it('still checks a row when one table backs the whole selection', () => {
		expect(selectionOnPresetRungs(editorSelecting(text('xl'), text('xl')))).toBe(true)
		expect(selectionRungPx(editorSelecting(note('m'), note('l')), 'm')).toBe(22)
	})

	it('withholds the check once any participant carries a custom scale', () => {
		expect(selectionOnPresetRungs(editorSelecting(text('xl', 2)))).toBe(false)
	})

	it('says nothing at all when no shape has a font size', () => {
		const drawing = editorSelecting({ type: 'draw', props: { scale: 1 } })
		expect(selectionRungPx(drawing, 'xl')).toBeNull()
		expect(sharedFontPx(drawing)).toBeNull()
	})
})
