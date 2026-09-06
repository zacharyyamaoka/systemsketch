/**
 * The Behavior Tree's second drag system: dnd-kit, mounted for real, owning
 * the reorder gesture on an auto-laid-out Tree or Process view.
 *
 * WHY a second drag system exists at all — Zach's explicit, scoped exception
 * to the stock-boundary rule (2026-09-06): "only when we've turned on auto
 * formatting. At that point it no longer acts as a whiteboard, but as this
 * reactive diagram. I still want to be able to draw whiteboard primitives
 * over top of it, and tldraw can't own that, but I do think it is more
 * accurate to actually create two drag systems — if you're clicking on
 * something that is part of the diagram, the dnd-kit drag system overtakes;
 * if you're doing something that is not part of the diagram, you use the
 * whiteboard one." Auto-layout changes a region's identity from whiteboard
 * to reactive diagram, so the diagram's own gesture engine takes the drag.
 * This fork (single-drag-owner vs conditional-dual-drag-owner) is recorded
 * in docs/peps/0007-conditional-dual-drag-owner.md; do not silently
 * re-litigate it by "simplifying" back to one owner.
 *
 * THE BOUNDARY, precisely — dnd-kit may own a gesture only when ALL hold:
 *   - the pressed shape is a projected diagram node (`btRole === 'node'`)
 *     of a region with `arrangement === 'tidy'` in a diagram projection —
 *     `'tree'`, and since Zach's 2026-09-06 follow-up (`'I'm confident
 *     that you're on the right path to make it work for the process
 *     view'`) also `'process'`, resolved by `processDragList.ts`;
 *   - the pointer-down is a plain primary press (button 0, no modifiers,
 *     not a pan) that tldraw's own hit test resolves to that node — a
 *     whiteboard arrow drawn over the diagram wins the point exactly as it
 *     would natively, and stays fully tldraw's;
 *   - the gesture would have translated exactly that one node (multi-select
 *     drags, selected-ancestor drags and clone drags stay native).
 * Everything else — auto-layout off, empty canvas, whiteboard primitives
 * over the region, modified clicks, the region itself — is byte-identical
 * native tldraw, with zero dnd-kit listeners anywhere in its event path.
 *
 * HOW the two systems never share a gesture (the two-writer corruption the
 * old observer path documented is the failure mode this design exists to
 * rule out):
 *   1. SHADOW — the pointer-down flows to tldraw untouched. The select tool
 *      runs `pointing_shape` natively: selection, double-click, right-click,
 *      click-to-edit all keep their stock meaning. A document capture-phase
 *      listener merely remembers the press when the claim predicate above
 *      matches (`treeDndClaimTarget`, a replica of tldraw's own
 *      `getHitShapeOnCanvasPointerDown` + `PointingShape.onEnter` selection
 *      rules — see the pinned copies below).
 *   2. PREEMPT — at 3 screen px of travel (strictly below tldraw's own
 *      4px `dragDistanceSquared` threshold), the claim fires: it asks the
 *      select tool to stand down through its own public cancel event.
 *      `editor.dispatch` is a FIFO queue flushed per tick, and the capture
 *      listener runs before tldraw's bubble listeners for the same DOM
 *      event — so the cancel always lands BETWEEN the pointer_down and the
 *      first threshold-crossing pointer_move, and `select.translating` can
 *      never be entered, whatever single frame the pointer jumped in.
 *   3. HAND OFF — the remembered pointer-down is cloned, marked as handled
 *      for tldraw (`editor.markEventAsHandled` — the documented way to stop
 *      tldraw without touching other DOM handlers), and dispatched at the
 *      mounted `DndContext`'s proxy draggable. dnd-kit's real PointerSensor
 *      activates from it (its activator checks only `isPrimary` and
 *      `button === 0`, verified against @dnd-kit/core 6.3.1) and owns the
 *      pointer for the rest of the gesture through its own document
 *      listeners: move, up, Escape-cancel, window-blur-cancel.
 *   4. INTERLOCK — a reactor watches `select.translating` itself: any way a
 *      sole-selected tidy diagram node still ends up natively translated
 *      (long-press, a grab through the selection bounds) is cancelled on
 *      entry and handed to dnd-kit the same way, which makes "tldraw's
 *      translate never owns a tidy diagram node's gesture" an invariant
 *      rather than a race. Multi-select stays native and merely settles
 *      back to the tidy layout on release (see installBehaviorTreeRegions).
 *
 * WHY `SortableContext`/`useSortable` are NOT mounted: dnd-kit's sortable
 * layer sorts DOM elements it can measure, and measures them in screen
 * space once per drag. The things being sorted here are tldraw shapes whose
 * committed positions the XML projection owns, and whose screen positions
 * change under camera pan/zoom mid-drag — a DOM mirror of them would be a
 * second, staler copy of the layout (the exact forking failure mode the
 * stock-boundary test exists to catch). Resolution therefore stays in the
 * proven page-space pipeline (`sortableGeometry.ts` + `dragListReorder.ts`,
 * dnd-kit's own exported collision functions inside), fed per `onDragMove`
 * from the real sensor. dnd-kit owns the gesture; the pipeline owns the
 * geometry; `moveBehaviorTreeNode` owns legality.
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

import {
	BEHAVIOR_TREE_SHAPE_TYPE,
	BT_META_PATH,
	isBehaviorTreeShape,
	readBtChildMeta,
	type BehaviorTreeShape,
	type BtPoint,
} from './behaviorTreeModel'
import { projectBehaviorTree } from './behaviorTreeProjection'
import { buildDragListContext, resolveDragListDrop, type DragListContext, type DropResolution } from './dragListReorder'
import { buildProcessDragListContext, resolveProcessDragDrop } from './processDragList'
import {
	behaviorTreeRegionFor,
	reconcileBehaviorTree,
	withoutBehaviorTreeRepair,
} from './installBehaviorTreeRegions'
import { treeDragRefusalState } from './treeDragRefusal'
import { btDndDragState } from './treeDndDragState'
import { btDragTuning } from './treeDragTuningState'

/**
 * Strictly below tldraw's own drag-start threshold (4 screen px —
 * `options.dragDistanceSquared: 16`, verified in @tldraw/editor 5.3.2), so
 * the claim always preempts `pointing_shape → translating` rather than
 * racing it. A released press under this distance is a plain click and never
 * touches dnd-kit at all. This is the DEFAULT; the live value is the Drag
 * Model Tuner's `claimDistancePx` knob (`treeDragTuningState.ts`), and a
 * tuned value above 4 knowingly lets tldraw's translate engage first — the
 * `select.translating` interlock still claims it on entry, one frame later.
 */
