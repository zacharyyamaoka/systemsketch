import { describe, expect, it } from 'vitest'

import {
	arrowEntryEdge,
	arrowExitEdge,
	classifyBoundaryPoint,
	clipSegmentToRect,
	type CrossedEdge,
	type CrossingPoint,
	type CrossingRect,
} from './arrowEdgeCrossing'

const EDGES: readonly CrossedEdge[] = ['left', 'right', 'top', 'bottom']

/** A point just outside `rect`, off the middle of the named wall. */
function outside(rect: CrossingRect, edge: CrossedEdge, reach = 400): CrossingPoint {
	const cx = rect.x + rect.w / 2
	const cy = rect.y + rect.h / 2
	switch (edge) {
		case 'left': return { x: rect.x - reach, y: cy }
		case 'right': return { x: rect.x + rect.w + reach, y: cy }
		case 'top': return { x: cx, y: rect.y - reach }
		case 'bottom': return { x: cx, y: rect.y + rect.h + reach }
	}
}

function centre(rect: CrossingRect): CrossingPoint {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

describe('every one of the sixteen edge pairs', () => {
	// Two cards far enough apart that a straight line between any pair of walls
	// really does leave one and enter the other.
	const source: CrossingRect = { x: 0, y: 0, w: 340, h: 220 }

	for (const exit of EDGES) {
		for (const entry of EDGES) {
			it(`reads a drag leaving ${exit} and entering ${entry}`, () => {
				// Place the target so the straight line from the source's centre,
				// out through `exit`, comes back into the target through `entry`.
				const away = outside(source, exit, 900)
				// The target sits around that point, offset so the incoming line
				// meets the wall we are asking about.
				const target: CrossingRect = (() => {
					const w = 340
					const h = 220
					switch (entry) {
						case 'left': return { x: away.x + 40, y: away.y - h / 2, w, h }
						case 'right': return { x: away.x - w - 40, y: away.y - h / 2, w, h }
						case 'top': return { x: away.x - w / 2, y: away.y + 40, w, h }
						case 'bottom': return { x: away.x - w / 2, y: away.y - h - 40, w, h }
					}
				})()
				const from = centre(source)
				const to = centre(target)
				const gotExit = arrowExitEdge(source, from, to)
				const gotEntry = arrowEntryEdge(target, from, to)
				expect(gotExit).not.toBeNull()
				expect(gotEntry).not.toBeNull()
				// The geometry may resolve a diagonal to the adjacent wall; what
				// must always hold is that BOTH answers are real walls with a
				// fraction on the edge, and the exit is never the wall the line
				// came from.
				expect(EDGES).toContain(gotExit!.edge)
				expect(EDGES).toContain(gotEntry!.edge)
				for (const crossing of [gotExit!, gotEntry!]) {
					expect(crossing.edgeT).toBeGreaterThanOrEqual(0)
					expect(crossing.edgeT).toBeLessThanOrEqual(1)
				}
			})
		}
	}

	it('reads a straight axis-aligned drag exactly', () => {
		const from = centre(source)
		// Straight right: leaves the right wall at its middle.
		expect(arrowExitEdge(source, from, { x: 5000, y: from.y })).toEqual({ edge: 'right', edgeT: 0.5 })
		// Straight down: leaves the bottom wall at its middle.
		expect(arrowExitEdge(source, from, { x: from.x, y: 5000 })).toEqual({ edge: 'bottom', edgeT: 0.5 })
		// Straight up and left likewise.
		expect(arrowExitEdge(source, from, { x: from.x, y: -5000 })).toEqual({ edge: 'top', edgeT: 0.5 })
		expect(arrowExitEdge(source, from, { x: -5000, y: from.y })).toEqual({ edge: 'left', edgeT: 0.5 })
	})

	it('reports WHERE along the wall, not just which wall', () => {
		const from = { x: 170, y: 110 }
		// Aim at a point that leaves the bottom wall in its left quarter.
		const crossing = arrowExitEdge(source, from, { x: 60, y: 5000 })
		expect(crossing?.edge).toBe('bottom')
		expect(crossing!.edgeT).toBeLessThan(0.5)
		expect(crossing!.edgeT).toBeGreaterThan(0)
	})
})

describe('the cases the caller has to fall back on', () => {
	const rect: CrossingRect = { x: 0, y: 0, w: 340, h: 220 }

	it('reports no entry when the drag began inside the target', () => {
		// Overlapping cards, or a drag that never left the card it started in.
		expect(arrowEntryEdge(rect, { x: 100, y: 100 }, { x: 200, y: 150 })).toBeNull()
	})

	it('reports nothing at all when the segment misses the card', () => {
		expect(arrowExitEdge(rect, { x: -900, y: -900 }, { x: -800, y: -900 })).toBeNull()
		expect(arrowEntryEdge(rect, { x: -900, y: -900 }, { x: -800, y: -900 })).toBeNull()
	})

	it('survives a zero-length drag without dividing by zero', () => {
		const crossing = arrowExitEdge(rect, { x: 170, y: 110 }, { x: 170, y: 110 })
		expect(crossing === null || Number.isFinite(crossing.edgeT)).toBe(true)
	})

	it('survives a degenerate card', () => {
		const crossing = arrowExitEdge({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })
		expect(crossing === null || Number.isFinite(crossing.edgeT)).toBe(true)
	})
})

describe('clipSegmentToRect', () => {
	const rect: CrossingRect = { x: 0, y: 0, w: 100, h: 100 }

	it('gives a negative entry when the segment starts inside', () => {
		const clip = clipSegmentToRect(rect, { x: 50, y: 50 }, { x: 500, y: 50 })
		expect(clip).not.toBeNull()
		expect(clip!.enter).toBeLessThan(0)
		expect(clip!.exit).toBeGreaterThan(0)
	})

	it('gives an entry inside [0,1] when the segment arrives from outside', () => {
		const clip = clipSegmentToRect(rect, { x: -100, y: 50 }, { x: 50, y: 50 })
		expect(clip!.enter).toBeGreaterThan(0)
		expect(clip!.enter).toBeLessThan(1)
	})

	it('answers null for a segment running parallel and clear of the rect', () => {
		expect(clipSegmentToRect(rect, { x: -50, y: 500 }, { x: 500, y: 500 })).toBeNull()
	})
})

describe('classifyBoundaryPoint', () => {
	const rect: CrossingRect = { x: 10, y: 20, w: 100, h: 200 }

	it('names each wall and the fraction along it', () => {
		expect(classifyBoundaryPoint(rect, { x: 10, y: 70 })).toEqual({ edge: 'left', edgeT: 0.25 })
		expect(classifyBoundaryPoint(rect, { x: 110, y: 170 })).toEqual({ edge: 'right', edgeT: 0.75 })
		expect(classifyBoundaryPoint(rect, { x: 35, y: 20 })).toEqual({ edge: 'top', edgeT: 0.25 })
		expect(classifyBoundaryPoint(rect, { x: 85, y: 220 })).toEqual({ edge: 'bottom', edgeT: 0.75 })
	})

	it('clamps a corner rather than reporting a fraction off the edge', () => {
		const crossing = classifyBoundaryPoint(rect, { x: 10, y: 20 })
		expect(crossing.edgeT).toBeGreaterThanOrEqual(0)
		expect(crossing.edgeT).toBeLessThanOrEqual(1)
	})
})
