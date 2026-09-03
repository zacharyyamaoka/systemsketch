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
import {
	getBlockConnectionPortPagePoint,
	getLiveBlockPorts,
} from './blockPorts'
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
		this.info = info?.shapeId ? info : null
	}

	override onExit(): void {
		clearPortDragState(this.editor)
	}

	override onPointerMove(info: TLPointerEventInfo): void {
		if (!this.info || !this.editor.inputs.getIsDragging()) return

		// A press on a dot always starts a NEW cable — outputs fan out and inputs
		// fan in, so a wired dot is not a reason to move what is there. An
		// existing cable is moved the way any tldraw shape is edited: select it
		// and drag its terminal handle, which the capture listener leaves to
		// tldraw's own `pointing_handle`.

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

	// The offered Block goes where the cable is already pointing. A Block's
	// ports face left and right, so the old x-only rule was the whole truth for
	// them; a region's header port faces DOWN, and offering its consumer off to
	// the right put the picker on top of the header it just left.
	const port = getLiveBlockPorts(editor, pressed.shapeId)
		.find((candidate) => candidate.id === pressed.portId)
	const direction = blockPickerDirection(polarity)
	const target = port?.elbowSide === 'bottom'
		? new Vec(origin.x, origin.y + BLOCK_PICKER_SPACING_PX)
		: port?.elbowSide === 'top'
			? new Vec(origin.x, origin.y - BLOCK_PICKER_SPACING_PX)
			: new Vec(origin.x + direction * BLOCK_PICKER_SPACING_PX, origin.y)
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
