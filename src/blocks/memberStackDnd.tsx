/**
 * The stack lane: dnd-kit owns the gesture that reorders a member inside a
 * stacked Block, so the members behave like cards in a Kanban column — the
 * dragged card rides the pointer, its siblings open the slot it would take,
 * release commits, Escape rolls back.
 *
 * WHY a third canvas drag owner exists — Zach's call (2026-09-09): "for D1,
 * yes in stack mode I want them to behave more like cards in a kanban row,
 * implementing using dnd kit." It is the same exception PEP 0007 granted the
 * Behavior Tree, for the same reason: a Block in `bodyLayout: 'stack'` has
 * stopped being a whiteboard frame and become a reactive layout, so the
 * layout's own gesture engine takes the drag. A Free Block is byte-identical
 * native tldraw, with zero dnd-kit listeners in its event path.
 *
 * THE BOUNDARY, precisely — dnd-kit may own a gesture only when ALL hold:
 *   - the press landed on a stack MEMBER: a shape `isStackMemberShape`
 *     admits, whose parent `isStackBlock` admits (Expanded, unfolded,
 *     `bodyLayout: 'stack'`), neither locked;
 *   - the pointer-down is a plain primary press (button 0, no modifiers,
 *     not a pan) that tldraw's OWN hit test resolves to that member — an
 *     annotation drawn over it wins the point exactly as it would natively;
 *   - the gesture would have translated exactly that one member (multi-select
 *     and selected-ancestor drags stay native at the press, and are caught by
 *     the interlock only once tldraw itself decides to translate the sole
 *     selected member).
 *
 * THE PROPERTY PEP 0013 asks a third owner to prove — select-tool STATE
 * ownership re-checked at claim time, never timing: the claim fires only if
 * tldraw is still in `select.pointing_shape` for that press. A press on a port
 * dot lives in `select.pointing_block_port` / `select.dragging_block_port`
 * (the native Dataflow lane and the Communication lane both enter from there)
 * and this lane stands down for it; a Behavior Tree node is never a stack
 * member (its parent is a region, not a Block), so the tree lane's target set
 * and this one's are disjoint by construction, not by timing.
 *
 * HOW the two systems never share a gesture — the Behavior Tree lane's four
 * steps, copied rather than re-derived (see `treeDndDrag.tsx`):
 *   1. SHADOW — the pointer-down flows to tldraw untouched; a capture-phase
 *      listener only remembers a press the claim predicate admits.
 *   2. PREEMPT — at 3 screen px of travel, strictly below tldraw's own 4px
 *      `dragDistanceSquared` threshold, the claim re-checks the select-tool
 *      state and asks the select tool to stand down through its own public
 *      cancel event; `select.translating` is never entered.
 *   3. HAND OFF — the remembered pointer-down is cloned, hidden from tldraw
 *      with `markEventAsHandled`, and dispatched at the mounted DndContext's
 *      proxy draggable; dnd-kit's PointerSensor owns the pointer from there.
 *   4. INTERLOCK — a reactor cancels any native translate of a sole-selected
 *      stack member that the preempt did not see (a long press, a grab through
 *      the selection bounds) and hands it over from the pointer's position.
 *
 * SINGLE WRITER — while a session is live the settle pass in `memberStack.ts`
 * stands down for that parent (`memberStackDragState`), and every frame of
 * the gesture writes through one place here: the dragged card at the pointer,
 * the other members at the candidate layout with the slot opened. The drop
 * commits the candidate order through the same reducer the list uses; a
 * cancel bails to the session's history mark, so one undo reverts the whole
 * gesture.
 *
 * WHY `SortableContext`/`useSortable` are NOT mounted, despite this being the
 * textbook sortable: dnd-kit's sortable layer sorts DOM elements it measures in
 * screen space once per drag; the cards are tldraw shapes whose screen rects
 * change under pan/zoom mid-drag, and their slot is a page-space fact the
 * stack's own placements already know. dnd-kit owns the pointer; the geometry
 * stays in page space (`stackMemberPlacements` + `blockMemberDropTarget`).
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
import { react, useEditor, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { blockMemberSpacing, blockMemberWidth, type BlockShape } from './blockModel'
import { blockMemberDropTarget, stackMemberPlacements, type BlockMemberPlacement } from './memberLayout'
import {
	assignMemberOrder,
	blockStackMembers,
	isStackBlock,
	isStackMemberShape,
	layoutBlockStack,
	stackMemberOf,
} from './memberStack'
import { memberStackDragState } from './memberStackDragState'

/**
 * Strictly below tldraw's own drag-start threshold (4 screen px —
 * `options.dragDistanceSquared: 16`, verified in @tldraw/editor 5.3.2), so the
 * claim preempts `pointing_shape → translating` rather than racing it. A press
 * released under this distance is a plain click and never touches dnd-kit.
 */
