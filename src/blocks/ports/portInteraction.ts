/**
 * The two in-window port gestures that are not a click: press-and-hold to
 * reorder, and right-click to name a port as the context menu's subject.
 *
 * Both ride seams tldraw already owns. The hold is tldraw's own `long_press`,
 * delivered to whichever state is active — which, on a port, is the connection
 * tool's `pointing_block_port` — so "held long enough to mean something else"
 * is decided by the same `longPressDurationMs` as every other tldraw gesture
 * rather than by a private timer. The reorder itself is a `select` child state,
 * exactly like the cable gesture beside it, so cancel / interrupt / tool
 * switching all behave without special cases.
 *
 * The drag deliberately writes nothing until it ends. Cables stay where they
 * are while a port is in flight, and the whole reorder lands as one undo step.
 */
import {
	StateNode,
	atom,
	type Atom,
	type Editor,
	type TLCancelEventInfo,
	type TLCompleteEventInfo,
	type TLEventInfo,
	type TLInterruptEventInfo,
	type TLShapeId,
} from 'tldraw'

import { isBlockShape, type BlockPortSide } from '../blockModel'
import { moveBlockPortToIndex } from '../commands/blockCommands'
import { getBlockPortDotAtPoint } from '../connections/blockPorts'
import { blockPortDropTarget } from './portAffordances'

export const BLOCK_PORT_DRAG_STATE_ID = 'dragging_block_port'

/** Identity of one port on one Block. The lane is part of that identity. */
export interface BlockPortRef {
	shapeId: TLShapeId
	side: BlockPortSide
	portId: string
}

export interface BlockPortDragState extends BlockPortRef {
	/** Pointer position in Block-local coordinates; the held row follows this. */
	pointerY: number
	/** Where the drop rule is painted, in Block-local coordinates. */
	indicatorY: number
	/** Insertion index into `props[side]` as it stands before the drop. */
	insertIndex: number
}

function atomFor<T>(
	store: WeakMap<Editor, Atom<T>>,
	editor: Editor,
	name: string,
	initial: T,
): Atom<T> {
	let value = store.get(editor)
	if (!value) {
		value = atom<T>(name, initial)
		store.set(editor, value)
	}
	return value
}

const dragStates = new WeakMap<Editor, Atom<BlockPortDragState | null>>()
const menuTargets = new WeakMap<Editor, Atom<BlockPortRef | null>>()

export function getBlockPortDrag(editor: Editor): BlockPortDragState | null {
	return atomFor(dragStates, editor, 'block port drag', null).get()
}

export function setBlockPortDrag(editor: Editor, state: BlockPortDragState | null): void {
	atomFor(dragStates, editor, 'block port drag', null).set(state)
}

/** The port a right-click landed on, or `null` when it landed anywhere else. */
export function getBlockPortMenuTarget(editor: Editor): BlockPortRef | null {
	return atomFor(menuTargets, editor, 'block port menu target', null).get()
}

export function setBlockPortMenuTarget(editor: Editor, target: BlockPortRef | null): void {
	atomFor(menuTargets, editor, 'block port menu target', null).set(target)
}

/** A port can be dragged out of order only where the lane is actually drawn. */
export function canReorderBlockPort(editor: Editor, ref: BlockPortRef): boolean {
	if (editor.getIsReadonly()) return false
	const shape = editor.getShape(ref.shapeId)
	if (!isBlockShape(shape) || shape.isLocked) return false
	if (shape.props.view === 'simple') return false
	return shape.props[ref.side].some((port) => port.id === ref.portId && port.visible)
}

/**
 * Reorder one lane by dragging a held port. Entered from the connection tool's
 * `pointing_block_port` on tldraw's `long_press`, which fires only while the
 * pointer has stayed put — a press that moves first is still a cable.
 */
export class DraggingBlockPort extends StateNode {
	static override id = BLOCK_PORT_DRAG_STATE_ID
	private ref: BlockPortRef | null = null

	override onEnter(info: BlockPortRef): void {
		this.ref = info?.shapeId && canReorderBlockPort(this.editor, info) ? info : null
		if (!this.ref) {
			this.parent.transition('idle')
			return
		}
		this.editor.setCursor({ type: 'grabbing', rotation: 0 })
		this.track()
	}

	override onExit(): void {
		this.editor.setCursor({ type: 'default', rotation: 0 })
		setBlockPortDrag(this.editor, null)
		this.ref = null
	}

	private track(): void {
		const ref = this.ref
		if (!ref) return
		const shape = this.editor.getShape(ref.shapeId)
		if (!isBlockShape(shape)) {
			this.parent.transition('idle')
			return
		}
		const local = this.editor.getPointInShapeSpace(
			shape,
			this.editor.inputs.getCurrentPagePoint(),
		)
		const target = blockPortDropTarget(shape.props, ref.side, local.y)
		setBlockPortDrag(this.editor, { ...ref, pointerY: local.y, ...target })
	}

	override onPointerMove(): void {
		this.track()
	}

	override onPointerUp(): void {
		this.commit()
	}

	override onComplete(_info: TLCompleteEventInfo): void {
		this.commit()
	}

	override onCancel(_info: TLCancelEventInfo): void {
		this.parent.transition('idle')
	}

	override onInterrupt(_info: TLInterruptEventInfo): void {
		this.parent.transition('idle')
	}

	private commit(): void {
		const ref = this.ref
		const drag = getBlockPortDrag(this.editor)
		if (ref && drag) {
			moveBlockPortToIndex(this.editor, ref.shapeId, ref.side, ref.portId, drag.insertIndex)
		}
		this.parent.transition('idle')
	}
}

/**
 * Record which port — if any — a right-click was aimed at, before the menu that
 * reads it is mounted.
 *
 * tldraw's own `right_click` is the seam, not the DOM `contextmenu` event. It
 * is dispatched from the press, while the browser only raises `contextmenu` on
 * the release, and by then the painted dot may no longer be the topmost element
 * under the pointer — which is exactly how a right-click on a port ends up
 * reported against the canvas. Resolving from the pointer's page position
 * instead of the DOM target sidesteps that entirely, and reuses the same
 * magnet radius that decides which port a cable starts from.
 *
 * Every right-click writes this, including the ones that miss, so a dismissed
 * port menu can never leave its commands attached to the next click elsewhere.
 */
export function installBlockPortMenuTarget(editor: Editor): () => void {
	const onEvent = (info: TLEventInfo) => {
		if (info.type !== 'pointer') return
		if (info.name === 'pointer_down' && info.button === 0) {
			setBlockPortMenuTarget(editor, null)
			return
		}
		if (info.name !== 'right_click') return
		if (editor.getIsReadonly()) {
			setBlockPortMenuTarget(editor, null)
			return
		}
		const hit = getBlockPortDotAtPoint(editor, editor.inputs.getCurrentPagePoint())
		setBlockPortMenuTarget(editor, hit
			? {
				shapeId: hit.shapeId,
				side: hit.port.side === 'input' ? 'inputs' : 'outputs',
				portId: hit.port.id,
			}
			: null)
	}

	editor.on('event', onEvent)
	return () => {
		setBlockPortMenuTarget(editor, null)
		editor.off('event', onEvent)
	}
}
