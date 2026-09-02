import type { Editor, TLShapeId, VecLike } from 'tldraw'
import { getBlockPortDotAtPoint } from './blockPorts'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { cleanupStaleConnections } from './ConnectionBindingUtil'
import { PointingBlockPort, type PointingBlockPortInfo } from './PointingBlockPort'
import { BLOCK_PORT_DRAG_STATE_ID, DraggingBlockPort } from '../ports/portInteraction'
import { installConnectionProximity } from './connectionProximity'
import { keepConnectionsAtBottom } from './keepConnectionsAtBottom'

/**
 * The states a press on a port turns into a cable.
 *
 * `arrow.idle` is here because A and a port mean the same thing they mean
 * apart: draw the connector you have chosen. On empty canvas the arrow tool
 * draws tldraw's arrow; on a port it draws a data edge — and since the arrow
 * preset also sets the edge routing (`toolbarIntegration.applyArrowPreset`),
 * the two come out the same shape. The port stylesheet has always lit its dots
 * under `[data-state^='arrow']`; this is the half of that seam that acts.
 */
export const CONNECTION_START_STATES: readonly string[] = ['select.idle', 'arrow.idle']

/** True once the arrow tool has taken a press we are about to take back. */
const isPendingArrow = (path: string): boolean => path.startsWith('arrow.')

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

/** Is a selected cable offering a terminal handle under this page point? */
function pressIsOnConnectionHandle(editor: Editor, pagePoint: VecLike): boolean {
	const overlay = editor.overlays.getOverlayAtPoint(pagePoint, editor.getHitTestMargin())
	if (!overlay || overlay.type !== 'shape_handle') return false
	const shapeId = (overlay.props as { shapeId?: TLShapeId }).shapeId
	return shapeId !== undefined && editor.getShape(shapeId)?.type === CONNECTION_SHAPE_TYPE
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

		// A selected cable's terminal handle sits exactly on the dot, and a press
		// there MOVES that cable — the only way an existing cable is re-routed.
		// Asked the same way tldraw's select tool asks, and asked HERE rather than
		// after the fact: measured on 2026-09-01, the microtask below still saw
		// `select.idle` for such a press, so waiting to see what tldraw decides is
		// too late. Only a cable's handle yields. A selected Block's own outline is
		// an overlay too, and a dot on that outline is still a dot.
		const pagePoint = editor.screenToPage({ x: event.clientX, y: event.clientY })
		if (pressIsOnConnectionHandle(editor, pagePoint)) return

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
				const nearest = getBlockPortDotAtPoint(editor, pagePoint)
				return nearest ? { shapeId: nearest.shapeId, portId: nearest.port.id } : null
			})()
		if (!info) return
		// Let tldraw record the same pointer-down first, then replace its generic
		// canvas/shape pointing state before the browser can deliver a move. A
		// synchronous capture-phase transition is overwritten by tldraw's own
		// pointer handler later in this event.
		queueMicrotask(() => {
			// Belt and braces for a stock gesture that identified itself before this
			// ran: resize handles matter most in Simple view, whose quiet side
			// anchors share the edge midpoints.
			const path = editor.getPath()
			if (path === 'select.pointing_resize_handle' || path === 'select.pointing_handle') return
			// `arrow.pointing` creates its arrow on entry, and a plain tool switch
			// runs `onExit` without dispatching cancel — which would strand a
			// zero-length arrow under the port for the rest of the session. Cancel
			// the gesture properly first: tldraw bails to its own creation mark, so
			// the press leaves the document exactly as it found it.
			if (isPendingArrow(path)) editor.cancel()
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