export const STACK_DND_CLAIM_DISTANCE_PX = 3

const STACK_DND_PROXY_ID = 'stack-member-dnd-drag-proxy'

interface StackDndClaim {
	memberId: TLShapeId
	parentId: TLShapeId
	pointerId: number
	pointerType: string
	clientX: number
	clientY: number
}

interface ClaimEventLike {
	button: number
	isPrimary: boolean
	shiftKey: boolean
	ctrlKey: boolean
	metaKey: boolean
	altKey: boolean
}

/**
 * Would tldraw's select tool, given this press, translate exactly this one
 * stack member? Null for every other press. The hit test is tldraw's own
 * `getHitShapeOnCanvasPointerDown` chain (hitInside false, hit-test margin,
 * rendering only, selected-shape fallback), replicated so an annotation drawn
 * over a member wins the point where tldraw would give it the point.
 */
export function stackMemberDndClaimTarget(
	editor: Editor,
	client: { x: number; y: number },
	event: ClaimEventLike,
): { member: TLShape; parent: BlockShape } | null {
	if (event.button !== 0 || !event.isPrimary) return null
	if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return null
	if (editor.getIsReadonly()) return null
	if (!editor.isIn('select.idle')) return null
	if (editor.inputs.getIsPanning()) return null

	const pagePoint = editor.screenToPage(client)
	const hit =
		editor.getShapeAtPoint(pagePoint, {
			hitInside: false,
			hitLabels: false,
			hitLocked: editor.options.selectLockedShapes,
			margin: editor.getHitTestMargin(),
			renderingOnly: true,
		}) ?? editor.getSelectedShapeAtPoint(pagePoint)
	if (!hit) return null
	const target = stackMembershipOf(editor, hit)
	if (!target) return null

	const selectedIds = editor.getSelectedShapeIds()
	if (selectedIds.length > 1) {
		if (selectedIds.includes(hit.id)) return null
		const bounds = editor.getSelectionRotatedPageBounds()
		if (bounds?.containsPoint(pagePoint)) return null
	}
	// A press while an ancestor is selected translates the ancestor natively
	// (PointingShape.onEnter). `installBlockChildSelection` retargets a press
	// on a member whose Block is selected to the member itself, after which the
	// interlock below claims the translate on entry — so this stays native
	// here rather than second-guessing tldraw's routing.
	if (selectedIds.length > 0 && editor.findShapeAncestor(hit, (ancestor) => selectedIds.includes(ancestor.id))) return null
	return target
}

function stackMembershipOf(editor: Editor, shape: TLShape): { member: TLShape; parent: BlockShape } | null {
	if (!isStackMemberShape(shape) || shape.isLocked) return null
	if (typeof shape.parentId !== 'string' || !shape.parentId.startsWith('shape:')) return null
	const parent = editor.getShape(shape.parentId as TLShapeId)
	if (!isStackBlock(parent) || parent.isLocked) return null
	return { member: shape, parent }
}

/* ------------------------- the dnd-kit drag session ------------------------ */

interface StackDndSession {
	parentId: TLShapeId
	memberId: TLShapeId
	/** Pointer-to-card offset in parent space at claim, so the card does not jump. */
	grab: { dx: number; dy: number }
	/**
	 * The OTHER members laid out contiguously, frozen at claim. The slot is
	 * read against these midpoints every frame, so it depends on the pointer
	 * alone and never on the previous frame's candidate — no flicker at a
	 * boundary, the anti-compounding rule the tree lane established.
	 */
	others: BlockMemberPlacement[]
	otherIds: TLShapeId[]
	/** One history mark for the whole gesture: undo is one step, Escape bails to it. */
	markId: string
	before: TLShapeId | null | undefined
}

