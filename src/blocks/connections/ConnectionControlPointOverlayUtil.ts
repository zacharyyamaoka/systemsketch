import {
	Mat,
	OverlayUtil,
	type Geometry2d,
	type TLHandle,
	type TLOverlay,
	type TLShapeId,
} from 'tldraw'
import { nearbyConnection } from '../ports/portState'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'

/**
 * Make a revealed control point big enough to see and to aim at.
 *
 * A cable's control points are hidden until the pointer enters the cable's
 * reveal region, so by the time one is on screen it is the thing you came for —
 * and tldraw's painted handle is a 4px disc, sized for a permanently-visible
 * arrow endpoint rather than for something that just appeared.
 *
 * This paints a halo underneath each of them. Underneath, and additive, on
 * purpose: `ShapeHandleOverlayUtil.render` hard-codes that 4px radius, so the
 * alternative is to copy its renderer into this repo — and tldraw's core SDK is
 * a dependency here, not a template to own. An extra ring at a lower z-index
 * gets the same result without a fork that would silently rot at the next
 * upgrade.
 *
 * The halo tracks the same `nearbyConnection` signal that gates the handles, so
 * it can never be on screen without them.
 */

/** Radius of the halo, in screen pixels. */
export const CONTROL_POINT_HALO_RADIUS_PX = 9

interface TLConnectionControlPointOverlay extends TLOverlay {
	props: {
		shapeId: TLShapeId
		handle: TLHandle
	}
}

export class ConnectionControlPointOverlayUtil
	extends OverlayUtil<TLConnectionControlPointOverlay> {
	static override type = 'connection_control_point'
	// Below tldraw's own handles (200), so its dot still paints on top.
	override options = { zIndex: 190 }

	override isActive(): boolean {
		const editor = this.editor
		if (editor.getIsReadonly()) return false
		if (!editor.isInAny('select.idle', 'select.pointing_handle', 'select.dragging_handle')) {
			return false
		}
		return nearbyConnection.get(editor) !== null
	}

	override getOverlays(): TLConnectionControlPointOverlay[] {
		const editor = this.editor
		const shapeId = nearbyConnection.get(editor)
		if (!shapeId) return []
		const shape = editor.getShape(shapeId)
		if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return []
		if (editor.getOnlySelectedShapeId() !== shapeId) return []

		// Terminals are always offered, with or without the reveal; the halo is
		// for the points the reveal brought on screen.
		return (editor.getShapeHandles(shape) ?? [])
			.filter((handle) => handle.id !== 'start' && handle.id !== 'end')
			.map((handle) => ({
				id: `connection_control_point:${shapeId}:${handle.id}`,
				type: 'connection_control_point',
				props: { shapeId, handle },
			}))
	}

	/**
	 * No geometry: the halo is decoration, and tldraw's own handle overlay owns
	 * the hit test. Two overlapping targets for one point would only be a way
	 * for the wrong one to win.
	 */
	override getGeometry(): Geometry2d | null {
		return null
	}

	override render(
		ctx: CanvasRenderingContext2D,
		overlays: TLConnectionControlPointOverlay[],
	): void {
		if (overlays.length === 0) return
		const editor = this.editor
		const transform = editor.getShapePageTransform(overlays[0].props.shapeId)
		if (!transform) return

		const zoom = editor.getZoomLevel()
		const theme = editor.getCurrentTheme().colors[editor.getColorMode()]
		const radius = CONTROL_POINT_HALO_RADIUS_PX / zoom

		ctx.save()
		ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
		ctx.fillStyle = theme.selectionFill
		ctx.strokeStyle = theme.selectionStroke
		ctx.lineWidth = 1.5 / zoom
		for (const overlay of overlays) {
			const { handle } = overlay.props
			ctx.beginPath()
			ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2)
			ctx.fill()
			ctx.stroke()
		}
		ctx.restore()
	}
}

/** Page-space centre of one handle, for tests and the hit-area overlay. */
export function controlPointPagePoint(
	editor: import('tldraw').Editor,
	shapeId: TLShapeId,
	handle: TLHandle,
) {
	const transform = editor.getShapePageTransform(shapeId)
	return transform ? Mat.applyToPoint(transform, handle) : null
}
