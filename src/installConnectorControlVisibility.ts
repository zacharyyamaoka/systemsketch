import { type Box, type Editor, type TLShape, type TLShapeId, Vec } from 'tldraw'

import { CONNECTION_SHAPE_TYPE } from './blocks/connections/connectionModel'
import { getConnectionShapeGeometryPoints } from './blocks/connections/ConnectionShapeUtil'
import {
	connectorControlBounds,
	connectorControlBoundsContains,
	nearbyConnector,
} from './connectorControlVisibility'

const isConnector = (shape: TLShape): boolean => (
	shape.type === 'arrow' || shape.type === CONNECTION_SHAPE_TYPE
)

const CONNECTOR_MANIPULATION_STATES = [
	'select.translating',
	'select.resizing',
	'select.rotating',
	'select.dragging_handle',
]

function isWithinCanvasViewport(
	container: HTMLElement,
	clientX: number,
	clientY: number,
): boolean {
	// tldraw keeps a transparent menu-dismiss layer over the canvas while a
	// style popover is open. The pointer is still visibly over the canvas, so
	// membership must follow viewport coordinates rather than the topmost node.
	const canvas = container.querySelector('.tl-canvas')
	if (!(canvas instanceof HTMLElement)) return false
	const bounds = canvas.getBoundingClientRect()
	return clientX >= bounds.left
		&& clientX <= bounds.right
		&& clientY >= bounds.top
		&& clientY <= bounds.bottom
}

/** The padded route rectangle for one selected connector, in page space. */
export function getConnectorControlBounds(editor: Editor, shapeId: TLShapeId): Box | null {
	const shape = editor.getShape(shapeId)
	if (!shape || !isConnector(shape)) return null
	if (shape.type === CONNECTION_SHAPE_TYPE) {
		const transform = editor.getShapePageTransform(shape.id)
		if (!transform) return null
		const points = getConnectionShapeGeometryPoints(editor, shape.id)
		return connectorControlBounds(
			points.map((point) => transform.applyToPoint(point)),
			editor.getZoomLevel(),
		)
	}

	// Stock ArrowShapeUtil already computes the exact body/head/label bounds.
	// Feeding its page-space corners into the shared padding rule avoids copying
	// any arrow geometry, including arcs and future stock implementations.
	const bounds = editor.getShapePageBounds(shape.id)
	if (!bounds) return null
	return connectorControlBounds([
		new Vec(bounds.minX, bounds.minY),
		new Vec(bounds.maxX, bounds.maxY),
	], editor.getZoomLevel())
}

/**
 * Update one editor-scoped threshold signal as the pointer crosses connector
 * rectangles. Shape handles remain entirely stock; only their availability is
 * conditional. A stored last pointer also makes the selection click itself
 * reveal interior controls—no follow-up mouse move is required.
 */
export function installConnectorControlVisibility(editor: Editor): () => void {
	const container = editor.getContainer()
	let lastPointer: { clientX: number; clientY: number } | null = null

	const clear = () => {
		if (nearbyConnector.get(editor) !== null) nearbyConnector.set(editor, null)
	}

	const update = () => {
		// tldraw removes selection handles for the whole manipulation. Measuring
		// every selected connector while none of those controls can paint turns a
		// large select-all drag into one route walk per cable per pointer frame.
		// Pointer-up already schedules a fresh measurement after the tool settles.
		if (CONNECTOR_MANIPULATION_STATES.some((path) => editor.isIn(path))) return
		if (!lastPointer || !isWithinCanvasViewport(
			container,
			lastPointer.clientX,
			lastPointer.clientY,
		)) {
			clear()
			return
		}
		const pagePoint = editor.screenToPage({ x: lastPointer.clientX, y: lastPointer.clientY })
		let best: TLShapeId | null = null
		let bestArea = Infinity
		for (const shape of editor.getSelectedShapes()) {
			if (!isConnector(shape)) continue
			const bounds = getConnectorControlBounds(editor, shape.id)
			if (!connectorControlBoundsContains(bounds, pagePoint)) continue
			const area = bounds!.w * bounds!.h
			if (area >= bestArea) continue
			best = shape.id
			bestArea = area
		}
		if (nearbyConnector.get(editor) !== best) nearbyConnector.set(editor, best)
	}

	const remember = (event: PointerEvent) => {
		lastPointer = { clientX: event.clientX, clientY: event.clientY }
		update()
	}
	const onPointerDown = (event: PointerEvent) => {
		lastPointer = { clientX: event.clientX, clientY: event.clientY }
		// Selection may be committed later in this event dispatch. Re-evaluate once
		// it has settled so the initial click reveals controls immediately.
		requestAnimationFrame(update)
	}
	const onPointerUp = (event: PointerEvent) => {
		lastPointer = { clientX: event.clientX, clientY: event.clientY }
		// Arrow creation commits its selected shape on release, after listeners on
		// the container have run. The same post-dispatch check keeps creation and a
		// normal selection click on the identical no-extra-move path.
		requestAnimationFrame(update)
	}
	const onPointerLeave = () => {
		lastPointer = null
		clear()
	}

	container.addEventListener('pointermove', remember)
	container.addEventListener('pointerup', onPointerUp)
	container.addEventListener('pointerdown', onPointerDown)
	container.addEventListener('pointerleave', onPointerLeave)
	const stopWatchingStore = editor.store.listen(update, { scope: 'session' })

	return () => {
		container.removeEventListener('pointermove', remember)
		container.removeEventListener('pointerup', onPointerUp)
		container.removeEventListener('pointerdown', onPointerDown)
		container.removeEventListener('pointerleave', onPointerLeave)
		stopWatchingStore()
		clear()
	}
}