const sessions = new WeakMap<Editor, StackDndSession>()

function startSession(editor: Editor, claim: StackDndClaim, clientX: number, clientY: number): boolean {
	const parent = editor.getShape(claim.parentId)
	const member = editor.getShape(claim.memberId)
	if (!isStackBlock(parent) || !isStackMemberShape(member)) return false
	const members = blockStackMembers(editor, parent.id)
	const otherShapes = members.filter((shape) => shape.id !== member.id)
	const { placements } = stackMemberPlacements(
		parent.props,
		otherShapes.map(stackMemberOf),
		blockMemberSpacing(parent.props),
		blockMemberWidth(parent.props),
	)
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const local = editor.getPointInShapeSpace(parent, pagePoint)
	const markId = editor.markHistoryStoppingPoint('reorder stack member')
	// Lift: the card paints above its siblings while it rides the pointer. The
	// drop's index permutation and a cancel's bail both put it back.
	editor.bringToFront([member.id])
	const session: StackDndSession = {
		parentId: parent.id,
		memberId: member.id,
		grab: { dx: local.x - member.x, dy: local.y - member.y },
		others: placements,
		otherIds: otherShapes.map((shape) => shape.id),
		markId,
		before: undefined,
	}
	sessions.set(editor, session)
	memberStackDragState.set(editor, { parentId: parent.id, memberId: member.id, before: null })
	return true
}

/** The candidate order for a slot: the frozen others with the card inserted before `before`. */
function candidateOrder(session: StackDndSession, before: TLShapeId | null): TLShapeId[] {
	const at = before === null ? session.otherIds.length : session.otherIds.indexOf(before)
	const others = session.otherIds
	return [...others.slice(0, at), session.memberId, ...others.slice(at)]
}

/**
 * One pointer frame. dnd-kit's sensor is the single writer of the card's
 * position now, so the card is placed directly from the pointer; the slot is
 * read from where the card's midpoint sits among the frozen others, and the
 * others take the candidate layout so the slot visibly opens.
 */
function moveSession(editor: Editor, session: StackDndSession, clientX: number, clientY: number) {
	const parent = editor.getShape(session.parentId)
	const member = editor.getShape(session.memberId)
	if (!isStackBlock(parent) || !isStackMemberShape(member)) return
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const local = editor.getPointInShapeSpace(parent, pagePoint)
	const x = local.x - session.grab.dx
	const y = local.y - session.grab.dy
	// The slot is where the card's MIDPOINT sits among the frozen others'
	// midpoints — `blockMemberDropTarget` compares its `y` against neighbour
	// midpoints, so hand it the card's centre rather than its top edge.
	const before = blockMemberDropTarget(session.others, y + member.props.h / 2).before
	if (editor.getInstanceState().cursor.type !== 'move') {
		editor.setCursor({ type: 'move', rotation: 0 })
	}
	editor.run(() => {
		if (Math.abs(member.x - x) > 0.01 || Math.abs(member.y - y) > 0.01) {
			editor.updateShape({ id: member.id, type: member.type, x, y } as never)
		}
		if (before === session.before) return
		session.before = before
		memberStackDragState.set(editor, { parentId: parent.id, memberId: member.id, before })
		const order = candidateOrder(session, before)
		const byId = new Map(blockStackMembers(editor, parent.id).map((shape) => [shape.id, shape]))
		const laid = stackMemberPlacements(
			parent.props,
			order.flatMap((id) => {
				const shape = byId.get(id)
				return shape ? [stackMemberOf(shape)] : []
			}),
			blockMemberSpacing(parent.props),
			blockMemberWidth(parent.props),
		).placements
		const updates = laid.flatMap((placement) => {
			if (placement.id === member.id) return []
			const shape = byId.get(placement.id)
			if (!shape || (Math.abs(shape.x - placement.x) < 0.01 && Math.abs(shape.y - placement.y) < 0.01)) return []
			return [{ id: shape.id, type: shape.type, x: placement.x, y: placement.y }]
		})
		if (updates.length > 0) editor.updateShapes(updates as never)
	})
}

