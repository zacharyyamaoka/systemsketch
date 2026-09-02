import { Box, type Editor, type TLShapeId } from 'tldraw'
import { nearbyConnection } from '../ports/portState'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { connectionRevealBounds, revealAreaContains } from './connectionRevealArea'
import { getConnectionShapeGeometryPoints } from './ConnectionShapeUtil'

/**
 * Track which selected cable the pointer is inside the reveal region of.
 *
 * Only SELECTED cables are measured, so this is a walk over one or two shapes
 * per pointer move rather than the whole page. It writes an editor-scoped atom
 * that flips at the boundary, so `getHandles` recomputes when the answer
 * changes rather than on every move.
 */

/**
 * A pointer over chrome is not a pointer over the board.
 *
 * The contextual menu sits above the cable it belongs to and frequently
 * overlaps its reveal region; reaching for the menu would otherwise light up
 * the very control points the menu is offering an alternative to. Rather than
 * subtract each piece of chrome from the region, ask the only question that
 * actually matters — is the thing under the pointer part of the canvas? Shapes
 * render inside `.tl-canvas`; every panel, toolbar, menu and on-canvas offer
 * renders in sibling layers. One rule, and it covers chrome that does not exist
 * yet.
 */
function isOverTheCanvas(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('.tl-canvas') !== null
}

/** The reveal region for one cable, in page space — the hit test's own answer. */
export function getConnectionRevealBounds(
	editor: Editor,
	connectionId: TLShapeId,
): Box | null {
	const points = getConnectionShapeGeometryPoints(editor, connectionId)
	if (points.length === 0) return null
	const transform = editor.getShapePageTransform(connectionId)
	if (!transform) return null
	return connectionRevealBounds(
		points.map((point) => transform.applyToPoint(point)),
		editor.getZoomLevel(),
	)
}

export function installConnectionProximity(editor: Editor): () => void {
	const container = editor.getContainer()

	const clear = () => {
		if (nearbyConnection.get(editor) !== null) nearbyConnection.set(editor, null)
	}

	const update = (clientX: number, clientY: number, target: EventTarget | null) => {
		if (!isOverTheCanvas(target)) {
			clear()
			return
		}

		const selected = editor.getSelectedShapes()
			.filter((shape) => shape.type === CONNECTION_SHAPE_TYPE)
		if (selected.length === 0) {
			clear()
			return
		}

		const pagePoint = editor.screenToPage({ x: clientX, y: clientY })

		// Smallest region wins where two overlap: the tighter box is the cable
		// the pointer is more specifically inside.
		let best: TLShapeId | null = null
		let bestArea = Infinity
		for (const shape of selected) {
			const bounds = getConnectionRevealBounds(editor, shape.id)
			if (!revealAreaContains(bounds, pagePoint)) continue
			const area = bounds!.w * bounds!.h
			if (area >= bestArea) continue
			bestArea = area
			best = shape.id
		}

		if (nearbyConnection.get(editor) !== best) nearbyConnection.set(editor, best)
	}

	const onPointerMove = (event: PointerEvent) => update(event.clientX, event.clientY, event.target)
	const onPointerLeave = () => clear()

	container.addEventListener('pointermove', onPointerMove)
	container.addEventListener('pointerleave', onPointerLeave)
	// A cable that stops being selected must stop offering its points, even if
	// the pointer never moves again.
	const stopWatchingSelection = editor.store.listen(() => {
		const current = nearbyConnection.get(editor)
		if (current === null) return
		if (!editor.getSelectedShapeIds().includes(current)) clear()
	}, { scope: 'session' })

	return () => {
		container.removeEventListener('pointermove', onPointerMove)
		container.removeEventListener('pointerleave', onPointerLeave)
		stopWatchingSelection()
	}
}
