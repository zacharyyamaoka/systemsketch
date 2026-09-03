import { describe, expect, it } from 'vitest'
import type { JsonObject } from 'tldraw'
import {
	SYSTEMSKETCH_ARROW_ROUTE_META_KEY,
	readSystemSketchArrowRoute,
} from './systemSketchArrow'

const validRoute = {
	version: 1,
	route: {
		startAxis: 'x',
		corners: [
			{ tx: 0.25, ox: 12, ty: 0.5, oy: -8 },
			{ tx: 0.75, ox: -4, ty: 0.5, oy: 18 },
		],
	},
}

describe('SystemSketch arrow route metadata', () => {
	it('reads the versioned multi-elbow route without changing stock arrow props', () => {
		const meta = { [SYSTEMSKETCH_ARROW_ROUTE_META_KEY]: validRoute } as unknown as JsonObject
		expect(readSystemSketchArrowRoute(meta)).toEqual(validRoute.route)
	})

	it.each([
		{},
		{ version: 2, route: validRoute.route },
		{ version: 1, route: { startAxis: 'z', corners: [] } },
		{ version: 1, route: { startAxis: 'x', corners: [{ tx: Number.NaN }] } },
	])('falls back to the stock elbow for malformed or future metadata: %j', (stored) => {
		const meta = { [SYSTEMSKETCH_ARROW_ROUTE_META_KEY]: stored } as unknown as JsonObject
		expect(readSystemSketchArrowRoute(meta)).toBeNull()
	})
})
