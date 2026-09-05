/**
 * The classic Tree view: a tidy rooted hierarchy, top-to-bottom or
 * left-to-right, in the idiom of MoveIt Pro's editor and Zach's wireframes.
 *
 * Pure: XML occurrences plus sizes in, canvas rectangles and control-wire
 * polylines out. ELK is not used because a tidy tree has one right answer:
 * every subtree is centred over its children and siblings keep XML order.
 */
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
}

/** Gap between a parent and its children along the reading direction. */
export const TREE_LEVEL_GAP = 84
/** Gap between sibling subtrees across the reading direction. */
export const TREE_SIBLING_GAP = 40
export const TREE_START_GAP = 40

interface Extent {
	node: BtNode
	size: { w: number; h: number }
	/** Cross-axis extent of the whole subtree. */
	span: number
	children: Extent[]
}

export function layoutTree(tree: BtTree, options: TreeLayoutOptions): BtScene {
	const scene = emptyScene()
	const down = options.orientation === 'down'
	const sizeOptions = { nodeFace: options.nodeFace, controlFace: options.controlFace }
	const crossOf = (size: { w: number; h: number }) => (down ? size.w : size.h)
	const flowOf = (size: { w: number; h: number }) => (down ? size.h : size.w)

	const measure = (node: BtNode): Extent => {
		const size = btNodeSize(node, sizeOptions)
		const children = node.children.map(measure)
		const childrenSpan = children.reduce((sum, child) => sum + child.span, 0) + TREE_SIBLING_GAP * Math.max(0, children.length - 1)
		return { node, size, span: Math.max(crossOf(size), childrenSpan), children }
	}

	const place = (extent: Extent, crossStart: number, flowStart: number) => {
		const cross = crossStart + (extent.span - crossOf(extent.size)) / 2
		const rect: BtRect = down
			? { x: cross, y: flowStart, w: extent.size.w, h: extent.size.h }
			: { x: flowStart, y: cross, w: extent.size.w, h: extent.size.h }
		scene.nodes.push({
			path: extent.node.path,
			node: extent.node,
			rect,
			role: isBtControlNode(extent.node) ? 'control' : 'leaf',
		})
		if (extent.children.length === 0) return
		const childFlow = flowStart + flowOf(extent.size) + TREE_LEVEL_GAP
		const childrenSpan = extent.children.reduce((sum, child) => sum + child.span, 0) + TREE_SIBLING_GAP * (extent.children.length - 1)
		let cursor = crossStart + (extent.span - childrenSpan) / 2
		for (const child of extent.children) {
			place(child, cursor, childFlow)
			cursor += child.span + TREE_SIBLING_GAP
		}
	}

	if (tree.root) {
		const root = measure(tree.root)
		const startFlow = flowOf({ w: BT_START_W, h: BT_START_H }) + TREE_START_GAP
		place(root, 0, startFlow)
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
		const points = options.edgeStyle === 'elbow' ? elbowPoints(from, to, options.orientation) : [from, to]
		scene.edges.push({ id: `${parent.path}→${entry.path}`, kind: 'control', points, arrowEnd: true, from: parent.path, to: entry.path })
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
