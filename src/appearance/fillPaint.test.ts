/**
 * The three fills have to be three visibly different things.
 *
 * The bug these pin: tldraw painted `semi` with the theme's flat canvas colour
 * and `solid` with an 18% wash, so on a white canvas Transparent was
 * indistinguishable from No fill, and on a white swatch all three were the
 * same white box.
 */
import { describe, expect, it } from 'vitest'

import { TRANSPARENT_FILL_ALPHA, fillPaintFor } from './fillPaint'

const COLORS = {
	blue: { fill: '#3dadff', solid: '#3dadff' },
	black: { fill: '#1d1d1d', solid: '#1d1d1d' },
	white: { fill: '#ffffff', solid: '#ffffff' },
	// The theme's flat UI colours sit in the same table and are not swatches.
	solid: '#fcfffe',
}

describe('the three fills', () => {
	it('paints Solid as the swatch itself, not a wash of it', () => {
		expect(fillPaintFor(COLORS, 'solid', 'blue').fillColor).toBe('#3dadff')
	})

	it('paints Transparent as the same colour you can see through', () => {
		const paint = fillPaintFor(COLORS, 'semi', 'blue').fillColor!
		expect(paint.startsWith('#3dadff')).toBe(true)
		expect(paint).toHaveLength(9)
		expect(parseInt(paint.slice(7), 16)).toBe(Math.round(TRANSPARENT_FILL_ALPHA * 255))
	})

	it('keeps the three apart even on the swatch that used to collapse them', () => {
		// White was the worst case: solid, semi and none all painted white.
		const solid = fillPaintFor(COLORS, 'solid', 'white').fillColor
		const semi = fillPaintFor(COLORS, 'semi', 'white').fillColor
		expect(solid).toBe('#ffffff')
		expect(semi).not.toBe(solid)
		expect(fillPaintFor(COLORS, 'none', 'white')).toEqual({})
	})

	it('gives a solid fill readable ink, so a black box keeps its label', () => {
		expect(fillPaintFor(COLORS, 'solid', 'black').labelColor).toBe('#ffffff')
		expect(fillPaintFor(COLORS, 'solid', 'white').labelColor).toBe('#000000')
		// A wash leaves the canvas light, so the label stays tldraw's own.
		expect(fillPaintFor(COLORS, 'semi', 'black').labelColor).toBeUndefined()
	})

	it('says nothing about the fills it does not speak for', () => {
		// `fill`, `pattern` and `lined-fill` are still stored on real boards and
		// must keep painting exactly as tldraw paints them.
		for (const fill of ['none', 'fill', 'pattern', 'lined-fill']) {
			expect(fillPaintFor(COLORS, fill, 'blue')).toEqual({})
		}
		// A custom hex has no swatch entry in the theme table.
		expect(fillPaintFor(COLORS, 'solid', 'custom-a3f2c1')).toEqual({})
	})
})
