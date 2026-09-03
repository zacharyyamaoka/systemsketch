import { describe, expect, it } from 'vitest'

import {
	CONNECTOR_CONTROL_MIN_SCREEN_PX,
	CONNECTOR_CONTROL_PAD_SCREEN_PX,
	connectorControlBounds,
	connectorControlBoundsContains,
} from './connectorControlVisibility'

const U_ELBOW = [
	{ x: 0, y: 0 },
	{ x: 40, y: 0 },
	{ x: 40, y: 300 },
	{ x: 200, y: 300 },
	{ x: 200, y: 40 },
	{ x: 240, y: 40 },
]

describe('shared connector control bounds', () => {
	it('fits the route outer rectangle with screen-stable padding', () => {
		const bounds = connectorControlBounds(U_ELBOW, 1)!
		expect(bounds.minX).toBe(-CONNECTOR_CONTROL_PAD_SCREEN_PX)
		expect(bounds.minY).toBe(-CONNECTOR_CONTROL_PAD_SCREEN_PX)
		expect(bounds.maxX).toBe(240 + CONNECTOR_CONTROL_PAD_SCREEN_PX)
		expect(bounds.maxY).toBe(300 + CONNECTOR_CONTROL_PAD_SCREEN_PX)

		for (const zoom of [0.25, 1, 4]) {
			const scaled = connectorControlBounds(U_ELBOW, zoom)!
			expect((0 - scaled.minX) * zoom).toBeCloseTo(CONNECTOR_CONTROL_PAD_SCREEN_PX, 6)
		}
	})

	it('includes empty space inside a multi-elbow footprint and excludes the outside', () => {
		const bounds = connectorControlBounds(U_ELBOW, 1)
		expect(connectorControlBoundsContains(bounds, { x: 120, y: 150 })).toBe(true)
		expect(connectorControlBoundsContains(bounds, {
			x: 240 + CONNECTOR_CONTROL_PAD_SCREEN_PX + 1,
			y: 20,
		})).toBe(false)
	})

	it('gives a nearly degenerate connector an enterable rectangle', () => {
		const bounds = connectorControlBounds([{ x: 100, y: 100 }, { x: 101, y: 100 }], 1)!
		expect(bounds.w).toBeGreaterThanOrEqual(CONNECTOR_CONTROL_MIN_SCREEN_PX)
		expect(bounds.h).toBeGreaterThanOrEqual(CONNECTOR_CONTROL_MIN_SCREEN_PX)
		expect(bounds.center.x).toBeCloseTo(100.5, 6)
		expect(bounds.center.y).toBeCloseTo(100, 6)
	})

	it('has no rectangle without route points', () => {
		expect(connectorControlBounds([], 1)).toBeNull()
		expect(connectorControlBoundsContains(null, { x: 0, y: 0 })).toBe(false)
	})
})
