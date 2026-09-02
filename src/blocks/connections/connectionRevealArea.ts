import { Box, Vec, type VecLike } from 'tldraw'

/**
 * Which region reveals a cable's control points.
 *
 * Figma's model: a rectangle that fits the arrow's own outer extents, padded
 * generously, recomputed as the arrow bends. Come inside it and the control
 * points appear, large enough to see and grab; leave and they go away, so a
 * selected cable does not sprinkle grabbable dots across the board.
 *
 * This replaces a distance-to-the-curve test, which fails exactly where an
 * elbow needs it most. A U-shaped elbow encloses a large empty area: the
 * pointer can be squarely inside the arrow's footprint, reading as "on" the
 * arrow to anyone looking at it, while being two hundred pixels from the
 * nearest stroke. Distance says no; the picture says yes. The rectangle agrees
 * with the picture, and it is also the thing that is cheap to recompute on
 * every pointer move.
 */

/**
 * How far outside the arrow's extents the reveal reaches, in screen pixels.
 *
 * Twice tldraw's handle radius, so the box extends exactly as far as a control
 * point you could already grab if one were sitting on the boundary. That keeps
 * the number derived rather than chosen, and it means the reveal can never be
 * tighter than the thing it is revealing.
 */
export const REVEAL_PAD_SCREEN_PX = 24

/**
 * The floor on either dimension, in screen pixels.
 *
 * A cable between two touching ports has a nearly degenerate box. Without a
 * floor its reveal region would be a sliver you cannot land on, and the one
 * gesture it gates — grabbing the control point — would be unreachable.
 */
export const REVEAL_MIN_SCREEN_PX = 64

/**
 * The rectangle whose interior reveals a cable's control points, in page space.
 *
 * `points` is the cable's rendered route: the polyline for an elbow, or a
 * sampling of the curve for the other two. Padding is expressed in screen
 * pixels and converted here, so the region feels the same size at every zoom.
 */
export function connectionRevealBounds(
	points: readonly VecLike[],
	zoom: number,
	padScreenPx: number = REVEAL_PAD_SCREEN_PX,
	minScreenPx: number = REVEAL_MIN_SCREEN_PX,
): Box | null {
	if (points.length === 0) return null
	const safeZoom = zoom > 0 ? zoom : 1
	const bounds = Box.FromPoints(points.map((point) => Vec.From(point)))

	const pad = padScreenPx / safeZoom
	bounds.expandBy(pad)

	// Grow about the centre, so a degenerate box does not drift off the cable.
	const minimum = minScreenPx / safeZoom
	if (bounds.w < minimum) {
		const grow = (minimum - bounds.w) / 2
		bounds.x -= grow
		bounds.w += grow * 2
	}
	if (bounds.h < minimum) {
		const grow = (minimum - bounds.h) / 2
		bounds.y -= grow
		bounds.h += grow * 2
	}

	return bounds
}

/** Whether a page point falls inside a reveal region. */
export function revealAreaContains(bounds: Box | null, point: VecLike): boolean {
	return bounds !== null && bounds.containsPoint(Vec.From(point))
}
