import { Vec, type Editor, type TLShapeId } from 'tldraw'
import { nearbyConnection } from '../ports/portState'
import { controlPointProximityPageUnits } from './connectionHit'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { getConnectionShapeGeometryPoints } from './ConnectionShapeUtil'

/**
 * Track which selected cable the pointer is near.
 *
 * Figma shows an edge's control points only when the edge is selected AND the
 * mouse is close to it. Selection alone is the wrong trigger: a selected cable
 * that runs the width of the board would offer grabbable points along its whole
 * length, and every one is something to knock by accident.
 *
 * Only SELECTED cables are measured, so this is a walk over one or two shapes
 * per pointer move, not the whole page. It writes an editor-scoped atom that
 * flips at the threshold, so `getHandles` recomputes when the answer changes
 * rather than on every move.
 */
export function installConnectionProximity(editor: Editor): () => void {
	const container = editor.getContainer()

	const update = (clientX: number, clientY: number) => {
		const selected = editor.getSelectedShapes()
			.filter((shape) => shape.type === CONNECTION_SHAPE_TYPE)
		if (selected.length === 0) {
			if (nearbyConnection.get(editor) !== null) nearbyConnection.set(editor, null)
			return
		}

		const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
		const threshold = controlPointProximityPageUnits(editor.getZoomLevel())

		let best: TLShapeId | null = null
		let bestDistance = threshold
		for (const shape of selected) {
			const transform = editor.getShapePageTransform(shape.id)
			if (!transform) continue
			const local = editor.getPointInShapeSpace(shape, pagePoint)
			for (const point of getConnectionShapeGeometryPoints(editor, shape.id)) {
				const distance = Vec.Dist(point, local)
				if (distance > bestDistance) continue
				bestDistance = distance
				best = shape.id
			}
		}

		if (nearbyConnection.get(editor) !== best) nearbyConnection.set(editor, best)
	}

	const onPointerMove = (event: PointerEvent) => update(event.clientX, event.clientY)
	const onPointerLeave = () => {
		if (nearbyConnection.get(editor) !== null) nearbyConnection.set(editor, null)
	}

	container.addEventListener('pointermove', onPointerMove)
	container.addEventListener('pointerleave', onPointerLeave)
	// A cable that stops being selected must stop offering its points, even if
	// the pointer never moves again.
	const stopWatchingSelection = editor.store.listen(() => {
		if (nearbyConnection.get(editor) === null) return
		const stillSelected = editor.getSelectedShapeIds()
			.includes(nearbyConnection.get(editor) as TLShapeId)
		if (!stillSelected) nearbyConnection.set(editor, null)
	}, { scope: 'session' })

	return () => {
		container.removeEventListener('pointermove', onPointerMove)
		container.removeEventListener('pointerleave', onPointerLeave)
		stopWatchingSelection()
	}
}
