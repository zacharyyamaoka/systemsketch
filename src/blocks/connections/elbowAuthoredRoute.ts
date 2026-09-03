/**
 * Authored multi-elbow routes — the state a cable enters when the user drags
 * one of its END segments (which grows a new rail, Excalidraw-style) and lives
 * in from then on, every segment individually draggable.
 *
 * Two sources, both already in this repo:
 * - The orthogonal-route editing (normalize / simplify / move-segment-with-
 *   stub-growth) is ported verbatim from `src/whiteboard/elbowRouting.ts`,
 *   the previous canvas's "Excalidraw-style segment editing" module.
 * - Persistence uses the endpoint-frame encoding of `src/blocks/elbow`'s pins
 *   (same `t`/`offset` math, applied per coordinate), so an authored corner
 *   rides with the blocks exactly like a pinned rail does: a whole-selection
 *   drag translates it rigidly, a one-block drag moves it proportionally.
 *
 * The resolved form is Lane C's `ElbowRoute` shape, so `elbowPath`,
 * `elbowPointAt` and `elbowRouteLength` work on it unchanged.
 *
 * ## The port dongles
 *
 * An authored route never starts or ends AT a port: it runs between two fixed
 * perpendicular legs — Excalidraw's "dongles" (`elbowArrow.ts` anchors every
 * route at `startDongle`/`endDongle`, offset from the bound element, and no
 * user drag can touch them). The rendered polyline is
 * `[port, dongle, …rails…, dongle, port]`, the dongle segments carry no
 * handles, and the normalize pass binds the rails to the dongle points — so a
 * rail dragged below its port turns up a leg short of the block and enters the
 * port horizontally, instead of running along the block's face.
 */
import type { ElbowRoute, ElbowSegment } from '../elbow'
import { PIN_SPAN_FLOOR, PIN_T_LIMIT } from '../elbow'

export type AuthoredAxis = 'x' | 'y'

interface Point {
	x: number
	y: number
}

/** Working form: absolute interior corners of one editable orthogonal route. */
export interface AuthoredElbowRoute {
	startAxis: AuthoredAxis
	points: Point[]
}

/** One corner in the frame spanned by the two endpoints. Serialisable. */
export interface AuthoredElbowCorner {
	tx: number
	ox: number
	ty: number
	oy: number
}

/** Persisted form — what goes into the connection's props. */
export interface ConnectionElbowRouteModel {
	startAxis: AuthoredAxis
	corners: AuthoredElbowCorner[]
	/** A shortened automatic exit leg, omitted for the normal 20px authored leg. */
	startLeg?: number
	/** A shortened automatic entry leg, omitted for the normal 20px authored leg. */
	endLeg?: number
}

const EPSILON = 0.001

/**
 * The fixed entry/exit leg. Matches the auto router's `legLength`, so
 * converting an auto route to authored does not visibly move its ends.
 */
export const AUTHORED_PORT_LEG = 20

/**
 * The two dongle points an authored route runs between: a leg out of the
 * start port (side `right`) and a leg short of the end port (side `left`).
 * Also the frame the authored corners persist in.
 */
export interface ElbowTerminalLegs {
	startLeg?: number
	endLeg?: number
}

function terminalLeg(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, value)
		: AUTHORED_PORT_LEG
}

export function dongleEndpoints(
	start: Point,
	end: Point,
	legs: ElbowTerminalLegs = {},
): { start: Point; end: Point } {
	return {
		start: { x: start.x + terminalLeg(legs.startLeg), y: start.y },
		end: { x: end.x - terminalLeg(legs.endLeg), y: end.y },
	}
}

/* ------------------------------------------------------------------------- *
 * Route editing, ported verbatim from src/whiteboard/elbowRouting.ts
 * ------------------------------------------------------------------------- */

function finitePoint(point: Point): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function opposite(axis: AuthoredAxis): AuthoredAxis {
	return axis === 'x' ? 'y' : 'x'
}

function authoredSegmentAxis(startAxis: AuthoredAxis, index: number): AuthoredAxis {
	return index % 2 === 0 ? startAxis : opposite(startAxis)
}

export function segmentAxisOf(start: Point, end: Point, fallback: AuthoredAxis): AuthoredAxis {
	if (Math.abs(end.x - start.x) <= EPSILON && Math.abs(end.y - start.y) > EPSILON) return 'y'
	if (Math.abs(end.y - start.y) <= EPSILON && Math.abs(end.x - start.x) > EPSILON) return 'x'
	return fallback
}

function pointsMatch(first: Point, second: Point): boolean {
	return Math.abs(first.x - second.x) <= EPSILON && Math.abs(first.y - second.y) <= EPSILON
}

