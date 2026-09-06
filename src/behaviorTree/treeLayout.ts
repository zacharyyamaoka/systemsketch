/**
 * The classic Tree view: a tidy rooted hierarchy, top-to-bottom or
 * left-to-right, in the idiom of MoveIt Pro's editor and Zach's wireframes.
 *
 * Pure: XML occurrences plus sizes in, canvas rectangles and control-wire
 * polylines out. ELK is not used because a tidy tree has one right answer:
 * every subtree is centred over its children and siblings keep XML order.
 */
import { hierarchy, tree as d3tree } from 'd3-hierarchy'

import type { BtNode, BtTree } from './btcppXml'
import {
	BT_START_H,
	BT_START_W,
	btNodeSize,
	emptyScene,
	isBtControlNode,
	sceneExtent,
	translateScene,
	type BtControlFace,
	type BtEdgeStyle,
	type BtNodeFace,
	type BtNodeViewOverride,
	type BtOrientation,
	type BtPoint,
	type BtRect,
	type BtScene,
	type BtSceneEdge,
	type BtSceneInsert,
} from './behaviorTreeModel'

export interface TreeLayoutOptions {
	orientation: BtOrientation
	nodeFace: BtNodeFace
	controlFace: BtControlFace
	edgeStyle: BtEdgeStyle
	/** Free-arrangement offsets applied after the tidy pass. */
	offsets?: Record<string, { dx: number; dy: number }>
	/** Leaves pinned to a size other than their `nodeFace` formula. See `ProcessLayoutOptions`. */
	nodeViewOverrides?: Record<string, BtNodeViewOverride>
	/**
	 * Multiplier on `TREE_LEVEL_GAP`/`TREE_SIBLING_GAP` (the region's
	 * `spacingScale` prop). Gaps scale; card sizes never do — a spacing knob
	 * that also grew the cards would silently re-measure every title.
	 */
	spacing?: number
}

/** Gap between a parent and its children along the reading direction. */
export const TREE_LEVEL_GAP = 84
/** Gap between sibling subtrees across the reading direction. */
export const TREE_SIBLING_GAP = 40
export const TREE_START_GAP = 40

