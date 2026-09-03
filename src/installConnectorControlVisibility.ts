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

function isOverCanvas(
	target: EventTarget | null,
	clientX: number,
	clientY: number,
): boolean {
	if (target instanceof Element && target.closest('.tl-canvas') !== null) return true
	// Pointer capture retargets an arrow-creation release to tldraw's outer
	// container. `elementFromPoint` answers what is visually under that pointer,
	// retaining the old rule that chrome outside `.tl-canvas` never reveals
	// controls while allowing the just-created arrow to reveal on release.
	return document.elementFromPoint(clientX, clientY)?.closest('.tl-canvas') !== null
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
	let lastPointer: { clientX: number; clientY: number; target: EventTarget | null } | null = null

	const clear = () => {
		if (nearbyConnector.get(editor) !== null) nearbyConnector.set(editor, null)
	}

	const update = () => {
		if (!lastPointer || !isOverCanvas(
			lastPointer.target,
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
		lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target }
		update()
	}
	const onPointerDown = (event: PointerEvent) => {
		lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target }
		// Selection may be committed later in this event dispatch. Re-evaluate once
		// it has settled so the initial click reveals controls immediately.
		requestAnimationFrame(update)
	}
	const onPointerUp = (event: PointerEvent) => {
		lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target }
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
