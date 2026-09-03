import { Box, Vec, type Editor, type TLShapeId, type VecLike } from 'tldraw'

import { EditorAtom } from './blocks/ports/portState'

/**
 * Shared visibility policy for the controls between a connector's terminals.
 *
 * Terminals are deliberately not represented here: both shape utils always
 * return them. This transient signal gates only bend / rail handles, leaving
 * tldraw's stock handle renderer and `select.dragging_handle` interaction in
 * complete control once a handle is offered.
 */
export const nearbyConnector = new EditorAtom<TLShapeId | null>(
	'nearby connector controls',
	() => null,
)

/** FigJam's padded outer rectangle, expressed in stable screen pixels. */
export const CONNECTOR_CONTROL_PAD_SCREEN_PX = 24

/** Keep a nearly horizontal or vertical connector's target easy to enter. */
export const CONNECTOR_CONTROL_MIN_SCREEN_PX = 64

/**
 * Fit a connector's rendered route and pad it into the rectangle that reveals
 * interior controls. The result is in page space; padding remains the same
 * physical size at every zoom.
 */
export function connectorControlBounds(
	points: readonly VecLike[],
	zoom: number,
	padScreenPx: number = CONNECTOR_CONTROL_PAD_SCREEN_PX,
	minScreenPx: number = CONNECTOR_CONTROL_MIN_SCREEN_PX,
): Box | null {
	if (points.length === 0) return null
	const safeZoom = zoom > 0 ? zoom : 1
	const bounds = Box.FromPoints(points.map((point) => Vec.From(point)))

	bounds.expandBy(padScreenPx / safeZoom)
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

export function connectorControlBoundsContains(bounds: Box | null, point: VecLike): boolean {
	return bounds !== null && bounds.containsPoint(Vec.From(point))
}

/** Shape-utils read this from their cached `getHandles`; the atom invalidates that cache. */
export function showConnectorInteriorControls(editor: Editor, shapeId: TLShapeId): boolean {
	return nearbyConnector.get(editor) === shapeId
}
