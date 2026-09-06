/**
 * Which wall a drawn communication arrow actually crosses.
 *
 * THE RULE (Zach, 2026-09-06): "the ports should appear on the two edges that
 * your arrow intersects when wiring."
 *
 * WHY this replaces the centre-to-centre guess: `facingRail` compared card
 * centres and picked whichever axis dominated, so the sockets landed on the
 * wall the *layout* suggested rather than the wall you drew through. Drag from
 * the bottom of one card around to the top of another and the guess still said
 * "these are side by side, use left and right" — the ports appeared nowhere
 * near the line you drew. The line is the instruction; this reads it.
 *
 * Pure geometry: segment against axis-aligned rectangle, Liang–Barsky. The
 * press point is inside the source card and the release point is inside the
 * target card, so each rectangle has exactly one crossing of interest — the
 * source's exit and the target's entry.
 */

export type CrossedEdge = 'left' | 'right' | 'top' | 'bottom'

export interface EdgeCrossing {
	edge: CrossedEdge
	/** How far along that edge the crossing sits, 0 at the left/top corner. */
	edgeT: number
}

export interface CrossingRect {
	x: number
	y: number
	w: number
	h: number
}

export interface CrossingPoint {
	x: number
	y: number
}

const EPSILON = 1e-6

/**
 * Liang–Barsky clip of a segment against a rectangle.
 *
 * Returns the entry and exit parameters along `from → to`, or null when the
 * segment misses entirely. The values are deliberately NOT clamped to [0, 1]:
 * a press inside the rectangle yields a negative entry, and that is exactly
 * how the caller tells "started inside" from "crossed on the way".
 */
export function clipSegmentToRect(
	rect: CrossingRect,
	from: CrossingPoint,
	to: CrossingPoint,
): { enter: number; exit: number } | null {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const minX = rect.x
	const maxX = rect.x + Math.max(0, rect.w)
	const minY = rect.y
	const maxY = rect.y + Math.max(0, rect.h)
	let enter = Number.NEGATIVE_INFINITY
	let exit = Number.POSITIVE_INFINITY
	const slab = (p: number, q: number): boolean => {
		if (Math.abs(p) < EPSILON) return q >= 0
		const t = q / p
		if (p < 0) enter = Math.max(enter, t)
		else exit = Math.min(exit, t)
		return true
	}
	if (!slab(-dx, from.x - minX)) return null
	if (!slab(dx, maxX - from.x)) return null
	if (!slab(-dy, from.y - minY)) return null
	if (!slab(dy, maxY - from.y)) return null
	if (enter > exit) return null
	return { enter, exit }
}

/** Which wall a point on the rectangle's boundary lies on, and where along it. */
export function classifyBoundaryPoint(
	rect: CrossingRect,
	point: CrossingPoint,
): EdgeCrossing {
	const w = Math.max(1, rect.w)
	const h = Math.max(1, rect.h)
	const distances: { edge: CrossedEdge; distance: number }[] = [
		{ edge: 'left', distance: Math.abs(point.x - rect.x) },
		{ edge: 'right', distance: Math.abs(point.x - (rect.x + w)) },
		{ edge: 'top', distance: Math.abs(point.y - rect.y) },
		{ edge: 'bottom', distance: Math.abs(point.y - (rect.y + h)) },
	]
	const nearest = distances.reduce((a, b) => (b.distance < a.distance ? b : a))
	const along = nearest.edge === 'left' || nearest.edge === 'right'
		? (point.y - rect.y) / h
		: (point.x - rect.x) / w
	return { edge: nearest.edge, edgeT: Math.min(1, Math.max(0, along)) }
}

function at(from: CrossingPoint, to: CrossingPoint, t: number): CrossingPoint {
	return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/**
 * The wall the arrow leaves the SOURCE card by.
 *
 * `from` is the press point, normally inside the card; the exit is the single
 * crossing on the way to `to`. A press that landed outside the card (the whole
 * segment passes through it) still answers with the wall it left by, which is
 * the honest reading of "the edge your arrow intersects".
 */
export function arrowExitEdge(
	rect: CrossingRect,
	from: CrossingPoint,
	to: CrossingPoint,
): EdgeCrossing | null {
	const clip = clipSegmentToRect(rect, from, to)
	if (!clip || !Number.isFinite(clip.exit)) return null
	return classifyBoundaryPoint(rect, at(from, to, clip.exit))
}

/**
 * The wall the arrow enters the TARGET card by.
 *
 * `to` is the release point, normally inside the card, so the entry is the
 * single crossing on the way in. A segment that begins inside the target — the
 * two cards overlap, or the drag never left it — has a negative entry and no
 * honest crossing to report, so this answers null and the caller falls back.
 */
export function arrowEntryEdge(
	rect: CrossingRect,
	from: CrossingPoint,
	to: CrossingPoint,
): EdgeCrossing | null {
	const clip = clipSegmentToRect(rect, from, to)
	if (!clip || !Number.isFinite(clip.enter) || clip.enter < 0) return null
	return classifyBoundaryPoint(rect, at(from, to, clip.enter))
}