export function layoutTree(tree: BtTree, options: TreeLayoutOptions): BtScene {
	const scene = emptyScene()
	const down = options.orientation === 'down'
	const spacing = options.spacing ?? 1
	const levelGap = TREE_LEVEL_GAP * spacing
	const siblingGap = TREE_SIBLING_GAP * spacing
	const sizeOptions = { nodeFace: options.nodeFace, controlFace: options.controlFace }
	const crossOf = (size: { w: number; h: number }) => (down ? size.w : size.h)
	const flowOf = (size: { w: number; h: number }) => (down ? size.h : size.w)

	if (tree.root) {
		// A leaf's override (an Expanded Block, a hand-resized Port-view card)
		// reports its own real box instead of the nodeFace formula, so d3's
		// separation pass and the per-row flow extent both react to it.
		const sizeByPath = new Map(tree.nodes.map((node) => {
			const override = !isBtControlNode(node) ? options.nodeViewOverrides?.[node.path] : undefined
			return [node.path, override ?? btNodeSize(node, sizeOptions)]
		}))
		const crossOfNode = (node: BtNode) => crossOf(sizeByPath.get(node.path)!)

		// WHY: d3-hierarchy's tree() runs synchronously (no worker, no async
		// resolver), so the whole projection completes inside one store
		// transaction and an edit stays one undo step. It walks the XML's own
		// `children` array in order, so sibling order falls out of the
		// hierarchy for free rather than needing a stable sort afterward. And
		// it is the canonical implementation of Buchheim et al.'s contour-
		// packing algorithm — the thing the hand-written span-summing placer
		// above lacked, which is why a deep, narrow subtree used to push its
		// siblings out by its whole span instead of tucking in beside it.
		// ELK is not used here: it is async (a worker round trip inside a
		// tldraw transaction is the wrong shape) and general-graph-shaped,
		// where a rooted tree needs none of its layered/edge-routing power —
		// ELK stays for the free-graph Block canvas (organizeGraph.ts).
		const root = hierarchy(tree.root, (node) => node.children)
		const layout = d3tree<BtNode>()
			.nodeSize([1, 1])
			.separation((a, b) => (crossOfNode(a.data) + crossOfNode(b.data)) / 2 + siblingGap)
		const positioned = layout(root)
		const nodeByPath = new Map(positioned.descendants().map((entry) => [entry.data.path, entry]))

		// d3's y is depth * a fixed unit, which is useless once cards at the
		// same depth have different heights (a compact control beside a tall
		// port-face leaf). Flow is ours: each depth is a row, a row's extent
		// is its tallest card, rows stack with TREE_LEVEL_GAP between them.
		let maxDepth = 0
		for (const node of tree.nodes) maxDepth = Math.max(maxDepth, node.depth)
		const rowFlowExtent: number[] = new Array(maxDepth + 1).fill(0)
		for (const node of tree.nodes) {
			rowFlowExtent[node.depth] = Math.max(rowFlowExtent[node.depth], flowOf(sizeByPath.get(node.path)!))
		}
		const rowStart: number[] = new Array(maxDepth + 1)
		rowStart[0] = flowOf({ w: BT_START_W, h: BT_START_H }) + TREE_START_GAP
		for (let depth = 1; depth <= maxDepth; depth += 1) {
			rowStart[depth] = rowStart[depth - 1] + rowFlowExtent[depth - 1] + levelGap
		}

		for (const node of tree.nodes) {
			const size = sizeByPath.get(node.path)!
			const crossCenter = nodeByPath.get(node.path)!.x
			const cross = crossCenter - crossOf(size) / 2
			const flow = rowStart[node.depth]
			const rect: BtRect = down
				? { x: cross, y: flow, w: size.w, h: size.h }
				: { x: flow, y: cross, w: size.w, h: size.h }
			scene.nodes.push({ path: node.path, node, rect, role: isBtControlNode(node) ? 'control' : 'leaf' })
		}

		const rootRect = scene.nodes[0].rect
		scene.start = down
			? { x: rootRect.x + rootRect.w / 2 - BT_START_W / 2, y: 0, w: BT_START_W, h: BT_START_H }
			: { x: 0, y: rootRect.y + rootRect.h / 2 - BT_START_H / 2, w: BT_START_W, h: BT_START_H }
	} else {
		scene.start = { x: 0, y: 0, w: BT_START_W, h: BT_START_H }
	}

	applyOffsets(scene, options.offsets)
	addTreeEdges(scene, options)
	addTreeInserts(scene, tree, options)
	scene.bounds = sceneExtent(scene)
	return translateScene(scene, -scene.bounds.x, -scene.bounds.y)
}

function applyOffsets(scene: BtScene, offsets: TreeLayoutOptions['offsets']) {
	if (!offsets) return
	for (const entry of scene.nodes) {
		const offset = offsets[entry.path]
		if (!offset) continue
		entry.rect = { ...entry.rect, x: entry.rect.x + offset.dx, y: entry.rect.y + offset.dy }
	}
}

/** Where a control wire leaves a parent and enters a child. */
export function treeEdgeEndpoints(parent: BtRect, child: BtRect, orientation: BtOrientation): { from: BtPoint; to: BtPoint } {
	if (orientation === 'down') {
		return {
			from: { x: parent.x + parent.w / 2, y: parent.y + parent.h },
			to: { x: child.x + child.w / 2, y: child.y },
		}
	}
	return {
		from: { x: parent.x + parent.w, y: parent.y + parent.h / 2 },
		to: { x: child.x, y: child.y + child.h / 2 },
	}
}

function addTreeEdges(scene: BtScene, options: TreeLayoutOptions) {
	const byPath = new Map(scene.nodes.map((entry) => [entry.path, entry]))
	for (const entry of scene.nodes) {
		if (entry.node.parentPath === null) {
			if (scene.start) {
				const { from, to } = treeEdgeEndpoints(scene.start, entry.rect, options.orientation)
				scene.edges.push({ id: `start→${entry.path}`, kind: 'control', points: [from, to], arrowEnd: true, to: entry.path })
			}
			continue
		}
		const parent = byPath.get(entry.node.parentPath)
		if (!parent) continue
		const { from, to } = treeEdgeEndpoints(parent.rect, entry.rect, options.orientation)
		const { points, curve } = treeEdgePoints(from, to, options.edgeStyle, options.orientation)
		scene.edges.push({ id: `${parent.path}→${entry.path}`, kind: 'control', points, curve, arrowEnd: true, from: parent.path, to: entry.path })
	}
}

