/**
 * Re-anchor a dragged node's control wires onto its LIVE rect, mid-drag.
 *
 * WHY this exists (Zach's 2026-09-05 recording, 49s take): the Behavior
 * Tree's wires are hand-drawn SVG paths whose endpoints come from
 * `projectBehaviorTree` — a pure function of the region's XML + stored
 * offsets, with zero live-shape input. During a Tree-view tidy drag,
 * tldraw's own translate moves the dragged card every pointer frame, but
 * `handleAutoLayoutDrag` only commits a NEW candidate XML when the pointer
 * actually crosses a reorder threshold — so between commits, the dragged
 * card's wire endpoint stays nailed to a stale "tidy slot" position while
 * the card glides away under the pointer, then jumps when a commit lands.
 * A step function keyed to reorder events, where the eye expects a
 * continuous function of pointer position.
 *
 * The rule ported here is the one both reference systems already encode —
 * stock tldraw's own `ArrowBindingUtil` (a bound arrow terminal recalculates
 * from the shape's live geometry on every `onAfterChangeToShape`, and only
 * re-resolves against the model when the drag ends) and React Flow (edge
 * paths recomputed from live handle positions on every node move):
 * **the anchor tracks the live shape continuously; the terminal resolves
 * against the model only once the shape stops moving.** These wires are not
 * tldraw arrows (no binding to switch on), so the equivalent is done at
 * paint time: while a node is being natively translated, every control wire
 * touching it is rebuilt from the node's real current rect; the moment the
 * drag ends, the ordinary settle reconcile snaps the card — and with it this
 * override's inputs — back onto the committed tidy layout, so nothing here
 * ever writes to the store or fights tldraw's translate.
 *
 * Pure on purpose: geometry in, geometry out, unit-testable without a
 * browser (`liveDragWires.test.ts`).
 */
import {
	type BtEdgeStyle,
	type BtOrientation,
	type BtRect,
	type BtSceneEdge,
} from './behaviorTreeModel'
import { elbowPoints, treeEdgeEndpoints } from './treeLayout'

export interface LiveDragWireOptions {
	/** The dragged node's path — matching `BtSceneEdge.from`/`to`. */
	draggedPath: string
	/** The dragged shape's live rect, region-local (a region child's own x/y space). */
	draggedRect: BtRect
	/** Every committed node rect, region-local — the stationary endpoints. */
	nodeRects: ReadonlyMap<string, BtRect>
	/** The Start pill's rect, region-local, for the `start→root` wire. */
	startRect: BtRect | null
	orientation: BtOrientation
	edgeStyle: BtEdgeStyle
}

/**
 * Rebuild every Tree-view control wire touching `draggedPath` from the
 * dragged shape's live rect. Wires into the node re-aim their child anchor;
 * wires out of it (a dragged composite still connects to its children)
 * re-aim their parent anchor. Everything else — Blackboard/Dataflow lens
 * edges included, which anchor by port rules this module has no business
 * re-deriving — passes through untouched.
 */
export function withLiveDragWires(edges: BtSceneEdge[], options: LiveDragWireOptions): BtSceneEdge[] {
	const { draggedPath, draggedRect, nodeRects, startRect, orientation, edgeStyle } = options
	return edges.map((edge) => {
		if (edge.kind !== 'control') return edge
		const intoDragged = edge.to === draggedPath
		const outOfDragged = edge.from === draggedPath
		if (!intoDragged && !outOfDragged) return edge
		const parentRect = intoDragged
			? (edge.from !== undefined ? nodeRects.get(edge.from) : startRect ?? undefined)
			: draggedRect
		const childRect = intoDragged ? draggedRect : (edge.to !== undefined ? nodeRects.get(edge.to) : undefined)
		if (!parentRect || !childRect) return edge
		const { from, to } = treeEdgeEndpoints(parentRect, childRect, orientation)
		const points = edgeStyle === 'elbow' ? elbowPoints(from, to, orientation) : [from, to]
		return { ...edge, points }
	})
}
