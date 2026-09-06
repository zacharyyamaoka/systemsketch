/**
 * Press-and-hold a port in the communication lens to slide it to another edge.
 *
 * WHY the hold and not a plain drag: a plain drag on a dot already means "draw
 * a cable from here" everywhere in this app, and a component's port must keep
 * that. The existing answer to "move this port instead" is tldraw's own
 * `long_press` — the same gesture the Dataflow row reorder rides
 * (`portInteraction.ts`) — so there is one gesture to learn, not two.
 *
 * The GESTURE itself belongs to dnd-kit (`CommunicationPortDnd.tsx`); this
 * file is the model beneath it: what a wall is, where a pointer lands on one,
 * whether this port may move at all, and the write that lands it. Keeping
 * those pure is what lets a unit test exercise the rules without mounting a
 * drag, and what would let the gesture owner change again without touching
 * the meaning.
 *
 * Nothing is written until the release, so cables stay welded while the port
 * is in flight and the whole move lands as one undo step.
 */
import { atom, type Atom, type Editor, type TLShapeId } from 'tldraw'

import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockPortSide, type BlockShape } from '../blockModel'
import { blockLayoutLensFor } from './portLens'

export type CommunicationPortEdge = 'left' | 'right' | 'top' | 'bottom'

export interface CommunicationPortRef {
	shapeId: TLShapeId
	side: BlockPortSide
	portId: string
}

export interface CommunicationPortDragState extends CommunicationPortRef {
	/** Where the socket would land if released now. */
	edge: CommunicationPortEdge
	edgeT: number
}

const dragStates = new WeakMap<Editor, Atom<CommunicationPortDragState | null>>()

function dragAtom(editor: Editor): Atom<CommunicationPortDragState | null> {
	let value = dragStates.get(editor)
	if (!value) {
		value = atom<CommunicationPortDragState | null>('communication port drag', null)
		dragStates.set(editor, value)
	}
	return value
}

export function getCommunicationPortDrag(editor: Editor): CommunicationPortDragState | null {
	return dragAtom(editor).get()
}

export function setCommunicationPortDrag(
	editor: Editor,
	state: CommunicationPortDragState | null,
): void {
	dragAtom(editor).set(state)
}

export interface BlockEdgeHit {
	edge: CommunicationPortEdge
	edgeT: number
	distance: number
}

/**
 * The wall of a Block nearest a local point, and how far along it.
 *
 * Deliberately never returns null for an in-flight hold: once the gesture has
 * begun the answer is always an edge, and refusing far-from-the-wall pointer
 * positions would make the dot stick instead of follow.
 */
export function blockEdgeAt(
	size: { w: number; h: number },
	local: { x: number; y: number },
): BlockEdgeHit {
	const w = Math.max(1, size.w)
	const h = Math.max(1, size.h)
	const spanX = Math.min(Math.max(local.x, 0), w)
	const spanY = Math.min(Math.max(local.y, 0), h)
	const candidates: BlockEdgeHit[] = [
		{ edge: 'left', edgeT: spanY / h, distance: Math.hypot(local.x, local.y - spanY) },
		{ edge: 'right', edgeT: spanY / h, distance: Math.hypot(local.x - w, local.y - spanY) },
		{ edge: 'top', edgeT: spanX / w, distance: Math.hypot(local.x - spanX, local.y) },
		{ edge: 'bottom', edgeT: spanX / w, distance: Math.hypot(local.x - spanX, local.y - h) },
	]
	return candidates.reduce((a, b) => (b.distance < a.distance ? b : a))
}

/**
 * A port may be relocated only in the lens that actually draws four walls.
 *
 * In Dataflow the dots sit on two lanes, and dragging one to the top edge
 * there would write a position nothing reads — worse, the socket would jump
 * back the moment the lens changed.
 */
export function canMoveCommunicationPort(editor: Editor, ref: CommunicationPortRef): boolean {
	if (editor.getIsReadonly()) return false
	const shape = editor.getShape(ref.shapeId)
	if (!isBlockShape(shape) || shape.isLocked) return false
	if (blockLayoutLensFor(editor, ref.shapeId) !== 'communication') return false
	return shape.props[ref.side].some((port) => port.id === ref.portId && port.visible)
}

/** Write the landed placement. Pure enough that a test and the state share it. */
export function moveCommunicationPort(
	editor: Editor,
	ref: CommunicationPortRef,
	to: { edge: CommunicationPortEdge; edgeT: number },
): boolean {
	const shape = editor.getShape(ref.shapeId)
	if (!isBlockShape(shape)) return false
	const lane = shape.props[ref.side]
	if (!lane.some((port) => port.id === ref.portId)) return false
	const edgeT = Math.min(1, Math.max(0, to.edgeT))
	editor.markHistoryStoppingPoint('move communication port')
	editor.updateShape<BlockShape>({
		id: ref.shapeId,
		type: BLOCK_SHAPE_TYPE,
		props: {
			...shape.props,
			[ref.side]: lane.map((port) => (
				port.id === ref.portId ? { ...port, commEdge: to.edge, commEdgeT: edgeT } : port
			)),
		},
	})
	return true
}

