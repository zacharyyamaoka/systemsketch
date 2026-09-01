import { describe, expect, it } from 'vitest'
import {
	AUTHORED_PORT_LEG,
	authoredElbowRoute,
	captureAuthoredRoute,
	captureResolvedRoute,
	dongleEndpoints,
	moveAuthoredSegment,
	normalizeAuthoredRoute,
	resolveAuthoredRoute,
} from './elbowAuthoredRoute'

const START = { x: 0, y: 100 }
const END = { x: 300, y: 0 }
const DONGLES = dongleEndpoints(START, END)

/** The canonical Z between the dongles: out to the mid rail, up, in. */
const Z = {
	startAxis: 'x' as const,
	points: [
		{ x: 150, y: 100 },
		{ x: 150, y: 0 },
	],
}

function lastSegments(points: { x: number; y: number }[]) {
	const n = points.length
	return {
		entry: [points[n - 2], points[n - 1]] as const,
		beforeEntry: [points[n - 3], points[n - 2]] as const,
	}
}

describe('endpoint-frame persistence', () => {
	it('capture → resolve round-trips the authored corners exactly', () => {
		const model = captureAuthoredRoute(Z, DONGLES.start, DONGLES.end)
		const resolved = resolveAuthoredRoute(model, DONGLES.start, DONGLES.end)
		expect(resolved.points).toHaveLength(2)
		for (const [index, point] of resolved.points.entries()) {
			expect(point.x).toBeCloseTo(Z.points[index].x, 6)
			expect(point.y).toBeCloseTo(Z.points[index].y, 6)
		}
	})

	it('translates rigidly when both endpoints move together', () => {
		const model = captureAuthoredRoute(Z, DONGLES.start, DONGLES.end)
		const delta = { x: 60, y: 24 }
		const moved = resolveAuthoredRoute(
			model,
			{ x: DONGLES.start.x + delta.x, y: DONGLES.start.y + delta.y },
			{ x: DONGLES.end.x + delta.x, y: DONGLES.end.y + delta.y }
		)
		for (const [index, point] of moved.points.entries()) {
			expect(point.x).toBeCloseTo(Z.points[index].x + delta.x, 6)
			expect(point.y).toBeCloseTo(Z.points[index].y + delta.y, 6)
		}
	})
})

describe('the port dongles', () => {
	it('renders a fixed perpendicular leg at both ports', () => {
		const model = captureAuthoredRoute(Z, DONGLES.start, DONGLES.end)
		const route = authoredElbowRoute(model, START, END)
		expect(route.points[0]).toMatchObject(START)
		expect(route.points[1]).toMatchObject(DONGLES.start)
		expect(route.points[route.points.length - 2]).toMatchObject(DONGLES.end)
		expect(route.points[route.points.length - 1]).toMatchObject(END)
		// The dongle segments carry no handles.
		expect(route.segments[0].pinnable).toBe(false)
		expect(route.segments[route.segments.length - 1].pinnable).toBe(false)
	})

	it('REGRESSION: a rail dragged below the port still enters horizontally', () => {
		// The reported bug: dragging the rail next to the target below the port
		// made the cable run vertically along the block's face into the port.
		const dragged = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 2, { x: 0, y: 60 })
		const model = captureAuthoredRoute(dragged, DONGLES.start, DONGLES.end)
		const route = authoredElbowRoute(model, START, END)
		const { entry, beforeEntry } = lastSegments(route.points)
		// The entry is the horizontal dongle leg into the port…
		expect(entry[0].y).toBeCloseTo(END.y, 6)
		expect(entry[1]).toMatchObject(END)
		expect(entry[1].x - entry[0].x).toBeCloseTo(AUTHORED_PORT_LEG, 6)
		// …and the riser sits a leg short of the block, never on its face.
		expect(beforeEntry[0].x).toBeCloseTo(END.x - AUTHORED_PORT_LEG, 6)
		expect(beforeEntry[1].x).toBeCloseTo(END.x - AUTHORED_PORT_LEG, 6)
	})
})

describe('growing rails from end segments', () => {
	it('dragging an end segment grows a stub and keeps the dongles fixed', () => {
		const grown = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 0, { x: 0, y: 40 })
		expect(grown.points.length).toBeGreaterThan(Z.points.length)
		const route = authoredElbowRoute(
			captureAuthoredRoute(grown, DONGLES.start, DONGLES.end),
			START,
			END
		)
		expect(route.points[0]).toMatchObject(START)
		expect(route.points[route.points.length - 1]).toMatchObject(END)
		expect(route.points.some((point) => Math.abs(point.y - 40) < 0.001)).toBe(true)
	})

	it('one grow per drag: re-applying to the same base is stable', () => {
		const first = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 0, { x: 0, y: 40 })
		const second = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 0, { x: 0, y: 55 })
		expect(second.points.length).toBe(first.points.length)
	})

	it('every segment of the resolved route is orthogonal', () => {
		const grown = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 0, { x: 0, y: 40 })
		const route = authoredElbowRoute(
			captureAuthoredRoute(grown, DONGLES.start, DONGLES.end),
			START,
			END
		)
		for (let index = 0; index < route.points.length - 1; index += 1) {
			const a = route.points[index]
			const b = route.points[index + 1]
			expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true)
		}
	})
})

describe('normalize preserves authored rails under endpoint moves', () => {
	it('re-binds end segments while interior rails stay put', () => {
		const grown = moveAuthoredSegment(DONGLES.start, DONGLES.end, Z, 0, { x: 0, y: 40 })
		const normalized = normalizeAuthoredRoute({ x: 20, y: 130 }, DONGLES.end, grown)
		expect(normalized.points.some((point) => Math.abs(point.y - 40) < 0.001)).toBe(true)
	})
})

describe('capturing a resolved auto route', () => {
	it('adopts the polyline as authored corners between the dongles', () => {
		const polyline = [START, { x: 150, y: 100 }, { x: 150, y: 0 }, END]
		const model = captureResolvedRoute(polyline, DONGLES.start, DONGLES.end)
		const route = authoredElbowRoute(model, START, END)
		// port + dongle + two corners + dongle + port
		expect(route.points).toHaveLength(6)
		expect(route.segments).toHaveLength(5)
		expect(route.segments.map((segment) => segment.pinnable)).toEqual([
			false,
			true,
			true,
			true,
			false,
		])
	})
})