export const BT_DND_CLAIM_DISTANCE_PX = 3

const BT_DND_PROXY_ID = 'bt-dnd-drag-proxy'

/** A press the capture listener is shadowing, before anything is decided. */
export interface BtDndClaim {
	shapeId: TLShapeId
	regionId: TLShapeId
	/** The node's path in the region's CURRENT xml — the session's base numbering. */
	path: string
	pointerId: number
	pointerType: string
	clientX: number
	clientY: number
}

interface BtDndClaimEventLike {
	button: number
	isPrimary: boolean
	shiftKey: boolean
	ctrlKey: boolean
	metaKey: boolean
	altKey: boolean
}

/**
 * Would tldraw's select tool, given this press, translate exactly this one
 * tidy-tree diagram node? Null for every other press — which is the whole
 * mutual-exclusivity boundary, so this replicates tldraw's own decision
 * chain rather than approximating it:
 *
 *   - the hit test is `getHitShapeOnCanvasPointerDown` verbatim (tldraw
 *     5.3.2, `hitInside: false`, hit-test margin, rendering only, selected
 *     shape fallback) — so a whiteboard arrow drawn over a node wins the
 *     press exactly where tldraw would give it the press, and the diagram
 *     never steals it;
 *   - the "what would the gesture translate" rules are
 *     `PointingShape.onEnter`'s: a press inside a multi-selection's bounds
 *     translates the selection; a press on a node whose ancestor (the
 *     region) is selected translates the region; both stay native.
 */
/** The projections the dnd drag lane owns when Auto layout is on. */
function isDndDragProjection(projection: string): boolean {
	return projection === 'tree' || projection === 'process'
}

