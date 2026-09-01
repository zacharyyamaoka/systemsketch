import {
	StateNode,
	Vec,
	createShapeId,
	type TLCancelEventInfo,
	type TLHandle,
	type TLInterruptEventInfo,
	type TLPointerEventInfo,
	type Editor,
	type TLShapeId,
	type VecLike,
} from 'tldraw'
import { isBlockShape } from '../blockModel'
import {
	getBlockConnectionPortPagePoint,
	getBlockPortConnections,
	getLiveBlockPorts,
} from './blockPorts'
import { reconnectPageUnits } from './connectionHit'
import {
	BLOCK_PORT_DRAG_STATE_ID,
	canReorderBlockPort,
	type BlockPortRef,
} from '../ports/portInteraction'
import { clearPortDragState } from '../ports/portState'
import { createOrUpdateConnectionBinding } from './ConnectionBindingUtil'
import { offerBlockForLooseTerminal, type ConnectionShape } from './ConnectionShapeUtil'
import {
	CONNECTION_SHAPE_TYPE,
	oppositeConnectionTerminal,
	type ConnectionTerminal,
} from './connectionModel'

/** How far from the pressed port a picker-spawned Block is offered. */
export const BLOCK_PICKER_SPACING_PX = 120

export interface PointingBlockPortInfo {
	shapeId: TLShapeId
	portId: string
	terminal: ConnectionTerminal
}

interface CreatedConnection {
	connectionId: TLShapeId
	draggingTerminal: ConnectionTerminal
	markId: string
	shape: ConnectionShape
	handle: TLHandle
}

function createConnectionFromPort(
	editor: Editor,
	origin: PointingBlockPortInfo,
	shapeOrigin: VecLike,
): CreatedConnection | null {
	const markId = editor.markHistoryStoppingPoint('creating_block_connection')
	const connectionId = createShapeId()
	editor.createShape({
		id: connectionId,
		type: CONNECTION_SHAPE_TYPE,
		x: shapeOrigin.x,
		y: shapeOrigin.y,
		props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
	})

	if (!createOrUpdateConnectionBinding(editor, connectionId, origin.shapeId, {
		portId: origin.portId,
		terminal: origin.terminal,
	})) {
		editor.bailToMark(markId)
		return null
	}

	const shape = editor.getShape<ConnectionShape>(connectionId)
	const draggingTerminal = oppositeConnectionTerminal(origin.terminal)
	const handle = editor.getShapeHandles(connectionId)?.find((candidate) => (
		candidate.id === draggingTerminal
	))
	if (!shape || !handle) {
		editor.bailToMark(markId)
		return null
	}

	return { connectionId, draggingTerminal, markId, shape, handle }
}

/**
 * Give an existing wire precedence over the port dot the press happened to land on.
 *
 * At 1× zoom the painted `.Port` element covers the whole of tldraw's own handle
 * radius around a cable's end, so a press aimed at the cable never reaches the
 * handle — the dot takes it. Usually harmless, because a single-connection port
 * re-routes its existing cable below. But where sibling ports overlap, the dot on
 * top can be a neighbour with no cable, and the same gesture then starts a NEW
 * cable instead of moving the one you were aiming at.
 *
 * So: if a port that already carries a cable sits within the profile's reconnect
 * radius, that port wins the press. A press on a port that is already wired is
 * left alone — it is already the answer.
 */
function preferWiredPortNearby(
	editor: Editor,
	info: PointingBlockPortInfo,
): PointingBlockPortInfo {
	const pressedIsWired = getBlockPortConnections(editor, info.shapeId)
		.some((connection) => connection.ownPortId === info.portId)
	if (pressedIsWired) return info

	const radius = reconnectPageUnits(editor.getZoomLevel())
	if (radius <= 0) return info

	const point = editor.inputs.getCurrentPagePoint()
	let best: PointingBlockPortInfo | null = null
	let bestDistance = radius

	for (const shape of editor.getCurrentPageShapes()) {
		if (!isBlockShape(shape) || editor.isShapeHidden(shape)) continue
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds || !bounds.containsPoint(point, radius)) continue

		const wired = new Set(
			getBlockPortConnections(editor, shape.id).map((connection) => connection.ownPortId),
		)
		if (wired.size === 0) continue

		const transform = editor.getShapePageTransform(shape)
		for (const port of getLiveBlockPorts(editor, shape.id)) {
			if (port.hidden || !wired.has(port.id)) continue
			const distance = Vec.Dist(point, transform.applyToPoint(port))
			if (distance > bestDistance) continue
			bestDistance = distance
			best = { shapeId: shape.id, portId: port.id, terminal: port.terminal }
		}
	}

	return best ?? info
}

/**
 * Which way a picker-spawned Block sits relative to the port that asked for it.
 *
 * A `start` terminal is a source, so its consumer goes to the right; an `end`
 * terminal is a sink, so its producer goes to the left. That one rule also
 * places an inner face's Block *inside* the boundary, because an inner face
 * carries the flipped terminal.
 */
export function blockPickerDirection(terminal: ConnectionTerminal): 1 | -1 {
	return terminal === 'start' ? 1 : -1
}

