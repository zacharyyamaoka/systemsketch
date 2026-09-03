import { describe, expect, it } from 'vitest'

import type { ElbowRect, ElbowRouteInput } from '../elbow'
import {
	planOrthogonalRoute,
	routeClearsInput,
	routeIsOrthogonal,
	routesHaveSamePoints,
} from './collisionAwareRouting'

interface PlannerScenario {
	name: string
	input: ElbowRouteInput
}

function horizontalScenario(
	name: string,
	endY: number,
	obstacles: readonly ElbowRect[],
): PlannerScenario {
	const startBox = { x: 0, y: 0, w: 120, h: 80 }
	const endBox = { x: 800, y: endY, w: 120, h: 80 }
	return {
		name,
		input: {
			start: { point: { x: 120, y: 40 }, side: 'right', box: startBox },
			end: { point: { x: 800, y: endY + 40 }, side: 'left', box: endBox },
			obstacles,
		},
	}
}

function reverseScenario(
	name: string,
	endY: number,
	obstacles: readonly ElbowRect[],
): PlannerScenario {
	const startBox = { x: 800, y: 0, w: 120, h: 80 }
	const endBox = { x: 0, y: endY, w: 120, h: 80 }
	return {
		name,
		input: {
			start: { point: { x: 920, y: 40 }, side: 'right', box: startBox },
			end: { point: { x: 0, y: endY + 40 }, side: 'left', box: endBox },
			obstacles,
		},
	}
}