function simplify(points: Point[]): Point[] {
	const deduplicated = points.filter(
		(point, index) => index === 0 || !pointsMatch(point, points[index - 1])
	)
	let changed = true
	while (changed && deduplicated.length > 2) {
		changed = false
		for (let index = 1; index < deduplicated.length - 1; index += 1) {
			const previous = deduplicated[index - 1]
			const point = deduplicated[index]
			const next = deduplicated[index + 1]
			const vertical =
				Math.abs(previous.x - point.x) <= EPSILON && Math.abs(point.x - next.x) <= EPSILON
			const horizontal =
				Math.abs(previous.y - point.y) <= EPSILON && Math.abs(point.y - next.y) <= EPSILON
			if (!vertical && !horizontal) continue
			deduplicated.splice(index, 1)
			changed = true
			break
		}
	}
	return deduplicated
}

/**
 * Rebinds the first and last segment to live endpoints while preserving every
 * authored interior rail. Alternating axes make endpoint movement safe: the
 * adjacent corner changes only on the coordinate its next segment ignores.
 */
export function normalizeAuthoredRoute(
	source: Point,
	target: Point,
	route: AuthoredElbowRoute
): AuthoredElbowRoute {
	const full = [
		{ ...source },
		...route.points.filter(finitePoint).map((point) => ({ ...point })),
		{ ...target },
	]
	if (full.length <= 2) return { startAxis: route.startAxis, points: [] }

	// Project every authored corner along the alternating orthogonal grammar.
	for (let index = 0; index < full.length - 2; index += 1) {
		if (authoredSegmentAxis(route.startAxis, index) === 'x') {
			full[index + 1].y = full[index].y
		} else {
			full[index + 1].x = full[index].x
		}
	}
	const lastSegmentIndex = full.length - 2
	if (authoredSegmentAxis(route.startAxis, lastSegmentIndex) === 'x') {
		full[full.length - 2].y = target.y
	} else {
		full[full.length - 2].x = target.x
	}

	const simplified = simplify(full)
	const startAxis =
		simplified.length > 1
			? segmentAxisOf(simplified[0], simplified[1], route.startAxis)
			: route.startAxis
	return { startAxis, points: simplified.slice(1, -1) }
}

/**
 * Excalidraw-style segment editing. Interior segments move in parallel. An
 * endpoint segment grows a short orthogonal stub so the bound endpoint itself
 * never moves; repeating that gesture can create as many rails as needed.
 */
export function moveAuthoredSegment(
	source: Point,
	target: Point,
	route: AuthoredElbowRoute,
	segmentIndex: number,
	pointer: Point
): AuthoredElbowRoute {
	const normalized = normalizeAuthoredRoute(source, target, route)
	const full = [
		{ ...source },
		...normalized.points.map((point) => ({ ...point })),
		{ ...target },
	]
	const lastSegmentIndex = full.length - 2
	if (segmentIndex < 0 || segmentIndex > lastSegmentIndex) return normalized
	const axis = segmentAxisOf(
		full[segmentIndex],
		full[segmentIndex + 1],
		authoredSegmentAxis(normalized.startAxis, segmentIndex)
	)
	const perpendicularValue = axis === 'x' ? pointer.y : pointer.x

	if (lastSegmentIndex === 0) {
		const points =
			axis === 'x'
				? [
						{ x: source.x, y: perpendicularValue },
						{ x: target.x, y: perpendicularValue },
					]
				: [
						{ x: perpendicularValue, y: source.y },
						{ x: perpendicularValue, y: target.y },
					]
		return normalizeAuthoredRoute(source, target, { startAxis: opposite(axis), points })
	}

	if (segmentIndex === 0) {
		const stub =
			axis === 'x' ? { x: source.x, y: perpendicularValue } : { x: perpendicularValue, y: source.y }
		if (axis === 'x') full[1].y = perpendicularValue
		else full[1].x = perpendicularValue
		full.splice(1, 0, stub)
		return normalizeAuthoredRoute(source, target, {
			startAxis: opposite(axis),
			points: full.slice(1, -1),
		})
	}

	if (segmentIndex === lastSegmentIndex) {
		if (axis === 'x') full[segmentIndex].y = perpendicularValue
		else full[segmentIndex].x = perpendicularValue
		const stub =
			axis === 'x' ? { x: target.x, y: perpendicularValue } : { x: perpendicularValue, y: target.y }
		full.splice(full.length - 1, 0, stub)
	} else if (axis === 'x') {
		full[segmentIndex].y = perpendicularValue
		full[segmentIndex + 1].y = perpendicularValue
	} else {
		full[segmentIndex].x = perpendicularValue
		full[segmentIndex + 1].x = perpendicularValue
	}

	return normalizeAuthoredRoute(source, target, {
		startAxis: normalized.startAxis,
		points: full.slice(1, -1),
	})
}