export function treeDndClaimTarget(
	editor: Editor,
	client: { x: number; y: number },
	event: BtDndClaimEventLike,
): { shape: TLShape; region: BehaviorTreeShape; path: string } | null {
	if (event.button !== 0 || !event.isPrimary) return null
	if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return null
	if (editor.getIsReadonly()) return null
	// Only a fresh select-tool gesture: any other tool (arrow, text, our
	// region tools) owns its pointer downs outright, and a pan in progress
	// stays a pan.
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
	if (!editor.options.selectLockedShapes && editor.isShapeOrAncestorLocked(hit)) return null

	const meta = readBtChildMeta(hit)
	if (!meta || meta.btRole !== 'node') return null
	const region = behaviorTreeRegionFor(editor, hit)
	// WHY these literals are the gate: Zach's exception is scoped to the
	// reactive-diagram mode only — first Tree view, then Process view once he
	// confirmed the architecture ("I'm confident that you're on the right
	// path to make it work for the process view", 2026-09-06). With
	// `arrangement === 'tidy'` off, the region is a plain whiteboard again
	// and tldraw owns 100% of drag, byte-identical to before.
	if (!region || !isDndDragProjection(region.props.projection) || region.props.arrangement !== 'tidy') return null

	const selectedIds = editor.getSelectedShapeIds()
	if (selectedIds.length > 0) {
		if (selectedIds.length > 1 && selectedIds.includes(hit.id)) return null
		if (selectedIds.length > 1) {
			const bounds = editor.getSelectionRotatedPageBounds()
			if (bounds?.containsPoint(pagePoint)) return null
		}
		if (editor.findShapeAncestor(hit, (ancestor) => selectedIds.includes(ancestor.id))) return null
	}
	return { shape: hit, region, path: meta[BT_META_PATH] }
}

/* ------------------------- the dnd-kit drag session ------------------------ */

interface BtDndSession {
	regionId: TLShapeId
	shapeId: TLShapeId
	/** The dragged occurrence's path in `baseXml`'s own numbering, fixed at claim. */
	basePath: string
	/**
	 * The XML from the instant the drag started — every frame resolves against
	 * this SAME pristine tree, never the previous frame's candidate, so nothing
	 * compounds (the anti-flicker invariant `dragListReorder.ts` depends on).
	 */
	baseXml: string
	/** `projectBehaviorTree(...).origin` — layout space → region space offset. */
	origin: BtPoint
	/** Pointer-to-shape offset in region space at claim, so the card doesn't jump under the pointer. */
	grab: { dx: number; dy: number }
	/**
	 * Presentation dicts snapshotted BASE-KEYED at session start. Every frame
	 * writes `remap(base dict, base→candidate)` — never a remap of the
	 * previous frame's already-remapped props, which silently drops an entry
	 * the first time a path actually changes twice in one drag. (The old
	 * observer path remapped `region.props.*` in place each frame; its own
	 * comment claimed base-keying that the code did not preserve.)
	 */
	baseOffsets: BehaviorTreeShape['props']['offsets']
	baseOverrides: BehaviorTreeShape['props']['nodeViewOverrides']
	/**
	 * Every node-role child's identity in `baseXml`'s numbering, captured once
	 * at claim, keyed by the one thing that never changes mid-drag — the shape
	 * id. `result.remap` is always base→this-frame's-candidate, but by frame 2
	 * the shapes are stamped with frame 1's candidate paths; composing
	 * `remap[baseline]` from this snapshot is what keeps every frame
	 * independent (the "whole subtrees vanish" regression the observer path
	 * documented and this port keeps fixed).
	 */
	baselineByShapeId: Map<TLShapeId, string>
	/** One history mark for the whole gesture: undo is one step, Escape bails to it. */
	markId: string
	/**
	 * Tree view's rich context, kept for the debug overlay's live geometry;
	 * null for a Process session (its overlay is a follow-up) and for a node
	 * that cannot be reordered at all (the tree's own root).
	 */
	ctx: DragListContext | null
	/**
	 * The per-frame resolver, view-dispatched at claim: Tree resolves via
	 * `resolveDragListDrop`, Process via `resolveProcessDragDrop` — same
	 * ghost model, same tuned hysteresis, same judge. Null when the pressed
	 * node cannot be reordered.
	 */
	resolve: ((rect: { x: number; y: number; w: number; h: number }) => DropResolution) | null
}

const sessions = new WeakMap<Editor, BtDndSession>()

/** What the drag-model debug overlay reads mid-drag: the session's REAL resolution geometry. */
export interface BtDndDragGeometry {
	regionId: TLShapeId
	/** Layout space → region space offset, captured at claim. */
	origin: BtPoint
	/** The live session's own context — ghost containers, strips, zones, hysteresis. */
	ctx: DragListContext
}

