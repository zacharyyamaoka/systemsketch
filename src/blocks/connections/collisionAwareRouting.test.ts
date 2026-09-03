import { describe, expect, it } from 'vitest'

import type { ElbowPoint, ElbowRect, ElbowRoute } from '../elbow'
import {
	nudgeRoutesWithoutObstacleCollisions,
	planOrthogonalRoute,
	routeClearsInput,
	routeClearsObstacles,
	stabilizeOrthogonalRoute,
} from './collisionAwareRouting'

function route(points: ElbowPoint[]): ElbowRoute {
	return { points, segments: [], pins: [], droppedPins: [], fallback: false }
}

describe('single-edge collision planning — independent of nudging', () => {
	it('routes orthogonally around an intervening rectangle', () => {
		const obstacle: ElbowRect = { x: 150, y: -50, w: 100, h: 100 }
		const planned = planOrthogonalRoute({
			start: { point: { x: 0, y: 0 }, side: 'right' },
			end: { point: { x: 400, y: 0 }, side: 'left' },
			obstacles: [obstacle],
		})
		expect(routeClearsObstacles(planned, [obstacle])).toBe(true)
		expect(planned.points.length).toBeGreaterThan(2)
	})

	it('retains a still-clear previous corridor for route stability', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 },
			{ x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const stable = stabilizeOrthogonalRoute(previous, planned, {
			start: { point: previous.points[0], side: 'right' },
			end: { point: previous.points.at(-1)!, side: 'left' },
		})
		expect(stable.points).toEqual(previous.points)
		expect(stable.points).not.toBe(previous.points)
	})

	it('replaces a previous corridor once an obstacle invalidates it', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 },
			{ x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const obstacle = { x: 150, y: 80, w: 100, h: 40 }
		expect(stabilizeOrthogonalRoute(previous, planned, {
			start: { point: previous.points[0], side: 'right' },
			end: { point: previous.points.at(-1)!, side: 'left' },
			obstacles: [obstacle],
		}).points).toEqual(planned.points)
	})

	it('rejects a previous corridor that re-enters its own endpoint Block', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }, { x: -50, y: 40 },
			{ x: -50, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const input = {
			start: { point: { x: 0, y: 0 }, side: 'right' as const, box: { x: -100, y: -50, w: 100, h: 100 } },
			end: { point: { x: 400, y: 0 }, side: 'left' as const },
		}
		expect(routeClearsInput(previous, input)).toBe(false)
		expect(stabilizeOrthogonalRoute(previous, planned, input).points).toEqual(planned.points)
	})
})

describe('collision-safe bundle nudging — independent of pathfinding', () => {
	it('reverts only a channel shift that would enter an obstacle keep-out', () => {
		const first = route([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 200, y: 200 }])
		const second = route([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 200, y: 200 }])
		const obstacle = { x: 124, y: 50, w: 20, h: 100 }
		const result = nudgeRoutesWithoutObstacleCollisions(
			[first, second],
			[first, second].map((candidate) => ({
				start: { point: candidate.points[0], side: 'right' as const },
				end: { point: candidate.points.at(-1)!, side: 'left' as const },
				obstacles: [obstacle],
			})),
		)
		expect(result.reverted).toHaveLength(1)
		expect(result.routes.some((candidate) => candidate.points[1].x === 100)).toBe(true)
		expect(result.routes.every((candidate) => routeClearsObstacles(candidate, [obstacle]))).toBe(true)
	})
})
