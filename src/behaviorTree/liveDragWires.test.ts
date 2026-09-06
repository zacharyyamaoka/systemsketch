/**
 * The mid-drag wire re-anchor (`liveDragWires.ts`), proved as pure geometry:
 * a wire touching the dragged node reads the node's LIVE rect, everything
 * else — other wires, lens edges, wires with a missing endpoint — passes
 * through untouched by reference. The browser journey
 * (`tests/behavior_tree_drag_polish_smoke.mjs`) proves the same rule live.
 */
import { describe, expect, it } from 'vitest'

import type { BtRect, BtSceneEdge } from './behaviorTreeModel'
import { withLiveDragWires } from './liveDragWires'

const parent: BtRect = { x: 100, y: 50, w: 180, h: 64 }
const child: BtRect = { x: 60, y: 198, w: 300, h: 112 }
const start: BtRect = { x: 115, y: -92, w: 150, h: 52 }
const live: BtRect = { x: 400, y: 260, w: 300, h: 112 }

const nodeRects = new Map<string, BtRect>([
	['0', parent],
	['0.0', child],
])

function edgesFixture(): BtSceneEdge[] {
	return [
		{ id: 'start→0', kind: 'control', points: [{ x: 190, y: -40 }, { x: 190, y: 50 }], arrowEnd: true, to: '0' },
		{ id: '0→0.0', kind: 'control', points: [{ x: 190, y: 114 }, { x: 210, y: 198 }], arrowEnd: true, from: '0', to: '0.0' },
		{ id: 'read:0.0', kind: 'read', points: [{ x: 0, y: 0 }, { x: 60, y: 254 }], arrowEnd: true, to: '0.0' },
	]
}

const base = { nodeRects, startRect: start, orientation: 'down' as const, edgeStyle: 'straight' as const }

describe('withLiveDragWires', () => {
	it('re-aims the wire INTO the dragged node at its live top-center (down, straight)', () => {
		const [, wire] = withLiveDragWires(edgesFixture(), { ...base, draggedPath: '0.0', draggedRect: live })
		expect(wire.points).toEqual([
			{ x: parent.x + parent.w / 2, y: parent.y + parent.h }, // parent's committed bottom-center
			{ x: live.x + live.w / 2, y: live.y },                  // dragged node's LIVE top-center
		])
	})

	it('re-aims the wire OUT of a dragged composite from its live bottom-center', () => {
		const [, wire] = withLiveDragWires(edgesFixture(), { ...base, draggedPath: '0', draggedRect: live })
		expect(wire.points[0]).toEqual({ x: live.x + live.w / 2, y: live.y + live.h })
		expect(wire.points[1]).toEqual({ x: child.x + child.w / 2, y: child.y })
	})

	it('anchors the start wire on the Start pill when the root itself is dragged', () => {
		const [startWire] = withLiveDragWires(edgesFixture(), { ...base, draggedPath: '0', draggedRect: live })
		expect(startWire.points).toEqual([
			{ x: start.x + start.w / 2, y: start.y + start.h },
			{ x: live.x + live.w / 2, y: live.y },
		])
	})

	it('routes the elbow style through the live anchor too', () => {
		const [, wire] = withLiveDragWires(edgesFixture(), { ...base, edgeStyle: 'elbow', draggedPath: '0.0', draggedRect: live })
		const from = { x: parent.x + parent.w / 2, y: parent.y + parent.h }
		const to = { x: live.x + live.w / 2, y: live.y }
		const midY = (from.y + to.y) / 2
		expect(wire.points).toEqual([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to])
	})

	it('uses side anchors in the left-to-right orientation', () => {
		const [, wire] = withLiveDragWires(edgesFixture(), { ...base, orientation: 'right', draggedPath: '0.0', draggedRect: live })
		expect(wire.points).toEqual([
			{ x: parent.x + parent.w, y: parent.y + parent.h / 2 },
			{ x: live.x, y: live.y + live.h / 2 },
		])
	})

	it('leaves lens edges and untouched wires alone, by reference', () => {
		const edges = edgesFixture()
		const out = withLiveDragWires(edges, { ...base, draggedPath: '0.0', draggedRect: live })
		expect(out[0]).toBe(edges[0]) // start→0 does not touch 0.0
		expect(out[2]).toBe(edges[2]) // a read edge is not this module's to re-derive
	})

	it('returns a wire unchanged when its other endpoint is unknown', () => {
		const orphan: BtSceneEdge = { id: 'ghost→0.0', kind: 'control', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], arrowEnd: true, from: 'ghost', to: '0.0' }
		const [out] = withLiveDragWires([orphan], { ...base, draggedPath: '0.0', draggedRect: live })
		expect(out).toBe(orphan)
	})

	it('touches nothing when the dragged path matches no wire', () => {
		const edges = edgesFixture()
		const out = withLiveDragWires(edges, { ...base, draggedPath: '9.9', draggedRect: live })
		expect(out).toEqual(edges)
	})
})
