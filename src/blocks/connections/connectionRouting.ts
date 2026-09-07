/**
 * Pure geometry for the three connection routings.
 *
 * `curved` is the kit's cubic and stays the default; `straight` is a line; and
 * `elbow` is a multi-bend orthogonal route from the Excalidraw-derived A* router
 * in `src/blocks/elbow`. Each has one shape until the user drags its control
 * point, at which point it takes an authored form:
 *
 *   curved / straight  →  one waypoint (`curve`), a bend through the pointer
 *   elbow              →  a pinned rail, or a whole authored polyline
 *
 * Everything here is editor-free so it unit-tests directly; the shape util owns
 * the editor-bound parts (terminals, obstacle boxes, handles).
 */
import { clamp, Vec, type VecLike } from 'tldraw'
import {
	elbowPath,
	elbowPointAt,
	routeElbow,
	type ElbowPin,
	type ElbowRect,
	type ElbowRoute,
	type ElbowRouteInput,
	type ElbowSide,
} from '../elbow'
import type { ConnectionRoutingKind } from './connectionModel'

/** Offset of a bent route's visible midpoint from the endpoint midpoint. */
export interface ConnectionCurve {
	dx: number
	dy: number
}

/* ------------------------- curved (kit default) ------------------------- */

/** Which way a cable leaves the face it is welded to. */
export type ConnectionExitSide = 'left' | 'right' | 'top' | 'bottom'

export interface ConnectionExitSides {
	start?: ConnectionExitSide
	end?: ConnectionExitSide
}

const EXIT_NORMAL: Readonly<Record<ConnectionExitSide, { x: number; y: number }>> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 },
}

/**
 * The kit's default cubic, leaving each end along its own face normal.
 *
 * WHY the sides matter: the original always offset horizontally, which is the
 * whole truth only while every port lives on a left or right edge. Once a
 * socket can sit on the top or bottom wall, a horizontal control point makes
 * the curve leave the face TANGENTIALLY — it slides along the card's underside
 * before turning, instead of departing perpendicular to the wall it is welded
 * to. The elbow router already reads `elbowSide` for exactly this reason; this
 * is the curved renderer catching up to the same fact.
 *
 * An absent side keeps the historical horizontal behaviour, so every cable
 * between two ordinary left/right ports draws exactly as it always did.
 */
export function getConnectionControlPoints(
	start: VecLike,
	end: VecLike,
	sides: ConnectionExitSides = {},
): [Vec, Vec] {
	const distance = end.x - start.x
	const horizontalOffset = Math.max(
		30,
		distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100),
	)
	const verticalDistance = end.y - start.y
	const verticalOffset = Math.max(
		30,
		Math.abs(verticalDistance) > 0
			? Math.min(Math.abs(verticalDistance) / 3 + 30, 140)
			: 30,
	)
	const control = (point: VecLike, side: ConnectionExitSide | undefined, fallbackX: number) => {
		if (!side) return new Vec(point.x + fallbackX, point.y)
		const normal = EXIT_NORMAL[side]
		const reach = normal.x !== 0 ? horizontalOffset : verticalOffset
		return new Vec(point.x + normal.x * reach, point.y + normal.y * reach)
	}
	return [
		control(start, sides.start, horizontalOffset),
		control(end, sides.end, -horizontalOffset),
	]
}

function defaultCurvedPath(start: VecLike, end: VecLike, sides?: ConnectionExitSides): string {
	const [cp1, cp2] = getConnectionControlPoints(start, end, sides)
	return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
}

function defaultCurvedMidpoint(start: VecLike, end: VecLike, sides?: ConnectionExitSides): Vec {
	const [cp1, cp2] = getConnectionControlPoints(start, end, sides)
	// Cubic Bezier at t=.5: (P0 + 3P1 + 3P2 + P3) / 8.
	return new Vec(
		(start.x + 3 * cp1.x + 3 * cp2.x + end.x) / 8,
		(start.y + 3 * cp1.y + 3 * cp2.y + end.y) / 8,
	)
}

/* --------------------- bend (an activated control point) ----------------- */

/** Where the control point sits once it has been dragged. */
export function getCurveWaypoint(start: VecLike, end: VecLike, curve: ConnectionCurve): Vec {
	return new Vec((start.x + end.x) / 2 + curve.dx, (start.y + end.y) / 2 + curve.dy)
}