/* ------------------------------------------------------------------------- *
 * Endpoint-frame persistence — the same t/offset math as src/blocks/elbow's
 * pins, applied per coordinate.
 * ------------------------------------------------------------------------- */

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high)
}

function captureCoordinate(value: number, from: number, to: number): { t: number; o: number } {
	const span = to - from
	const mid = (from + to) / 2
	if (Math.abs(span) < PIN_SPAN_FLOOR) {
		return { t: 0.5, o: value - mid }
	}
	const t = clamp((value - from) / span, -PIN_T_LIMIT, PIN_T_LIMIT)
	return { t, o: value - (mid + (t - 0.5) * span) }
}

function resolveCoordinate(t: number, o: number, from: number, to: number): number {
	const span = to - from
	const mid = (from + to) / 2
	return mid + (t - 0.5) * span + o
}

export function captureAuthoredRoute(
	route: AuthoredElbowRoute,
	start: Point,
	end: Point,
	legs: ElbowTerminalLegs = {},
): ConnectionElbowRouteModel {
	return {
		startAxis: route.startAxis,
		corners: route.points.map((point) => {
			const x = captureCoordinate(point.x, start.x, end.x)
			const y = captureCoordinate(point.y, start.y, end.y)
			return { tx: x.t, ox: x.o, ty: y.t, oy: y.o }
		}),
		...(legs.startLeg === undefined ? {} : { startLeg: terminalLeg(legs.startLeg) }),
		...(legs.endLeg === undefined ? {} : { endLeg: terminalLeg(legs.endLeg) }),
	}
}

export function resolveAuthoredRoute(
	model: ConnectionElbowRouteModel,
	start: Point,
	end: Point
): AuthoredElbowRoute {
	return normalizeAuthoredRoute(start, end, {
		startAxis: model.startAxis,
		points: model.corners.map((corner) => ({
			x: resolveCoordinate(corner.tx, corner.ox, start.x, end.x),
			y: resolveCoordinate(corner.ty, corner.oy, start.y, end.y),
		})),
	})
}

/* ------------------------------------------------------------------------- *
 * The resolved form the rest of the connection code consumes
 * ------------------------------------------------------------------------- */

function segmentsOf(points: Point[], startAxis: AuthoredAxis): ElbowSegment[] {
	const segments: ElbowSegment[] = []
	for (let index = 0; index < points.length - 1; index += 1) {
		const from = points[index]
		const to = points[index + 1]
		if (pointsMatch(from, to)) continue
		segments.push({
			index,
			axis: segmentAxisOf(from, to, authoredSegmentAxis(startAxis, index)),
			start: { ...from },
			end: { ...to },
			midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
			length: Math.hypot(to.x - from.x, to.y - from.y),
			// End segments touch a bound port; dragging one GROWS a rail rather
			// than sliding, but every segment is draggable in authored mode.
			pinnable: index !== 0 && index !== points.length - 2,
		})
	}
	return segments
}

/**
 * Resolve a persisted authored route into Lane C's `ElbowRoute` shape.
 *
 * `start`/`end` are the raw port points; the rails live between the dongles
 * and the rendered polyline includes the two fixed dongle legs.
 */
export function authoredElbowRoute(
	model: ConnectionElbowRouteModel,
	start: Point,
	end: Point
): ElbowRoute {
	const dongles = dongleEndpoints(start, end, model)
	let normalized = resolveAuthoredRoute(model, dongles.start, dongles.end)
	if (normalized.points.length === 0) {
		// No surviving corners — synthesize the canonical mid-rail Z between
		// the dongles so the route stays orthogonal.
		const midX = (dongles.start.x + dongles.end.x) / 2
		normalized = normalizeAuthoredRoute(dongles.start, dongles.end, {
			startAxis: 'x',
			points: [
				{ x: midX, y: dongles.start.y },
				{ x: midX, y: dongles.end.y },
			],
		})
	}
	const points = [
		{ ...start },
		{ ...dongles.start },
		...normalized.points,
		{ ...dongles.end },
		{ ...end },
	]
	return {
		points,
		segments: segmentsOf(points, 'x'),
		pins: [],
		droppedPins: [],
		fallback: false,
	}
}

/** Convert an auto route's resolved polyline into an authored model. */
export function captureResolvedRoute(
	routePoints: readonly Point[],
	start: Point,
	end: Point,
	legs: ElbowTerminalLegs = {},
): ConnectionElbowRouteModel {
	const startAxis =
		routePoints.length > 1 ? segmentAxisOf(routePoints[0], routePoints[1], 'x') : 'x'
	return captureAuthoredRoute(
		{ startAxis, points: routePoints.slice(1, -1).map((point) => ({ ...point })) },
		start,
		end,
		legs,
	)
}
