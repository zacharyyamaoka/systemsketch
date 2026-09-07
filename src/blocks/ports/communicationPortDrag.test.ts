import { describe, expect, it } from 'vitest'

import { blockEdgeAt } from './communicationPortDrag'

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

