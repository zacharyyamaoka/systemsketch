import type { Editor, TLShapeId } from 'tldraw'
import { getBlockPortDotAtPoint } from './blockPorts'
import { cleanupStaleConnections } from './ConnectionBindingUtil'
import { PointingBlockPort, type PointingBlockPortInfo } from './PointingBlockPort'
import { BLOCK_PORT_DRAG_STATE_ID, DraggingBlockPort } from '../ports/portInteraction'
import { installConnectionProximity } from './connectionProximity'
import { keepConnectionsAtBottom } from './keepConnectionsAtBottom'

export const CONNECTION_START_STATES: readonly string[] = ['select.idle']

/** Add the donor's connection gesture states to tldraw's stock select tool. */
export function registerBlockConnectionToolStates(editor: Editor): boolean {
	const select = editor.getStateDescendant('select')
	if (!select) return false
	if (!editor.getStateDescendant('select.pointing_block_port')) select.addChild(PointingBlockPort)
	// Registered here because the reorder is only ever entered from the port
	// press this module installs; the two states share one gesture.
	if (!editor.getStateDescendant(`select.${BLOCK_PORT_DRAG_STATE_ID}`)) {
		select.addChild(DraggingBlockPort)
	}
	return true
}

/**
 * Claim a painted port (including its CSS halo) in the DOM capture phase,
 * before tldraw's selection overlay gets the same pointer event.
 */
export function installBlockConnectionInteraction(editor: Editor): () => void {
	if (!registerBlockConnectionToolStates(editor)) return () => undefined
	const container = editor.getContainer()

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return
		if (editor.getIsReadonly() || editor.getEditingShapeId() !== null) return
		if (!CONNECTION_START_STATES.includes(editor.getPath())) return
		const target = event.target
		if (!(target instanceof Element) || target.closest('.tl-canvas') === null) return
		// Do not turn an arbitrary nearby canvas / selection-overlay press into a
		// cable. The port's ::before halo is part of this DOM target, so the mature
		// forgiving hit area remains while stock edge and corner resize handles do
		// not get claimed merely because a semantic anchor is close by.
		const dot = target.closest<HTMLElement>('.systemsketch-block-canvas .Port')
		if (dot === null) return

		// Identity comes from the dot that was pressed. Nothing about direction
		// is decided here: a dot is a dot, and which face of it the cable leaves
		// from is the landing's decision.
		const pressedPortId = dot.dataset.blockPortId
		const pressedShapeId = dot.closest<HTMLElement>('[data-shape-id]')?.dataset.shapeId
		const info: PointingBlockPortInfo | null = pressedPortId && pressedShapeId
			? { shapeId: pressedShapeId as TLShapeId, portId: pressedPortId }
			: (() => {
				// Fallback for a press that landed on the halo of a dot whose own
				// element the browser did not report — keep the forgiving magnet.
				const pagePoint = editor.screenToPage({ x: event.clientX, y: event.clientY })
				const nearest = getBlockPortDotAtPoint(editor, pagePoint)
				return nearest ? { shapeId: nearest.shapeId, portId: nearest.port.id } : null
			})()
		if (!info) return
		// Let tldraw record the same pointer-down first, then replace its generic
		// canvas/shape pointing state before the browser can deliver a move. A
		// synchronous capture-phase transition is overwritten by tldraw's own
		// pointer handler later in this event.
		queueMicrotask(() => {
			// Selection foreground handles are painted and hit-tested by tldraw's
			// canvas overlay, so their DOM target is indistinguishable from an empty
			// point near a port. Let the stock resize gesture win after it has had a
			// chance to identify itself. This matters most in Simple view, whose
			// quiet side anchors intentionally share the edge midpoints.
			if (editor.getPath() === 'select.pointing_resize_handle') return
			editor.setCurrentTool('select.pointing_block_port', info)
		})
	}

	container.addEventListener('pointerdown', onPointerDown, { capture: true })
	return () => container.removeEventListener('pointerdown', onPointerDown, { capture: true })
}

/** Install gesture handling and prune invalid records already in the document. */
export function installBlockConnections(editor: Editor): () => void {
	cleanupStaleConnections(editor)
	keepConnectionsAtBottom(editor)
	const stopInteraction = installBlockConnectionInteraction(editor)
	const stopProximity = installConnectionProximity(editor)
	return () => {
		stopProximity()
		stopInteraction()
	}
}
