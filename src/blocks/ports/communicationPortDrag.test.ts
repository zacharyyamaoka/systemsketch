import { describe, expect, it } from 'vitest'

import { blockEdgeAt } from './communicationPortDrag'
import { spreadRailFractions } from '../layoutBlock'

describe('blockEdgeAt picks the wall a held socket should land on', () => {
	const size = { w: 340, h: 200 }

	it('answers with the nearest edge, never null', () => {
		// Deliberately far outside: once the hold has begun the answer is always
		// an edge, or the dot would stick instead of following the pointer.
		expect(blockEdgeAt(size, { x: -900, y: 100 }).edge).toBe('left')
		expect(blockEdgeAt(size, { x: 1200, y: 100 }).edge).toBe('right')
		expect(blockEdgeAt(size, { x: 170, y: -700 }).edge).toBe('top')
		expect(blockEdgeAt(size, { x: 170, y: 900 }).edge).toBe('bottom')
	})

	it('reports how far along that edge the socket sits', () => {
		expect(blockEdgeAt(size, { x: 85, y: -20 })).toMatchObject({ edge: 'top', edgeT: 0.25 })
		expect(blockEdgeAt(size, { x: 255, y: 220 })).toMatchObject({ edge: 'bottom', edgeT: 0.75 })
		expect(blockEdgeAt(size, { x: -20, y: 150 })).toMatchObject({ edge: 'left', edgeT: 0.75 })
	})

	it('clamps a pointer past the corner into the edge it is nearest', () => {
		const hit = blockEdgeAt(size, { x: -50, y: -50 })
		expect(['left', 'top']).toContain(hit.edge)
		expect(hit.edgeT).toBeGreaterThanOrEqual(0)
		expect(hit.edgeT).toBeLessThanOrEqual(1)
	})

	it('survives a degenerate Block without dividing by zero', () => {
		const hit = blockEdgeAt({ w: 0, h: 0 }, { x: 0, y: 0 })
		expect(Number.isFinite(hit.edgeT)).toBe(true)
	})
})

describe('spreadRailFractions keeps authored positions but never overlaps', () => {
	it('leaves a single socket exactly where it was put', () => {
		expect(spreadRailFractions([0.5])).toEqual([0.5])
		expect(spreadRailFractions([0.13])).toEqual([0.13])
	})

	it('leaves well-separated sockets untouched', () => {
		expect(spreadRailFractions([0.1, 0.5, 0.9])).toEqual([0.1, 0.5, 0.9])
	})

	it('pushes colliding sockets apart by only as much as it takes', () => {
		const spread = spreadRailFractions([0.5, 0.5, 0.5], 0.2)
		expect(spread[1] - spread[0]).toBeCloseTo(0.2, 5)
		expect(spread[2] - spread[1]).toBeCloseTo(0.2, 5)
		// The first one keeps its authored spot; the crowd moves, not the anchor.
		expect(spread[0]).toBeCloseTo(0.5, 5)
	})

	it('shifts a run back rather than letting it fall off the rail', () => {
		const spread = spreadRailFractions([0.9, 0.95], 0.2)
		expect(Math.max(...spread)).toBeLessThanOrEqual(1)
		expect(Math.min(...spread)).toBeGreaterThanOrEqual(0)
		expect(spread[1] - spread[0]).toBeCloseTo(0.2, 5)
	})

	it('degrades to an even spread when the rail genuinely cannot fit them', () => {
		const spread = spreadRailFractions([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 0.3)
		expect(spread[0]).toBeCloseTo(0, 5)
		expect(spread[spread.length - 1]).toBeCloseTo(1, 5)
		for (let index = 1; index < spread.length; index += 1) {
			expect(spread[index]).toBeGreaterThan(spread[index - 1])
		}
	})

	it('never returns a fraction off the edge', () => {
		for (const input of [[-3, 0.5, 9], [1, 1, 1], [0, 0, 0]]) {
			for (const value of spreadRailFractions(input)) {
				expect(value).toBeGreaterThanOrEqual(0)
				expect(value).toBeLessThanOrEqual(1)
			}
		}
	})
})
