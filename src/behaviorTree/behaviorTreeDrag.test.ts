import { describe, expect, it } from 'vitest'

import type { BtPoint, BtRect, BtSceneInsert } from './behaviorTreeModel'
import {
	BEHAVIOR_DROP_SNAP_RADIUS,
	behaviorDropCandidates,
	behaviorDropGuide,
	behaviorDropRefusal,
	behaviorParentAnchor,
	decodeBehaviorDrag,
	encodeBehaviorDrag,
	nearestBehaviorDropTarget,
	type BehaviorDropProjection,
} from './behaviorTreeDrag'

function insert(id: string, at: BtPoint, parentPath: string | null, index = 0): BtSceneInsert {
	return { id, at, parentPath, index, kind: parentPath === null ? 'root' : 'end', persistent: true }
}

const rect = (x: number, y: number, w: number, h: number): BtRect => ({ x, y, w, h })

const projection: BehaviorDropProjection = {
	scene: {
		inserts: [
			insert('root', { x: 0, y: 0 }, null),
			insert('a', { x: 100, y: 40 }, '0', 1),
			insert('b', { x: 400, y: 40 }, '0.1', 0),
		],
	},
	origin: { x: 10, y: 20 },
	nodeRects: new Map([
		['0', rect(0, 0, 200, 60)],
		['0.1', rect(300, 100, 100, 40)],
	]),
}

/** Region → screen: pan by (1000, 500) at 2× zoom, so the two are never confused. */
const toScreen = (point: BtPoint): BtPoint => ({ x: 1000 + point.x * 2, y: 500 + point.y * 2 })

describe('behavior drag payload', () => {
	it('round-trips', () => {
		const payload = { itemId: 'model:Sequence', label: 'Sequence', template: { id: 'Sequence', kind: 'control' as const } }
		expect(decodeBehaviorDrag(encodeBehaviorDrag(payload))).toEqual(payload)
	})

	it('treats anything that is not a behavior as not a behavior', () => {
		expect(decodeBehaviorDrag(null)).toBeNull()
		expect(decodeBehaviorDrag('')).toBeNull()
		expect(decodeBehaviorDrag('{not json')).toBeNull()
		expect(decodeBehaviorDrag('"a string"')).toBeNull()
		expect(decodeBehaviorDrag(JSON.stringify({ itemId: 'x', label: 'y' }))).toBeNull()
		expect(decodeBehaviorDrag(JSON.stringify({ itemId: 'x', label: 'y', template: { id: 'z' } }))).toBeNull()
	})
})

describe('drop targets', () => {
	it('converts every insertion target through the scene origin into screen space', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		expect(candidates).toHaveLength(3)
		expect(candidates[0]).toMatchObject({ id: 'root', parentPath: null, region: { x: 10, y: 20 } })
		// origin (10,20) then pan+zoom: (100+10)*2+1000 = 1220, (40+20)*2+500 = 620
		expect(candidates[1].screen).toEqual({ x: 1220, y: 620 })
	})

	it('picks the nearest target inside the snap radius', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		const near = nearestBehaviorDropTarget(candidates, { x: 1230, y: 630 })
		expect(near?.candidate.id).toBe('a')
		expect(near?.distance).toBeCloseTo(Math.hypot(10, 10))
	})

	it('refuses rather than guessing when the pointer is nowhere near one', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		expect(nearestBehaviorDropTarget(candidates, { x: 5000, y: 5000 })).toBeNull()
		// Just outside the radius is still a refusal — the boundary is real.
		const justOutside = { x: 1220 + BEHAVIOR_DROP_SNAP_RADIUS + 1, y: 620 }
		expect(nearestBehaviorDropTarget(candidates, justOutside)).toBeNull()
		const justInside = { x: 1220 + BEHAVIOR_DROP_SNAP_RADIUS - 1, y: 620 }
		expect(nearestBehaviorDropTarget(candidates, justInside)?.candidate.id).toBe('a')
	})

	it('breaks a tie by distance, not by list order', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		// Closer to `b` (screen 1820, 620) than to `a` (1220, 620).
		expect(nearestBehaviorDropTarget(candidates, { x: 1810, y: 620 })?.candidate.id).toBe('b')
	})

	it('honours a caller-supplied radius', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		expect(nearestBehaviorDropTarget(candidates, { x: 1240, y: 620 }, 10)).toBeNull()
		expect(nearestBehaviorDropTarget(candidates, { x: 1240, y: 620 }, 40)?.candidate.id).toBe('a')
	})
})

describe('the suggestion segment', () => {
	it('leaves the parent card from the edge the children leave from', () => {
		// down: bottom-centre of 0 → (100, 60); right: right-centre → (200, 30)
		expect(behaviorParentAnchor(projection, '0', 'down')).toEqual({ x: 100, y: 60 })
		expect(behaviorParentAnchor(projection, '0', 'right')).toEqual({ x: 200, y: 30 })
	})

	it('collapses onto the target when there is no parent to leave', () => {
		expect(behaviorParentAnchor(projection, null, 'down')).toBeNull()
		const candidates = behaviorDropCandidates(projection, toScreen)
		const guide = behaviorDropGuide(projection, candidates[0], 'down')
		expect(guide.from).toEqual(guide.to)
	})

	it('runs parent edge → target for a real child insertion', () => {
		const candidates = behaviorDropCandidates(projection, toScreen)
		const guide = behaviorDropGuide(projection, candidates[1], 'down')
		expect(guide.from).toEqual({ x: 100, y: 60 })
		expect(guide.to).toEqual({ x: 110, y: 60 })
	})

	it('falls back to the target when the parent is not drawn', () => {
		const orphan = behaviorDropCandidates({ ...projection, nodeRects: new Map() }, toScreen)[1]
		expect(behaviorDropGuide({ ...projection, nodeRects: new Map() }, orphan, 'down').from).toEqual(orphan.region)
	})
})

describe('refusal', () => {
	it('names what was dropped and where it should go', () => {
		expect(behaviorDropRefusal('Sequence')).toContain('Sequence')
		expect(behaviorDropRefusal('Sequence')).toContain('+')
	})
})
