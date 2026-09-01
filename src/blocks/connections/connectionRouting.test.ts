import { describe, expect, it } from 'vitest'
import {
	getBentCurveCubicControlPoints,
	getConnectionCenterPoint,
	getConnectionControlPoints,
	getConnectionPath,
	getCurveWaypoint,
	getElbowConnectionRoute,
} from './connectionRouting'

const START = { x: 0, y: 0 }
const END = { x: 200, y: 120 }

describe('connection routing', () => {
	it('draws one line for a straight cable and a cubic for a curved one', () => {
		expect(getConnectionPath('straight', START, END)).toBe('M 0 0 L 200 120')
		expect(getConnectionPath('curved', START, END)).toMatch(/^M 0 0 C /)
	})

	it('leaves an output rightward and approaches an input leftward', () => {
		const [cp1, cp2] = getConnectionControlPoints(START, END)
		expect(cp1.y).toBe(START.y)
		expect(cp2.y).toBe(END.y)
		expect(cp1.x).toBeGreaterThan(START.x)
		expect(cp2.x).toBeLessThan(END.x)
	})

	it('keeps a short backwards cable legible instead of collapsing it', () => {
		// A consumer to the LEFT of its producer: the automatic control points
		// must still bow outward, or the cable disappears into the two dots.
		const [cp1, cp2] = getConnectionControlPoints({ x: 200, y: 0 }, { x: 190, y: 0 })
		expect(cp1.x - 200).toBeGreaterThanOrEqual(30)
		expect(190 - cp2.x).toBeGreaterThanOrEqual(30)
	})

	it('bends through the dragged waypoint, on both straight and curved', () => {
		const curve = { dx: 0, dy: -80 }
		const waypoint = getCurveWaypoint(START, END, curve)
		expect(waypoint).toMatchObject({ x: 100, y: -20 })

		for (const routing of ['curved', 'straight'] as const) {
			expect(getConnectionPath(routing, START, END, { curve })).toMatch(/^M 0 0 Q /)
			// The visible midpoint IS the waypoint — that is what makes the control
			// point stay under the pointer that dragged it.
			expect(getConnectionCenterPoint(routing, START, END, { curve }))
				.toMatchObject({ x: 100, y: -20 })
		}
	})

	it('expresses the bent quadratic as a cubic that passes through the same point', () => {
		const curve = { dx: 40, dy: -60 }
		const [cp1, cp2] = getBentCurveCubicControlPoints(START, END, curve)
		// Cubic at t=.5 — must land on the waypoint the quadratic was built for.
		const at = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8
		const waypoint = getCurveWaypoint(START, END, curve)
		expect(at(START.x, cp1.x, cp2.x, END.x)).toBeCloseTo(waypoint.x, 6)
		expect(at(START.y, cp1.y, cp2.y, END.y)).toBeCloseTo(waypoint.y, 6)
	})

	it('routes an elbow orthogonally, leaving and entering horizontally', () => {
		const route = getElbowConnectionRoute(START, END, {}, [])
		expect(route.points.length).toBeGreaterThan(2)
		// Every segment is axis-aligned.
		for (let i = 1; i < route.points.length; i += 1) {
			const previous = route.points[i - 1]
			const point = route.points[i]
			const axisAligned = Math.abs(previous.x - point.x) < 0.001
				|| Math.abs(previous.y - point.y) < 0.001
			expect(axisAligned).toBe(true)
		}
		// A cable leaves an output and enters an input perpendicular to the face.
		expect(route.points[1].y).toBeCloseTo(START.y, 6)
		expect(route.points[route.points.length - 2].y).toBeCloseTo(END.y, 6)
	})
})