/** Commit the slot: the candidate order becomes the authored order, then the stack settles. */
function endSession(editor: Editor) {
	const session = sessions.get(editor)
	if (!session) return
	sessions.delete(editor)
	memberStackDragState.set(editor, null)
	const parent = editor.getShape(session.parentId)
	if (isStackBlock(parent)) {
		const before = session.before === undefined ? null : session.before
		const order = candidateOrder(session, before)
		const byId = new Map(blockStackMembers(editor, parent.id).map((shape) => [shape.id, shape]))
		const ordered = order.flatMap((id) => {
			const shape = byId.get(id)
			return shape ? [shape] : []
		})
		// No new history mark: the drop belongs to the session's own mark, so
		// one undo reverts the whole gesture, preview frames included.
		editor.run(() => {
			assignMemberOrder(editor, ordered)
			layoutBlockStack(editor, parent.id, { order: 'authored' })
		})
	}
	editor.setCursor({ type: 'default', rotation: 0 })
}

function cancelSession(editor: Editor) {
	const session = sessions.get(editor)
	if (!session) return
	sessions.delete(editor)
	memberStackDragState.set(editor, null)
	// Escape / pointercancel / window blur: everything since the session mark
	// rolls back — the lift, the card's frames, the opened slot.
	editor.bailToMark(session.markId)
	editor.setCursor({ type: 'default', rotation: 0 })
}

/* ------------------------ claim → dnd-kit hand-off ------------------------- */

interface StackDndBridge {
	begin(claim: StackDndClaim, clientX: number, clientY: number): boolean
}

const bridges = new WeakMap<Editor, StackDndBridge>()

function claimNow(editor: Editor, claim: StackDndClaim, clientX: number, clientY: number) {
	const bridge = bridges.get(editor)
	if (!bridge) return
	// The select tool stands down through its own public cancel event, which
	// dispatch() queues after the arming pointer_down and before the
	// threshold-crossing pointer_move — pointing_shape retreats to idle and
	// translating is never entered.
	editor.cancel()
	bridge.begin(claim, clientX, clientY)
}

/** Install the shadow / preempt / interlock listeners beside the mounted DndContext. */
export function installStackMemberDndClaims(editor: Editor): () => void {
	const doc = editor.getContainer().ownerDocument
	let armed: StackDndClaim | null = null

	const onPointerDown = (event: PointerEvent) => {
		if (armed) {
			armed = null
			return
		}
		if (memberStackDragState.get(editor)) return
		if (!bridges.get(editor)) return
		const target = stackMemberDndClaimTarget(editor, { x: event.clientX, y: event.clientY }, event)
		if (!target) return
		armed = {
			memberId: target.member.id,
			parentId: target.parent.id,
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			clientX: event.clientX,
			clientY: event.clientY,
		}
	}
	const onPointerMove = (event: PointerEvent) => {
		const claim = armed
		if (!claim || event.pointerId !== claim.pointerId) return
		const dx = event.clientX - claim.clientX
		const dy = event.clientY - claim.clientY
		if (dx * dx + dy * dy < STACK_DND_CLAIM_DISTANCE_PX * STACK_DND_CLAIM_DISTANCE_PX) return
		armed = null
		if (editor.inputs.getIsPanning()) return
		// WHY this check is the lane's whole claim to legitimacy: ownership is
		// decided by which select-tool state holds the press at the moment of
		// claiming. Only `pointing_shape` means tldraw would translate the
		// member; a port press (`pointing_block_port`) belongs to the cable and
		// reorder lanes and is left alone. Never by timing — see PEP 0013.
		if (!editor.isIn('select.pointing_shape')) return
		claimNow(editor, claim, event.clientX, event.clientY)
	}
	const onPointerEnd = (event: PointerEvent) => {
		if (armed && event.pointerId === armed.pointerId) armed = null
		if (sessions.get(editor)) {
			setTimeout(() => {
				if (sessions.get(editor)) endSession(editor)
			}, 50)
		}
	}
	doc.addEventListener('pointerdown', onPointerDown, { capture: true })
	doc.addEventListener('pointermove', onPointerMove, { capture: true })
	doc.addEventListener('pointerup', onPointerEnd, { capture: true })
	doc.addEventListener('pointercancel', onPointerEnd, { capture: true })

	const stopInterlock = react('stack member dnd translate interlock', () => {
		if (!editor.isIn('select.translating')) return
		if (memberStackDragState.get(editor)) return
		if (!bridges.get(editor)) return
		if (editor.inputs.getAltKey()) return
		const selectedIds = editor.getSelectedShapeIds()
		if (selectedIds.length !== 1) return
		const shape = editor.getShape(selectedIds[0])
		if (!shape) return
		const target = stackMembershipOf(editor, shape)
		if (!target) return
		queueMicrotask(() => {
			if (!editor.isIn('select.translating')) return
			if (memberStackDragState.get(editor)) return
			const screen = editor.inputs.getCurrentScreenPoint()
			const viewport = editor.getViewportScreenBounds()
			const clientX = viewport.x + screen.x
			const clientY = viewport.y + screen.y
			claimNow(
				editor,
				{ memberId: target.member.id, parentId: target.parent.id, pointerId: 1, pointerType: 'mouse', clientX, clientY },
				clientX,
				clientY,
			)
		})
	})

	return () => {
		armed = null
		doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
		doc.removeEventListener('pointermove', onPointerMove, { capture: true })
		doc.removeEventListener('pointerup', onPointerEnd, { capture: true })
		doc.removeEventListener('pointercancel', onPointerEnd, { capture: true })
		stopInterlock()
		if (sessions.get(editor)) cancelSession(editor)
	}
}