const PLANNER_SCENARIOS: PlannerScenario[] = [
	// Clear corridors and vertically displaced endpoints.
	horizontalScenario('01 clear and level', 0, []),
	horizontalScenario('02 clear target 80 lower', 80, []),
	horizontalScenario('03 clear target 160 lower', 160, []),
	horizontalScenario('04 clear target 80 higher', -80, []),
	horizontalScenario('05 clear target 160 higher', -160, []),
	horizontalScenario('06 clear target 320 lower', 320, []),

	// One obstacle: height, width, position, and near-boundary variation.
	horizontalScenario('07 centered square', 0, [{ x: 340, y: -20, w: 120, h: 120 }]),
	horizontalScenario('08 tall centered wall', 0, [{ x: 360, y: -180, w: 80, h: 440 }]),
	horizontalScenario('09 wide centered slab', 0, [{ x: 220, y: 10, w: 360, h: 60 }]),
	horizontalScenario('10 blocker near source', 0, [{ x: 165, y: -40, w: 130, h: 160 }]),
	horizontalScenario('11 blocker near target', 0, [{ x: 625, y: -40, w: 130, h: 160 }]),
	horizontalScenario('12 blocker biased above', 0, [{ x: 340, y: -200, w: 120, h: 270 }]),
	horizontalScenario('13 blocker biased below', 0, [{ x: 340, y: 10, w: 120, h: 270 }]),
	horizontalScenario('14 thin vertical blocker', 0, [{ x: 395, y: -120, w: 10, h: 320 }]),
	horizontalScenario('15 thin horizontal blocker', 0, [{ x: 240, y: 35, w: 320, h: 10 }]),
	horizontalScenario('16 offset target with blocker', 180, [{ x: 360, y: 40, w: 120, h: 180 }]),

	// Two obstacles: aligned walls and staggered chicanes.
	horizontalScenario('17 two aligned squares', 0, [
		{ x: 250, y: -20, w: 100, h: 120 }, { x: 550, y: -20, w: 100, h: 120 },
	]),
	horizontalScenario('18 two tall aligned walls', 0, [
		{ x: 260, y: -180, w: 70, h: 440 }, { x: 570, y: -180, w: 70, h: 440 },
	]),
	horizontalScenario('19 upper then lower chicane', 0, [
		{ x: 250, y: -220, w: 120, h: 280 }, { x: 520, y: 20, w: 120, h: 280 },
	]),
	horizontalScenario('20 lower then upper chicane', 0, [
		{ x: 250, y: 20, w: 120, h: 280 }, { x: 520, y: -220, w: 120, h: 280 },
	]),
	horizontalScenario('21 overlapping x stagger', 120, [
		{ x: 260, y: -80, w: 220, h: 120 }, { x: 420, y: 100, w: 220, h: 120 },
	]),
	horizontalScenario('22 narrow middle corridor', 0, [
		{ x: 280, y: -260, w: 300, h: 260 }, { x: 280, y: 80, w: 300, h: 260 },
	]),
	horizontalScenario('23 source-side gate', -100, [
		{ x: 160, y: -260, w: 90, h: 220 }, { x: 160, y: 100, w: 90, h: 220 },
	]),
	horizontalScenario('24 target-side gate', 100, [
		{ x: 650, y: -220, w: 90, h: 220 }, { x: 650, y: 140, w: 90, h: 220 },
	]),
	horizontalScenario('25 unequal wall heights', 0, [
		{ x: 260, y: -300, w: 90, h: 380 }, { x: 560, y: 0, w: 90, h: 260 },
	]),
	horizontalScenario('26 offset target between walls', 220, [
		{ x: 280, y: -80, w: 90, h: 260 }, { x: 560, y: 100, w: 90, h: 300 },
	]),

	// Three and four obstacles exercise denser visibility grids.
	horizontalScenario('27 three aligned squares', 0, [
		{ x: 210, y: -10, w: 90, h: 100 }, { x: 410, y: -10, w: 90, h: 100 },
		{ x: 610, y: -10, w: 90, h: 100 },
	]),
	horizontalScenario('28 three alternating chicanes', 0, [
		{ x: 210, y: -200, w: 100, h: 260 }, { x: 410, y: 20, w: 100, h: 260 },
		{ x: 610, y: -200, w: 100, h: 260 },
	]),
	horizontalScenario('29 three reverse chicanes', 0, [
		{ x: 210, y: 20, w: 100, h: 260 }, { x: 410, y: -200, w: 100, h: 260 },
		{ x: 610, y: 20, w: 100, h: 260 },
	]),
	horizontalScenario('30 three varied rectangles', 180, [
		{ x: 190, y: -40, w: 130, h: 160 }, { x: 390, y: 120, w: 160, h: 160 },
		{ x: 620, y: -20, w: 80, h: 260 },
	]),
	horizontalScenario('31 four-column maze', 0, [
		{ x: 180, y: -240, w: 70, h: 290 }, { x: 340, y: 30, w: 70, h: 290 },
		{ x: 500, y: -240, w: 70, h: 290 }, { x: 660, y: 30, w: 70, h: 290 },
	]),
	horizontalScenario('32 four-block middle island', 0, [
		{ x: 280, y: -180, w: 120, h: 160 }, { x: 480, y: -180, w: 120, h: 160 },
		{ x: 280, y: 100, w: 120, h: 160 }, { x: 480, y: 100, w: 120, h: 160 },
	]),
	horizontalScenario('33 dense five-block field', 160, [
		{ x: 190, y: -100, w: 100, h: 150 }, { x: 330, y: 100, w: 100, h: 160 },
		{ x: 470, y: -120, w: 100, h: 180 }, { x: 610, y: 120, w: 100, h: 160 },
		{ x: 430, y: 330, w: 120, h: 100 },
	]),
	horizontalScenario('34 nested-looking obstacle ring', 0, [
		{ x: 260, y: -180, w: 300, h: 80 }, { x: 260, y: 180, w: 300, h: 80 },
		{ x: 260, y: -100, w: 80, h: 280 }, { x: 480, y: -100, w: 80, h: 280 },
	]),

	// Reverse geometry: source is right of target while port normals stay authoritative.
	reverseScenario('35 reverse clear and level', 0, []),
	reverseScenario('36 reverse vertically displaced', 160, []),
	reverseScenario('37 reverse centered obstacle', 0, [{ x: 350, y: -80, w: 180, h: 240 }]),
	reverseScenario('38 reverse tall wall', 0, [{ x: 390, y: -260, w: 100, h: 600 }]),
	reverseScenario('39 reverse two blockers', -140, [
		{ x: 220, y: -180, w: 120, h: 260 }, { x: 560, y: 0, w: 120, h: 260 },
	]),
	reverseScenario('40 reverse dense field', 140, [
		{ x: 180, y: -160, w: 100, h: 220 }, { x: 360, y: 80, w: 100, h: 220 },
		{ x: 540, y: -160, w: 100, h: 220 },
	]),

	// Tight clearances around endpoint dongles and obstacle boundaries.
	horizontalScenario('41 obstacle 25 px beyond source', 0, [{ x: 169, y: 15, w: 150, h: 50 }]),
	horizontalScenario('42 obstacle 25 px before target', 0, [{ x: 601, y: 15, w: 150, h: 50 }]),
	horizontalScenario('43 one-pixel-wide obstacle', 0, [{ x: 420, y: -120, w: 1, h: 320 }]),
	horizontalScenario('44 one-pixel-high obstacle', 0, [{ x: 250, y: 39.5, w: 420, h: 1 }]),
	horizontalScenario('45 fractional coordinates', 37.25, [
		{ x: 311.25, y: 12.75, w: 113.5, h: 99.5 }, { x: 531.75, y: 84.25, w: 91.5, h: 107.75 },
	]),
	horizontalScenario('46 huge upper obstacle', 0, [{ x: 180, y: -1200, w: 560, h: 1260 }]),
	horizontalScenario('47 huge lower obstacle', 0, [{ x: 180, y: 20, w: 560, h: 1260 }]),
	horizontalScenario('48 nearly enclosed from above', 0, [
		{ x: 160, y: -500, w: 580, h: 510 }, { x: 300, y: 70, w: 300, h: 500 },
	]),
	horizontalScenario('49 nearly enclosed from below', 0, [
		{ x: 160, y: 70, w: 580, h: 500 }, { x: 300, y: -500, w: 300, h: 510 },
	]),
	horizontalScenario('50 six obstacles with fractional target', 137.5, [
		{ x: 170, y: -110, w: 70, h: 170 }, { x: 275, y: 100, w: 80, h: 190 },
		{ x: 390, y: -90, w: 90, h: 180 }, { x: 505, y: 130, w: 75, h: 180 },
		{ x: 610, y: -70, w: 65, h: 170 }, { x: 690, y: 260, w: 55, h: 120 },
	]),
]

describe('collision-aware single-edge planner stress matrix', () => {
	it('contains exactly fifty named and distinct scenarios', () => {
		expect(PLANNER_SCENARIOS).toHaveLength(50)
		expect(new Set(PLANNER_SCENARIOS.map((scenario) => scenario.name)).size).toBe(50)
	})

	it.each(PLANNER_SCENARIOS)('$name', ({ input }) => {
		const first = planOrthogonalRoute(input)
		const second = planOrthogonalRoute(input)
		expect(routeIsOrthogonal(first)).toBe(true)
		expect(routeClearsInput(first, input), JSON.stringify({ input, route: first })).toBe(true)
		expect(routesHaveSamePoints(first, second)).toBe(true)
		expect(first.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
	})
})
