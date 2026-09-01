import {
	Circle2d,
	OverlayUtil,
	type Geometry2d,
	type TLCursorType,
	type TLOverlay,
	type TLShapeId,
} from 'tldraw'
import { blockPickerIsOpen } from './blockPicker'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { insertBlockWithinConnection } from './insertBlockWithinConnection'
import { getConnectionPageCenter, type ConnectionShape } from './ConnectionShapeUtil'

/** Painted diameter of the ring, in screen px. */
export const CONNECTION_INSERT_HANDLE_SIZE_PX = 16
/** The forgiving target around it, in screen px. */
export const CONNECTION_INSERT_HANDLE_HOVER_SIZE_PX = 24
/** Below this zoom the ring would be noise on a busy board. */
export const CONNECTION_INSERT_HANDLE_MIN_ZOOM = 0.5

interface TLConnectionInsertHandleOverlay extends TLOverlay {
	props: {
		shapeId: TLShapeId
		x: number
		y: number
	}
}

/**
 * A `+` at the midpoint of every fully-bound cable: press it to splice a Block
 * into that cable.
 *
 * An overlay rather than a shape handle because it must be pressable without
 * first selecting the cable — inserting into a path is a thing you do while
 * looking at the path, not a thing you do to a selection. tldraw's overlay layer
 * hit-tests and paints it above the canvas at a constant screen size.
 */
export class ConnectionInsertHandleOverlayUtil extends OverlayUtil<TLConnectionInsertHandleOverlay> {
	static override type = 'connection_insert_handle'
	override options = { zIndex: 150 }

	override isActive(): boolean {
		const editor = this.editor
		if (editor.getInstanceState().isReadonly) return false
		if (!editor.isIn('select.idle')) return false
		// The offer already on screen owns the pointer; a second entry point to
		// the same picker while it is open is only a way to lose the first.
		if (blockPickerIsOpen(editor)) return false
		return editor.getZoomLevel() > CONNECTION_INSERT_HANDLE_MIN_ZOOM
	}

	override getOverlays(): TLConnectionInsertHandleOverlay[] {
		const editor = this.editor
		const overlays: TLConnectionInsertHandleOverlay[] = []
		for (const renderingShape of editor.getRenderingShapes()) {
			const shape = renderingShape.shape
			if (shape.type !== CONNECTION_SHAPE_TYPE) continue
			const center = getConnectionPageCenter(editor, shape as ConnectionShape)
			if (!center) continue
			overlays.push({
				id: `connection_insert_handle:${shape.id}`,
				type: 'connection_insert_handle',
				props: { shapeId: shape.id, x: center.x, y: center.y },
			})
		}
		return overlays
	}

	override getGeometry(overlay: TLConnectionInsertHandleOverlay): Geometry2d {
		const radius = CONNECTION_INSERT_HANDLE_HOVER_SIZE_PX / 2 / this.editor.getZoomLevel()
		return new Circle2d({
			x: overlay.props.x - radius,
			y: overlay.props.y - radius,
			radius,
			isFilled: true,
		})
	}

	override getCursor(): TLCursorType {
		return 'pointer' as TLCursorType
	}

	override onPointerDown(overlay: TLConnectionInsertHandleOverlay): void {
		const connection = this.editor.getShape<ConnectionShape>(overlay.props.shapeId)
		if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) return
		insertBlockWithinConnection(this.editor, connection)
	}

	override render(
		ctx: CanvasRenderingContext2D,
		overlays: TLConnectionInsertHandleOverlay[],
	): void {
		if (overlays.length === 0) return
		const editor = this.editor
		const zoom = editor.getZoomLevel()
		const theme = editor.getCurrentTheme().colors[editor.getColorMode()]
		const hoveredId = editor.overlays.getHoveredOverlayId()

		const ringRadius = CONNECTION_INSERT_HANDLE_SIZE_PX / 2 / zoom
		const hoverRadius = CONNECTION_INSERT_HANDLE_HOVER_SIZE_PX / 2 / zoom
		const reach = (CONNECTION_INSERT_HANDLE_SIZE_PX / 3 - 1) / zoom

		for (const overlay of overlays) {
			const { x, y } = overlay.props
			const hovered = overlay.id === hoveredId

			// Quiet until you approach it: an always-solid `+` on every cable
			// competes with the cables themselves for attention.
			if (hovered) {
				ctx.fillStyle = theme.selectionFill
				ctx.beginPath()
				ctx.arc(x, y, hoverRadius, 0, Math.PI * 2)
				ctx.fill()
			}

			ctx.globalAlpha = hovered ? 1 : 0.45
			ctx.fillStyle = theme.selectionStroke
			ctx.beginPath()
			ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
			ctx.fill()

			ctx.strokeStyle = theme.selectedContrast
			ctx.lineWidth = 2 / zoom
			ctx.lineCap = 'round'
			ctx.beginPath()
			ctx.moveTo(x - reach, y)
			ctx.lineTo(x + reach, y)
			ctx.moveTo(x, y - reach)
			ctx.lineTo(x, y + reach)
			ctx.stroke()
			ctx.globalAlpha = 1
		}
	}
}