function bentCurvedPath(start: VecLike, end: VecLike, curve: ConnectionCurve): string {
	// Quadratic control that makes the path cross the waypoint at t=0.5.
	const controlX = (start.x + end.x) / 2 + curve.dx * 2
	const controlY = (start.y + end.y) / 2 + curve.dy * 2
	return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`
}

/** The bent quadratic expressed as a cubic, for tldraw's `CubicBezier2d`. */
export function getBentCurveCubicControlPoints(
	start: VecLike,
	end: VecLike,
	curve: ConnectionCurve,
): [Vec, Vec] {
	const controlX = (start.x + end.x) / 2 + curve.dx * 2
	const controlY = (start.y + end.y) / 2 + curve.dy * 2
	return [
		new Vec(start.x + (2 / 3) * (controlX - start.x), start.y + (2 / 3) * (controlY - start.y)),
		new Vec(end.x + (2 / 3) * (controlX - end.x), end.y + (2 / 3) * (controlY - end.y)),
	]
}

/* --------------------------------- elbow --------------------------------- */

export interface ConnectionElbowBoxes {
	start?: ElbowRect | null
	end?: ElbowRect | null
	/**
	 * The edge each terminal actually sits on, when it is not the usual one.
	 * Omitted means the historical default: out of the right, into the left.
	 */
	startSide?: ElbowSide
	endSide?: ElbowSide
}

/**
 * A cable leaves the edge its port sits on, perpendicular to that edge.
 *
 * For the two ordinary lanes that is out of the right and into the left, which
 * is why those are the defaults. Two ports break it, and they arrived from two
 * directions in the same afternoon: an **effect port sits on the top edge** —
 * the call gave its value no name and so no right-hand port to leave by — and
 * a **Loop's item outlet sits on its header's bottom edge**, facing down into
 * the body, where a rightward dongle sent a 120px run on a lap around the whole
 * region. Passing the side through is what keeps the first segment
 * perpendicular to the face the cable actually meets, and the side travels with
 * the port (`BlockConnectionPort.elbowSide`) so nothing here has to know which
 * kind of port it is looking at.

 */
export function getElbowRouteInput(
	start: VecLike,
	end: VecLike,
	boxes: ConnectionElbowBoxes,
	pins: readonly ElbowPin[],
): ElbowRouteInput {
	return {
		start: {
			point: { x: start.x, y: start.y },
			side: boxes.startSide ?? 'right',
			box: boxes.start ?? null,
		},
		end: {
			point: { x: end.x, y: end.y },
			side: boxes.endSide ?? 'left',
			box: boxes.end ?? null,
		},
		pins,
	}
}

export function getElbowConnectionRoute(
	start: VecLike,
	end: VecLike,
	boxes: ConnectionElbowBoxes,
	pins: readonly ElbowPin[],
): ElbowRoute {
	return routeElbow(getElbowRouteInput(start, end, boxes, pins))
}

/* ----------------------------- kind dispatch ----------------------------- */

export interface ConnectionPathOptions {
	curve?: ConnectionCurve | null
	/** Required when routing is `elbow`. */
	route?: ElbowRoute
	/** Which wall each end leaves by; absent keeps the historical horizontal exit. */
	sides?: ConnectionExitSides
}

export function getConnectionPath(
	routing: ConnectionRoutingKind,
	start: VecLike,
	end: VecLike,
	options: ConnectionPathOptions = {},
): string {
	switch (routing) {
		case 'straight':
			return options.curve
				? bentCurvedPath(start, end, options.curve)
				: `M ${start.x} ${start.y} L ${end.x} ${end.y}`
		case 'elbow':
			return options.route ? elbowPath(options.route) : defaultCurvedPath(start, end, options.sides)
		case 'curved':
		default:
			return options.curve
				? bentCurvedPath(start, end, options.curve)
				: defaultCurvedPath(start, end, options.sides)
	}
}

/** The visible midpoint — where the control point sits. */
export function getConnectionCenterPoint(
	routing: ConnectionRoutingKind,
	start: VecLike,
	end: VecLike,
	options: ConnectionPathOptions = {},
): Vec {
	switch (routing) {
		case 'straight':
			return options.curve
				? getCurveWaypoint(start, end, options.curve)
				: new Vec((start.x + end.x) / 2, (start.y + end.y) / 2)
		case 'elbow': {
			if (!options.route) return defaultCurvedMidpoint(start, end, options.sides)
			const center = elbowPointAt(options.route, 0.5)
			return new Vec(center.x, center.y)
		}
		case 'curved':
		default:
			return options.curve
				? getCurveWaypoint(start, end, options.curve)
				: defaultCurvedMidpoint(start, end, options.sides)
	}
}
