import { describe, expect, it } from 'vitest'

import { nearestClearTopLeft } from './avoidSiblingOcclusion'

describe('nearest clear placement after a stepped-in resize', () => {
	it('leaves a non-overlapping Block exactly where the user resized it', () => {
		expect(nearestClearTopLeft(
			{ minX: 100, minY: 100, maxX: 500, maxY: 400 },
			[{ minX: 540, minY: 120, maxX: 760, maxY: 300 }],
		)).toEqual({ x: 100, y: 100 })
	})

	it('moves the resized Block—not its obstacle—to the nearest clear position', () => {
		expect(nearestClearTopLeft(
			{ minX: 100, minY: 100, maxX: 500, maxY: 400 },
			[{ minX: 460, minY: 150, maxX: 700, maxY: 350 }],
		)).toEqual({ x: 28, y: 100 })
	})

	it('finds the nearest free corner when one obstacle blocks each axis', () => {
		expect(nearestClearTopLeft(
			{ minX: 100, minY: 100, maxX: 300, maxY: 300 },
			[
				{ minX: 250, minY: 100, maxX: 430, maxY: 300 },
				{ minX: 100, minY: 250, maxX: 300, maxY: 430 },
			],
		)).toEqual({ x: 18, y: 18 })
	})

	it('prefers the positive direction when two placements are equally near', () => {
		expect(nearestClearTopLeft(
			{ minX: 0, minY: 0, maxX: 100, maxY: 100 },
			[{ minX: 0, minY: 25, maxX: 100, maxY: 75 }],
		)).toEqual({ x: 0, y: 107 })
	})
})