/**
 * The active dnd session's resolution geometry, read-only, or null. This is
 * the exact object `resolveDragListDrop` runs against every frame — handed
 * out so the debug overlay (`BehaviorTreeCanvas`) draws the truth rather
 * than a parallel derivation. Reactivity comes from `btDndDragState`; the
 * geometry itself is frozen per session by design (slot boundaries hold
 * still while the pointer wanders).
 */
export function activeBtDndDragGeometry(editor: Editor): BtDndDragGeometry | null {
	const session = sessions.get(editor)
	if (!session || !session.ctx) return null
	return { regionId: session.regionId, origin: session.origin, ctx: session.ctx }
}

function startSession(editor: Editor, claim: BtDndClaim, clientX: number, clientY: number): boolean {
	const region = editor.getShape(claim.regionId)
	const shape = editor.getShape(claim.shapeId)
	if (!isBehaviorTreeShape(region) || !shape) return false
	const baseXml = region.props.xml
	const baselineByShapeId = new Map<TLShapeId, string>()
	for (const id of editor.getSortedChildIdsForParent(region.id)) {
		const child = editor.getShape(id)
		const meta = readBtChildMeta(child)
		if (meta && meta.btRole === 'node') baselineByShapeId.set(id, meta[BT_META_PATH])
	}
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const local = editor.getPointInShapeSpace(region, pagePoint)
	// Resolution must build the SAME layout the pointer is measured against —
	// an Expanded leaf or a 2× spacing slider otherwise silently drifts slots
	// off the painted rects (both were measured, journey-caught failures on
	// the observer path). The Drag Model Tuner's live values are frozen into
	// the session like everything else about it — a slider moved mid-drag
	// applies to the next gesture, which is also how you FEEL a change
	// honestly.
	const resolutionOptions = {
		orientation: region.props.orientation,
		nodeFace: region.props.nodeFace,
		controlFace: region.props.controlFace,
		nodeViewOverrides: region.props.nodeViewOverrides,
		spacing: region.props.spacingScale,
		tuning: btDragTuning.get(),
	}
	const treeCtx = region.props.projection === 'tree'
		? buildDragListContext(baseXml, region.props.treeId, claim.path, resolutionOptions)
		: null
	const processCtx = region.props.projection === 'process'
		? buildProcessDragListContext(baseXml, region.props.treeId, claim.path, resolutionOptions)
		: null
	const session: BtDndSession = {
		regionId: region.id,
		shapeId: shape.id,
		basePath: claim.path,
		baseXml,
		origin: projectBehaviorTree(region.props).origin,
		grab: { dx: local.x - shape.x, dy: local.y - shape.y },
		baseOffsets: { ...region.props.offsets },
		baseOverrides: { ...region.props.nodeViewOverrides },
		baselineByShapeId,
		markId: editor.markHistoryStoppingPoint('behavior tree reorder drag'),
		ctx: treeCtx,
		resolve: treeCtx
			? (rect) => resolveDragListDrop(treeCtx, rect)
			: processCtx
				? (rect) => resolveProcessDragDrop(processCtx, rect)
				: null,
	}
	sessions.set(editor, session)
	btDndDragState.set(editor, { regionId: region.id, shapeId: shape.id, path: claim.path })
	return true
}

/**
 * One pointer frame of the claimed gesture. dnd-kit's sensor is the single
 * writer of the dragged card's position now — tldraw's translate is
 * structurally out of the gesture — so the card is placed directly from the
 * pointer, and the same proven core the observer path used follows: resolve
 * against the frozen base tree, commit the candidate XML, restamp from the
 * baseline snapshot, reconcile everything except the dragged card.
 */