/* ------------------------------- the host --------------------------------- */

/**
 * The one mounted dnd-kit context for the stack lane, rendered through the
 * `InFrontOfTheCanvas` seam beside the other two hosts. Inert until a claim:
 * the only dnd-kit listeners in the document sit on the 1×1
 * `pointer-events: none` proxy, which only the synthetic hand-off clone reaches.
 */
export function StackMemberDndHost() {
	const editor = useEditor()
	const sensors = useSensors(useSensor(PointerSensor))
	useEffect(() => installStackMemberDndClaims(editor), [editor])
	const onDragMove = useCallback(
		(event: DragMoveEvent) => {
			const session = sessions.get(editor)
			if (!session) return
			const activator = event.activatorEvent as PointerEvent
			moveSession(editor, session, activator.clientX + event.delta.x, activator.clientY + event.delta.y)
		},
		[editor],
	)
	const onDragEnd = useCallback(() => endSession(editor), [editor])
	const onDragCancel = useCallback(() => cancelSession(editor), [editor])
	return (
		<DndContext
			sensors={sensors}
			autoScroll={false}
			onDragMove={onDragMove}
			onDragEnd={onDragEnd}
			onDragCancel={onDragCancel}
		>
			<StackDndProxyHandle editor={editor} />
		</DndContext>
	)
}

function StackDndProxyHandle({ editor }: { editor: Editor }) {
	const { listeners, setNodeRef } = useDraggable({ id: STACK_DND_PROXY_ID })
	const elementRef = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		bridges.set(editor, {
			begin(claim, clientX, clientY) {
				const element = elementRef.current
				if (!element) return false
				if (!startSession(editor, claim, clientX, clientY)) return false
				const clone = new PointerEvent('pointerdown', {
					bubbles: true,
					cancelable: true,
					composed: true,
					clientX,
					clientY,
					button: 0,
					buttons: 1,
					pointerId: claim.pointerId,
					pointerType: claim.pointerType,
					isPrimary: true,
				})
				// The clone exists for dnd-kit's activator alone; hidden from
				// tldraw so it never reads as a second, mid-gesture pointer down.
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
			data-testid="stack-member-dnd-drag-proxy"
			style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
		/>
	)
}

/** True while dnd-kit is dragging this member — the canvas lifts it. */
export function isStackMemberBeingDragged(editor: Editor, shapeId: TLShapeId): boolean {
	return memberStackDragState.get(editor)?.memberId === shapeId
}