/** MoveIt's bus: half-way along the reading direction, then across, then in. */
export function elbowPoints(from: BtPoint, to: BtPoint, orientation: BtOrientation): BtPoint[] {
	if (orientation === 'down') {
		const midY = (from.y + to.y) / 2
		if (Math.abs(from.x - to.x) < 0.5) return [from, to]
		return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]
	}
	const midX = (from.x + to.x) / 2
	if (Math.abs(from.y - to.y) < 0.5) return [from, to]
	return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
}

/**
 * The `curved` style: a cubic whose control points sit on the reading axis,
 * offset from each endpoint by half the span between them — a top-to-bottom
 * tree bends vertically, a left-to-right one bends horizontally. Explicit
 * points (not a heuristic bend inferred from two endpoints, the way the
 * Blackboard lens's py_trees splines work) so the axis is never guessed.
 */
export function curvedTreePoints(from: BtPoint, to: BtPoint, orientation: BtOrientation): BtPoint[] {
	if (orientation === 'down') {
		const half = (to.y - from.y) / 2
		return [from, { x: from.x, y: from.y + half }, { x: to.x, y: to.y - half }, to]
	}
	const half = (to.x - from.x) / 2
	return [from, { x: from.x + half, y: from.y }, { x: to.x - half, y: to.y }, to]
}

/**
 * The `slanted` style: the same departure rule as the Slanted arrow
 * (`getSlantedArrowPoints` in `systemSketchArrow.tsx`) — leave the parent's
 * exit face straight along the reading direction for a stub, then run
 * diagonally to the child's entry point with the ordinary arrowhead. The
 * arrow's own stub is a fraction of its span computed from
 * `getConnectionControlPoints`; reusing that helper here would pull the
 * Block-cable module into this otherwise dependency-free layout, so the
 * fallback the spec allows — a fixed `TREE_LEVEL_GAP / 2` — stands in,
 * clamped to half the span so a short gap (the Start pill's stub) never
 * overshoots past the child.
 */
export function slantedTreePoints(from: BtPoint, to: BtPoint, orientation: BtOrientation): BtPoint[] {
	const down = orientation === 'down'
	const span = down ? to.y - from.y : to.x - from.x
	const stub = Math.max(0, Math.min(TREE_LEVEL_GAP / 2, span / 2))
	const elbow = down ? { x: from.x, y: from.y + stub } : { x: from.x + stub, y: from.y }
	return [from, elbow, to]
}

function treeEdgePoints(from: BtPoint, to: BtPoint, edgeStyle: BtEdgeStyle, orientation: BtOrientation): { points: BtPoint[]; curve?: boolean } {
	switch (edgeStyle) {
		case 'elbow': return { points: elbowPoints(from, to, orientation) }
		case 'curved': return { points: curvedTreePoints(from, to, orientation), curve: true }
		case 'slanted': return { points: slantedTreePoints(from, to, orientation) }
		default: return { points: [from, to] }
	}
}

function addTreeInserts(scene: BtScene, tree: BtTree, options: TreeLayoutOptions) {
	if (!tree.root) {
		const start = scene.start!
		const at: BtPoint = options.orientation === 'down'
			? { x: start.x + start.w / 2, y: start.y + start.h + 44 }
			: { x: start.x + start.w + 44, y: start.y + start.h / 2 }
		scene.inserts.push({ id: 'root', at, parentPath: null, index: 0, kind: 'root', persistent: true })
		return
	}
	for (const entry of scene.nodes) {
		if (entry.role !== 'control') continue
		const node = entry.node
		if (node.kind === 'decorator' && node.children.length >= 1) continue
		const rect = entry.rect
		// The target sits on the wire just past the control, where every child
		// wire fans out from — the one spot that reads as "add a child here".
		const at: BtPoint = options.orientation === 'down'
			? { x: rect.x + rect.w / 2, y: rect.y + rect.h + 24 }
			: { x: rect.x + rect.w + 24, y: rect.y + rect.h / 2 }
		const insert: BtSceneInsert = {
			id: `child:${node.path}`,
			at,
			parentPath: node.path,
			index: node.children.length,
			kind: node.children.length === 0 ? 'empty' : 'child',
			persistent: node.children.length === 0,
		}
		scene.inserts.push(insert)
	}
}

export type { BtSceneEdge as TreeSceneEdge }
