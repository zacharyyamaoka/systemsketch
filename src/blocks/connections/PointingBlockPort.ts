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
import {
	offerBlockForLooseTerminal,
	outerScopeOf,
	type ConnectionShape,
} from './ConnectionShapeUtil'
import {
	CONNECTION_SHAPE_TYPE,
	portPolarity,
	type ConnectionTerminal,
	type PortDot,
	type PortPolarity,
} from './connectionModel'

/** How far from the pressed port a picker-spawned Block is offered. */
export const BLOCK_PICKER_SPACING_PX = 120

/**
 * What a press on a dot knows: the dot. Not a face, not a direction.
 *
 * Which face the cable leaves from — and so which way it points — is decided
 * by where it lands, in `ConnectionShapeUtil.dragTerminal`. A press that
 * committed to a face here could only ever wire one side of a boundary, which
 * is the bug this replaces.
 */
export type PointingBlockPortInfo = PortDot

interface CreatedConnection {
	connectionId: TLShapeId
	draggingTerminal: ConnectionTerminal
	markId: string
	shape: ConnectionShape
	handle: TLHandle
}

/** The handle a new cable holds still at the pressed dot; the other one is dragged. */
const ANCHORED_TERMINAL: ConnectionTerminal = 'start'
const DRAGGED_TERMINAL: ConnectionTerminal = 'end'

/**
 * Weld a new cable's `start` to the pressed dot's OUTER face and leave `end`
 * loose. The face is provisional — the drag re-faces it as the pointer moves
 * between scopes — and the terminal names carry no direction of their own.
 */
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
		face: 'outer',
		terminal: ANCHORED_TERMINAL,
	})) {
		editor.bailToMark(markId)
		return null
	}

	const shape = editor.getShape<ConnectionShape>(connectionId)
	const handle = editor.getShapeHandles(connectionId)?.find((candidate) => (
		candidate.id === DRAGGED_TERMINAL
	))
	if (!shape || !handle) {
		editor.bailToMark(markId)
		return null
	}

	return { connectionId, draggingTerminal: DRAGGED_TERMINAL, markId, shape, handle }
}

/** The polarity of a dot seen from outside its Block — the kit's reading. */
function outerPolarity(editor: Editor, dot: PortDot): PortPolarity | null {
	const port = getLiveBlockPorts(editor, dot.shapeId).find((candidate) => candidate.id === dot.portId)
	return port ? portPolarity(port.side, 'outer') : null
}

/**
 * The one cable a press on this dot would re-route, if any.
 *
 * A sink takes one cable, so pressing a wired sink means "move that wire". The
 * rule reads the OUTER face only — the kit's rule, unchanged: a press on an
 * Expanded Block's outlet starts a new outward cable even while a child feeds
 * the outlet from inside, because that internal wire is reached by dragging
 * its own handle, and taking the press for it would make the outward gesture
 * impossible from that dot.
 */
function reroutableConnection(editor: Editor, dot: PortDot) {
	if (outerPolarity(editor, dot) !== 'sink') return null
	return getBlockPortConnections(editor, dot.shapeId).find((connection) => (
		connection.ownPortId === dot.portId && connection.ownFace === 'outer'
	)) ?? null
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
			best = { shapeId: shape.id, portId: port.id }
		}
	}

	return best ?? info
}

/**
 * Which way a picker-spawned Block sits relative to the port that asked for it.
 *
 * A source's consumer goes to the right; a sink's producer goes to the left.
 */
export function blockPickerDirection(polarity: PortPolarity): 1 | -1 {
	return polarity === 'source' ? 1 : -1
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

		// A sink holds one cable. Dragging from a wired sink moves that cable
		// rather than starting a second one nobody could tell apart.
		const existing = reroutableConnection(this.editor, this.info)
		if (existing) {
			const shape = this.editor.getShape<ConnectionShape>(existing.connectionId)
			const handle = this.editor.getShapeHandles(existing.connectionId)
				?.find((candidate) => candidate.id === existing.terminal)
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

		// Stock dragging_handle measures movement from inputs.originPagePoint (the
		// press), not from the later drag-threshold event. Create the cable at the
		// pressed port so its free handle begins with exactly zero offset.
		const origin = getBlockConnectionPortPagePoint(
			this.editor,
			this.info.shapeId,
			this.info.portId,
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
		const port = getLiveBlockPorts(this.editor, this.info.shapeId)
			.find((candidate) => candidate.id === this.info?.portId)
		if (!port) return
		const ref: BlockPortRef = {
			shapeId: this.info.shapeId,
			side: port.side === 'output' ? 'outputs' : 'inputs',
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
 * to and a decline has something concrete to remove. A tap has no landing to
 * read a scope from, so it reads the dot from OUTSIDE — a consumer to the right
 * of an output, a producer to the left of an input — in the Block's own scope.
 */
export function offerBlockFromPort(editor: Editor, pressed: PointingBlockPortInfo): void {
	const origin = getBlockConnectionPortPagePoint(editor, pressed.shapeId, pressed.portId)
	const polarity = outerPolarity(editor, pressed)
	if (!origin || !polarity) return

	const created = createConnectionFromPort(editor, pressed, origin)
	if (!created) return

	const direction = blockPickerDirection(polarity)
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

	if (!offerBlockForLooseTerminal(
		editor,
		created.connectionId,
		created.draggingTerminal,
		outerScopeOf(editor, pressed.shapeId),
	)) {
		editor.bailToMark(created.markId)
	}
}