function moveSession(editor: Editor, session: BtDndSession, clientX: number, clientY: number) {
	const region = editor.getShape(session.regionId)
	const shape = editor.getShape(session.shapeId)
	if (!isBehaviorTreeShape(region) || !shape) return
	const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
	const local = editor.getPointInShapeSpace(region, pagePoint)
	const x = local.x - session.grab.dx
	const y = local.y - session.grab.dy
	const { w, h } = shape.props as { w: number; h: number }
	// Idle re-entered after the claim's cancel and reset the cursor; a drag
	// reads as a drag, so re-assert tldraw's own move cursor while it lasts.
	if (editor.getInstanceState().cursor.type !== 'move') {
		editor.setCursor({ type: 'move', rotation: 0 })
	}
	editor.run(() => {
		withoutBehaviorTreeRepair(editor, () => {
			if (Math.abs(shape.x - x) > 0.01 || Math.abs(shape.y - y) > 0.01) {
				editor.updateShape({ id: shape.id, type: shape.type, x, y } as never)
			}
			if (!session.resolve) return
			const result = session.resolve({
				x: x - session.origin.x,
				y: y - session.origin.y,
				w,
				h,
			})
			if (!result.ok) {
				treeDragRefusalState.set(editor, { regionId: region.id, reason: result.reason, at: Date.now() })
				return
			}
			if (result.xml === region.props.xml) return
			editor.updateShape<BehaviorTreeShape>({
				id: region.id,
				type: BEHAVIOR_TREE_SHAPE_TYPE,
				props: {
					...region.props,
					xml: result.xml,
					offsets: remapByPath(session.baseOffsets, result.remap),
					nodeViewOverrides: remapByPath(session.baseOverrides, result.remap),
				},
			})
			const restamps: Array<{ id: TLShapeId; type: string; meta: Record<string, unknown> }> = []
			for (const [id, basePath] of session.baselineByShapeId) {
				const newPath = result.remap[basePath]
				if (newPath === undefined) continue
				const child = editor.getShape(id)
				const meta = readBtChildMeta(child)
				if (!child || !meta || meta[BT_META_PATH] === newPath) continue
				restamps.push({ id, type: child.type, meta: { ...child.meta, [BT_META_PATH]: newPath } })
			}
			if (restamps.length > 0) editor.updateShapes(restamps as never)
			reconcileBehaviorTree(editor, region.id, { skipShapeIds: [shape.id] })
		})
	})
}

function endSession(editor: Editor) {
	const session = sessions.get(editor)
	if (!session) return
	sessions.delete(editor)
	btDndDragState.set(editor, null)
	// Settle the card the drag was skipping onto its committed tidy slot,
	// the same history-ignored settle the drop always had.
	if (isBehaviorTreeShape(editor.getShape(session.regionId))) {
		editor.run(() => reconcileBehaviorTree(editor, session.regionId), { history: 'ignore' })
	}
	editor.setCursor({ type: 'default', rotation: 0 })
}

function cancelSession(editor: Editor) {
	const session = sessions.get(editor)
	if (!session) return
	sessions.delete(editor)
	btDndDragState.set(editor, null)
	// Escape / pointercancel / window-blur: tldraw's own gesture-cancel
	// semantics, via tldraw's own mechanism — everything since the session
	// mark (position frames and candidate XML commits alike) rolls back.
	// The observer path could not do this: its cancel left the last
	// candidate XML committed.
	editor.bailToMark(session.markId)
	if (isBehaviorTreeShape(editor.getShape(session.regionId))) {
		editor.run(() => reconcileBehaviorTree(editor, session.regionId), { history: 'ignore' })
	}
	editor.setCursor({ type: 'default', rotation: 0 })
}

function remapByPath<T>(dict: Record<string, T>, remap: Record<string, string>): Record<string, T> {
	const next: Record<string, T> = {}
	for (const [path, value] of Object.entries(dict)) {
		const to = remap[path]
		if (to !== undefined) next[to] = value
	}
	return next
}

/* ------------------------ claim → dnd-kit hand-off ------------------------- */

interface BtDndBridge {
	begin(claim: BtDndClaim, clientX: number, clientY: number): boolean
}

const bridges = new WeakMap<Editor, BtDndBridge>()

function claimNow(editor: Editor, claim: BtDndClaim, clientX: number, clientY: number) {
	const bridge = bridges.get(editor)
	if (!bridge) return
	// Ask the select tool to stand down through its own public cancel event.
	// dispatch() is FIFO per tick, so this processes after the pointer_down
	// that armed the gesture and before the pointer_move that crossed the
	// threshold — pointing_shape retreats to idle without translating ever
	// being entered. (It also disarms blockClickToEdit, whose handler clears
	// its pending click on 'cancel'.)
	editor.cancel()
	bridge.begin(claim, clientX, clientY)
}

/**
 * Install the shadow/preempt/interlock listeners. The host component below
 * installs this alongside the mounted `DndContext`, so a lane that mounts no
 * dnd host has no claim protocol either and stays wholly native.
 */