/**
 * Select-tool child entered by the capture listener before resize handles are
 * hit-tested. A drag hands off to tldraw's stock `select.dragging_handle`; a tap
 * offers a Block for the far end.
 *
 * There is deliberately no armed "cable follows the pointer" state between the
 * two. A state that outlives its gesture has to enumerate every way out of
 * itself, and `editor.setCurrentTool` is a plain root transition that runs
 * `onExit` without dispatching cancel, complete or interrupt — so a tool
 * shortcut stranded a half-bound cable for the rest of the session. Neither
 * tldraw starter kit has such a state, and the click they use it for is the one
 * the picker needs.
 */
export class PointingBlockPort extends StateNode {
	static override id = 'pointing_block_port'
	info: PointingBlockPortInfo | null = null

	override onEnter(info: PointingBlockPortInfo): void {
		this.info = info?.shapeId ? preferWiredPortNearby(this.editor, info) : null
	}

	override onExit(): void {
		clearPortDragState(this.editor)
	}

	override onPointerMove(info: TLPointerEventInfo): void {
		if (!this.info || !this.editor.inputs.getIsDragging()) return

		// An input holds one cable. Dragging from a wired input moves that cable
		// rather than starting a second one nobody could tell apart.
		if (this.info.terminal === 'end') {
			const existing = getBlockPortConnections(this.editor, this.info.shapeId)
				.find((connection) => connection.ownPortId === this.info?.portId)
			if (existing) {
				const shape = this.editor.getShape<ConnectionShape>(existing.connectionId)
				const handle = this.editor.getShapeHandles(existing.connectionId)
					?.find((candidate) => candidate.id === this.info?.terminal)
				if (shape && handle) {
					this.parent.transition('dragging_handle', {
						...info,
						target: 'handle',
						shape,
						handle,
					})
					return
				}
			}
		}

		// Stock dragging_handle measures movement from inputs.originPagePoint (the
		// press), not from the later drag-threshold event. Create the cable at the
		// pressed port so its free handle begins with exactly zero offset.
		const origin = getBlockConnectionPortPagePoint(
			this.editor,
			this.info.shapeId,
			this.info.portId,
			this.info.terminal,
		)
		const created = origin
			? createConnectionFromPort(this.editor, this.info, origin)
			: null
		if (!created) {
			this.parent.transition('idle', info)
			return
		}

		this.parent.transition('dragging_handle', {
			...info,
			target: 'handle',
			shape: created.shape,
			handle: created.handle,
			creatingMarkId: created.markId,
			isCreating: true,
		})
	}

	/**
	 * Held still on a port: the gesture is a reorder, not a cable.
	 *
	 * tldraw cancels its own long-press timer the moment a press crosses the drag
	 * threshold, so this can only fire for a press that stayed put — which is
	 * exactly the gesture a cable drag is not.
	 */
	override onLongPress(info: TLPointerEventInfo): void {
		if (!this.info) return
		if (!this.editor.getStateDescendant(`select.${BLOCK_PORT_DRAG_STATE_ID}`)) return
		const ref: BlockPortRef = {
			shapeId: this.info.shapeId,
			side: this.info.terminal === 'start' ? 'outputs' : 'inputs',
			portId: this.info.portId,
		}
		if (!canReorderBlockPort(this.editor, ref)) return
		this.parent.transition(BLOCK_PORT_DRAG_STATE_ID, { ...info, ...ref })
	}

	/** A tap asks what to connect to, rather than arming a cable. */
	override onPointerUp(info: TLPointerEventInfo): void {
		const pressed = this.info
		this.parent.transition('idle', info)
		if (!pressed) return
		offerBlockFromPort(this.editor, pressed)
	}

	override onCancel(info: TLCancelEventInfo): void {
		this.parent.transition('idle', info)
	}

	override onInterrupt(info: TLInterruptEventInfo): void {
		this.parent.transition('idle', info)
	}
}

/**
 * Tap a port: stretch a cable to open space and offer a Block for its far end.
 *
 * The cable is real from the first frame, so the picker has something to anchor
 * to and a decline has something concrete to remove.
 */
export function offerBlockFromPort(editor: Editor, pressed: PointingBlockPortInfo): void {
	const origin = getBlockConnectionPortPagePoint(
		editor,
		pressed.shapeId,
		pressed.portId,
		pressed.terminal,
	)
	if (!origin) return

	const created = createConnectionFromPort(editor, pressed, origin)
	if (!created) return

	const direction = blockPickerDirection(pressed.terminal)
	const target = new Vec(origin.x + direction * BLOCK_PICKER_SPACING_PX, origin.y)
	const shape = editor.getShape<ConnectionShape>(created.connectionId)
	if (shape) {
		const local = editor.getPointInShapeSpace(shape, target)
		editor.updateShape({
			id: created.connectionId,
			type: CONNECTION_SHAPE_TYPE,
			props: { [created.draggingTerminal]: { x: local.x, y: local.y } },
		})
	}

	offerBlockForLooseTerminal(editor, created.connectionId, created.draggingTerminal)
}
