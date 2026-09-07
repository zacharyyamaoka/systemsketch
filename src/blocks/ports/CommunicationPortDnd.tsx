/**
 * dnd-kit owns the gesture that moves a socket around a card's four walls.
 *
 * WHY a second drag system exists here — this is the port-scoped sibling of
 * the Behavior Tree's exception, and it is Zach's explicit ask (2026-09-06):
 * "Please use drag and drop kit to implement this… basically we model each
 * edge of the board as a kanban column/row and each port as a kanban card."
 * The fork is recorded in docs/peps/0013-two-scoped-canvas-drag-owners.md.
 * Still owed as follow-up, and deliberately NOT done there: this file and
 * `behaviorTree/treeDndDrag.tsx` share a pattern on purpose and should end up
 * sharing one host.
 *
 * THE BOUNDARY, precisely — dnd-kit may own a gesture only when ALL hold:
 *   - the press landed on a real port dot of a Block;
 *   - the region is being read through the COMMUNICATION lens, which is the
 *     only lens with four walls to move between;
 *   - the press did not cross tldraw's drag threshold before its own
 *     `long_press` fired (see the CORRECTION below: that is NOT the same as
 *     "did not move").
 * Everything else — a plain drag from a dot (still a cable), any press in
 * Dataflow, any press on anything else — is byte-identical native tldraw with
 * no dnd-kit listener anywhere in its event path.
 *
 * WHY the handoff is simpler than the Behavior Tree's: that one had to PREEMPT
 * a translate tldraw would otherwise have started, racing a 4px threshold.
 * Here the claim signal is `long_press`, so no cancel-before-threshold dance is
 * needed.
 *
 * CORRECTION, and the reason this file is not the whole story: `long_press`
 * does NOT mean "has not moved". tldraw clears its long-press timer only once a
 * press crosses its own drag threshold (`dragDistanceSquared: 16`, i.e. 4px;
 * `Editor.ts` clears `_longPressTimeout` inside that branch alone — not in
 * `cancel()`). A press that moves 1-3px and dwells 500ms therefore fires
 * `long_press` AND satisfies the tree lane's preempt distance, so both can
 * claim one press. Nothing separates them yet: see the KNOWN GAP in
 * `tests/test_stock_boundary.py`, which documents all three gesture owners and
 * both orderings. The property a fix must establish — select-tool state
 * ownership re-checked at CLAIM time, never timing — is recorded in
 * docs/peps/0013-two-scoped-canvas-drag-owners.md.
 *
 * WHY `SortableContext`/`useSortable` are NOT mounted, despite this being a
 * Kanban: dnd-kit's sortable layer measures DOM rects in SCREEN space, once
 * per drag. The things being sorted are ports on a tldraw shape whose screen
 * position changes under camera pan/zoom mid-drag, so a DOM mirror of them
 * would be a second, staler copy of the layout. dnd-kit owns the pointer; the
 * geometry stays in page space (`blockEdgeAt`), where the layout's truth lives.
 */
import { useCallback, useEffect, useRef } from 'react'
import {
	DndContext,
	PointerSensor,
	useDraggable,
	useSensor,
	useSensors,
	type DragMoveEvent,
} from '@dnd-kit/core'
import { useEditor, type Editor } from 'tldraw'

import { isBlockShape } from '../blockModel'
import {
	blockEdgeAt,
	canMoveCommunicationPort,
	moveCommunicationPort,
	setCommunicationPortDrag,
	getCommunicationPortDrag,
	type CommunicationPortRef,
} from './communicationPortDrag'

const PORT_DND_PROXY_ID = 'communication-port-drag-proxy'

interface PortDndBridge {
	begin(ref: CommunicationPortRef): boolean
}

const bridges = new WeakMap<Editor, PortDndBridge>()

/**
 * The last real pointer-down seen on the canvas.
 *
 * dnd-kit's activator needs genuine client coordinates and a pointer id, and
 * tldraw's `TLPointerEventInfo` carries neither — its `point` is already
 * projected into screen space. A capture-phase listener is the cheapest honest
 * source, and it is the same one the Behavior Tree's claim path reads.
 */
const lastPointerDown = new WeakMap<Editor, PointerEvent>()

/**
 * Hand a claimed long-press to dnd-kit. Returns false when nothing is mounted
 * to take it, so the caller falls back to native behaviour rather than
 * swallowing the gesture.
 */