export function installTreeDndDragClaims(editor: Editor): () => void {
	const doc = editor.getContainer().ownerDocument
	let armed: BtDndClaim | null = null

	const onPointerDown = (event: PointerEvent) => {
		if (armed) {
			// A second pointer while shadowing: not a clean single-pointer
			// gesture — stand down and let tldraw keep all of it.
			armed = null
			return
		}
		if (btDndDragState.get(editor)) return
		if (!bridges.get(editor)) return
		const target = treeDndClaimTarget(editor, { x: event.clientX, y: event.clientY }, event)
		if (!target) return
		armed = {
			shapeId: target.shape.id,
			regionId: target.region.id,
			path: target.path,
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
		const claimDistance = btDragTuning.get().claimDistancePx
		if (dx * dx + dy * dy < claimDistance * claimDistance) return
		armed = null
		// The press may have become a pan (spacebar) by the time it moved;
		// a pan is not a diagram gesture.
		if (editor.inputs.getIsPanning()) return
		claimNow(editor, claim, event.clientX, event.clientY)
	}
	const onPointerEnd = (event: PointerEvent) => {
		if (armed && event.pointerId === armed.pointerId) armed = null
		// Watchdog: if a claimed session somehow lost its sensor (the proxy
		// unmounted mid-gesture), the release must still settle it.
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

	// The interlock: any route into a native translate of a sole-selected
	// tidy diagram node that the 3px preempt did not see coming (a long
	// press, a grab through the selection bounds) is cancelled the moment
	// `select.translating` becomes the state, and handed to dnd-kit from the
	// pointer's current position. Alt stays native — that is tldraw's clone
	// gesture, and the clones it makes are the projection's to reconcile.
	const stopInterlock = react('behavior tree dnd translate interlock', () => {
		if (!editor.isIn('select.translating')) return
		if (btDndDragState.get(editor)) return
		if (!bridges.get(editor)) return
		if (editor.inputs.getAltKey()) return
		const selectedIds = editor.getSelectedShapeIds()
		if (selectedIds.length !== 1) return
		const shape = editor.getShape(selectedIds[0])
		if (!shape) return
		const meta = readBtChildMeta(shape)
		if (!meta || meta.btRole !== 'node') return
		const region = behaviorTreeRegionFor(editor, shape)
		if (!region || !isDndDragProjection(region.props.projection) || region.props.arrangement !== 'tidy') return
		const path = meta[BT_META_PATH]
		// Reactors run at store-commit time; the claim dispatches events and
		// React state, so it steps out to a microtask first (the same pattern
		// as the installer's settle watcher).
		queueMicrotask(() => {
			if (!editor.isIn('select.translating')) return
			if (btDndDragState.get(editor)) return
			const screen = editor.inputs.getCurrentScreenPoint()
			const viewport = editor.getViewportScreenBounds()
			claimNow(
				editor,
				{
					shapeId: shape.id,
					regionId: region.id,
					path,
					pointerId: 1,
					pointerType: 'mouse',
					clientX: viewport.x + screen.x,
					clientY: viewport.y + screen.y,
				},
				viewport.x + screen.x,
				viewport.y + screen.y,
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
 * The one mounted dnd-kit context per editor lane, rendered through the
 * `InFrontOfTheCanvas` seam the app already owns. While no gesture is
 * claimed it is inert by construction: the only dnd-kit listeners in the
 * document are on the 1×1 `pointer-events: none` proxy below, which no real
 * pointer event can ever reach — a claim reaches it only as a synthetic
 * pointer-down clone that `markEventAsHandled` has already made invisible
 * to tldraw.
 */
export function BehaviorTreeDndDragHost() {
	const editor = useEditor()
	const sensors = useSensors(useSensor(PointerSensor))
	useEffect(() => installTreeDndDragClaims(editor), [editor])
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
			<BtDndProxyHandle editor={editor} />
		</DndContext>
	)
}

function BtDndProxyHandle({ editor }: { editor: Editor }) {
	const { listeners, setNodeRef } = useDraggable({ id: BT_DND_PROXY_ID })
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
				// The clone exists for dnd-kit's activator alone. It bubbles
				// through the canvas on its way out, and this is what keeps
				// tldraw from reading it as a second, mid-gesture pointer down.
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
			data-testid="bt-dnd-drag-proxy"
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
