import { describe, expect, it } from 'vitest'

import { CODE_FONT_SIZES } from '../code/codeModel'
import {
	CUSTOM_FONT_PX_MAX,
	CUSTOM_FONT_PX_MIN,
	STOCK_LABEL_BASE_PX,
	STOCK_TEXT_BASE_PX,
	clampCustomFontPx,
	formatFontPx,
	nearestRungForPx,
} from './customFontSize'

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
