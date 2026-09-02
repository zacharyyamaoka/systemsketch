import { describe, expect, it } from 'vitest'
import {
	REVEAL_MIN_SCREEN_PX,
	REVEAL_PAD_SCREEN_PX,
	connectionRevealBounds,
	revealAreaContains,
} from './connectionRevealArea'

/** A U-shaped elbow: out to the right, down, back left, and out again. */
const U_ELBOW = [
	{ x: 0, y: 0 },
	{ x: 40, y: 0 },
	{ x: 40, y: 300 },
	{ x: 200, y: 300 },
	{ x: 200, y: 40 },
	{ x: 240, y: 40 },
]

describe('connection reveal area', () => {
	it('fits the arrow\'s outer extents, padded', () => {
		const bounds = connectionRevealBounds(U_ELBOW, 1)!
		expect(bounds.minX).toBe(0 - REVEAL_PAD_SCREEN_PX)
		expect(bounds.minY).toBe(0 - REVEAL_PAD_SCREEN_PX)
		expect(bounds.maxX).toBe(240 + REVEAL_PAD_SCREEN_PX)
		expect(bounds.maxY).toBe(300 + REVEAL_PAD_SCREEN_PX)
	})

	it('covers the empty middle of a U-bend, where distance-to-the-curve does not', () => {
		// (120, 150) is the centre of the U's opening: 80 units from the nearest
		// stroke, which no reasonable corridor would ever reach — and squarely
		// "on" the arrow to anyone looking at it. This is the whole reason the
		// region is a box.
		const bounds = connectionRevealBounds(U_ELBOW, 1)
		expect(revealAreaContains(bounds, { x: 120, y: 150 })).toBe(true)

		const nearestStroke = Math.min(120 - 40, 200 - 120)
		expect(nearestStroke).toBeGreaterThan(REVEAL_PAD_SCREEN_PX * 2)
	})

	it('stops outside the padded extents', () => {
		const bounds = connectionRevealBounds(U_ELBOW, 1)
		expect(revealAreaContains(bounds, { x: 240 + REVEAL_PAD_SCREEN_PX - 1, y: 20 })).toBe(true)
		expect(revealAreaContains(bounds, { x: 240 + REVEAL_PAD_SCREEN_PX + 1, y: 20 })).toBe(false)
		expect(revealAreaContains(bounds, { x: 120, y: -REVEAL_PAD_SCREEN_PX - 1 })).toBe(false)
	})

	it('keeps the region the same size on screen at every zoom', () => {
		for (const zoom of [0.25, 1, 4]) {
			const bounds = connectionRevealBounds(U_ELBOW, zoom)!
			// Padding is in screen pixels, so in page units it scales inversely.
			expect((0 - bounds.minX) * zoom).toBeCloseTo(REVEAL_PAD_SCREEN_PX, 6)
		}
	})

	it('gives a nearly degenerate cable a region you can still land on', () => {
		// Two touching ports: without a floor the reveal would be a sliver, and
		// the one gesture it gates would be unreachable.
		const bounds = connectionRevealBounds([{ x: 100, y: 100 }, { x: 101, y: 100 }], 1)!
		expect(bounds.w).toBeGreaterThanOrEqual(REVEAL_MIN_SCREEN_PX)
		expect(bounds.h).toBeGreaterThanOrEqual(REVEAL_MIN_SCREEN_PX)
		// ...and it grows about the centre, so it does not drift off the cable.
		expect(bounds.center.x).toBeCloseTo(100.5, 6)
		expect(bounds.center.y).toBeCloseTo(100, 6)
	})

	it('has no region for a cable with no route', () => {
		expect(connectionRevealBounds([], 1)).toBeNull()
		expect(revealAreaContains(null, { x: 0, y: 0 })).toBe(false)
	})
})