export function beginCommunicationPortDnd(
	editor: Editor,
	ref: CommunicationPortRef,
): boolean {
	if (!canMoveCommunicationPort(editor, ref)) return false
	return bridges.get(editor)?.begin(ref) ?? false
}

/** Track the pointer in PAGE space and preview where the socket would land. */
function trackSession(editor: Editor, clientX: number, clientY: number): void {
	const drag = getCommunicationPortDrag(editor)
	if (!drag) return
	const shape = editor.getShape(drag.shapeId)
	if (!isBlockShape(shape)) return
	const page = editor.screenToPage({ x: clientX, y: clientY })
	const local = editor.getPointInShapeSpace(shape, page)
	const hit = blockEdgeAt({ w: shape.props.w, h: shape.props.h }, local)
	setCommunicationPortDrag(editor, { ...drag, edge: hit.edge, edgeT: hit.edgeT })
}

export function CommunicationPortDndHost() {
	const editor = useEditor()
	const sensors = useSensors(useSensor(PointerSensor))
	useEffect(() => {
		const container = editor.getContainer()
		const remember = (event: PointerEvent) => lastPointerDown.set(editor, event)
		container.addEventListener('pointerdown', remember, { capture: true })
		return () => container.removeEventListener('pointerdown', remember, { capture: true })
	}, [editor])
	const onDragMove = useCallback(
		(event: DragMoveEvent) => {
			const activator = event.activatorEvent as PointerEvent
			trackSession(
				editor,
				activator.clientX + event.delta.x,
				activator.clientY + event.delta.y,
			)
		},
		[editor],
	)
	const onDragEnd = useCallback(() => {
		const drag = getCommunicationPortDrag(editor)
		if (drag) {
			moveCommunicationPort(
				editor,
				{ shapeId: drag.shapeId, side: drag.side, portId: drag.portId },
				{ edge: drag.edge, edgeT: drag.edgeT },
			)
		}
		setCommunicationPortDrag(editor, null)
		editor.setCursor({ type: 'default', rotation: 0 })
	}, [editor])
	const onDragCancel = useCallback(() => {
		// Nothing was written during the drag, so a cancel is simply forgetting.
		setCommunicationPortDrag(editor, null)
		editor.setCursor({ type: 'default', rotation: 0 })
	}, [editor])

	return (
		<DndContext
			sensors={sensors}
			autoScroll={false}
			onDragMove={onDragMove}
			onDragEnd={onDragEnd}
			onDragCancel={onDragCancel}
		>
			<PortDndProxyHandle editor={editor} />
		</DndContext>
	)
}

function PortDndProxyHandle({ editor }: { editor: Editor }) {
	const { listeners, setNodeRef } = useDraggable({ id: PORT_DND_PROXY_ID })
	const elementRef = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		bridges.set(editor, {
			begin(ref) {
				const element = elementRef.current
				const event = lastPointerDown.get(editor)
				if (!element || !event) return false
				const shape = editor.getShape(ref.shapeId)
				if (!isBlockShape(shape)) return false
				const local = editor.getPointInShapeSpace(
					shape,
					editor.screenToPage({ x: event.clientX, y: event.clientY }),
				)
				const hit = blockEdgeAt({ w: shape.props.w, h: shape.props.h }, local)
				setCommunicationPortDrag(editor, { ...ref, edge: hit.edge, edgeT: hit.edgeT })
				editor.setCursor({ type: 'grabbing', rotation: 0 })
				const clone = new PointerEvent('pointerdown', {
					bubbles: true,
					cancelable: true,
					composed: true,
					clientX: event.clientX,
					clientY: event.clientY,
					button: 0,
					buttons: 1,
					pointerId: event.pointerId,
					pointerType: event.pointerType,
					isPrimary: true,
				})
				// The clone exists for dnd-kit's activator alone. It bubbles through
				// the canvas on its way out, and this is what keeps tldraw from
				// reading it as a second, mid-gesture pointer down.
				editor.markEventAsHandled(clone)
				element.dispatchEvent(clone)
				return true
			},
		})
		return () => {
			bridges.delete(editor)
		}
	}, [editor])
	return (
		<div
			ref={(node) => {
				elementRef.current = node
				setNodeRef(node)
			}}
			{...listeners}
			data-testid="communication-port-dnd-proxy"
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				width: 1,
				height: 1,
				opacity: 0,
				pointerEvents: 'none',
			}}
		/>
	)
}
