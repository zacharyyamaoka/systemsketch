/**
 * From a region's props to what should exist on the canvas.
 *
 * Pure and memoized by props identity: parse the XML, lay the selected tree
 * out in the chosen projection, add the Blackboard or Dataflow lens, and
 * describe every child shape the region wants — a Block per leaf, a control
 * card per control/decorator, a value pill per Blackboard key, an unbundle
 * for the tree's own inputs — plus the direct cables of the Dataflow lens.
 * `installBehaviorTreeRegions.ts` is what makes the store agree with this.
 */
import type { TLShapeId } from 'tldraw'

import {
	createValueBlockProps,
	getDefaultBlockProps,
	valueBlockLabel,
	valueBlockSize,
	type BlockPort,
	type BlockShapeProps,
} from '../blocks'
import { createUnbundleProps } from '../blocks/stockBlocks'
import {
	BT_HEADER_H,
	BT_MIN_H,
	BT_MIN_W,
	BT_REGION_PAD,
	btControlLabel,
	btControlTone,
	btGlyphFor,
	btLeafBlockType,
	btLeafIcon,
	isBtControlNode,
	sceneExtent,
	type BehaviorTreeShapeProps,
	type BtChildRole,
	type BtControlShape,
	type BtPoint,
	type BtRect,
	type BtScene,
	type BtSceneEdge,
} from './behaviorTreeModel'
import { controlShapeSize } from './BtControlShapeUtil'
import { layoutBlackboard, type BtAccessDirection } from './blackboardLayout'
import { isAncestorPath, isBtNodeDisabled, parseBehaviorTreeXml, selectTree, type BtDocument, type BtNode, type BtTree } from './btcppXml'
import { analyzeDataflow, type BtDataflow } from './dataflow'
import { layoutProcess } from './processLayout'
import { layoutTree } from './treeLayout'

export interface BtDesiredChild {
	/** Identity: the node path, `key:name`, or `unbundle`. */
	path: string
	role: BtChildRole
	type: 'block' | 'behaviorTreeControl'
	/** Region-local. */
	x: number
	y: number
	/** Shape-level opacity; commented-out subtrees dim to `BT_DISABLED_OPACITY`. */
	opacity?: number
	props: BlockShapeProps | BtControlShape['props']
	node?: BtNode
}

/**
 * How a commented-out node paints. Shape-level opacity rather than a CSS
 * class so a projected Block, a control card, Tree and Process views all dim
 * identically without each face growing a disabled variant.
 */
export const BT_DISABLED_OPACITY = 0.35

export interface BtDesiredCable {
	path: string
	fromPath: string
	fromPort: string
	toPath: string
	toPort: string
}

export interface BtProjectionResult {
	document: BtDocument
	tree: BtTree | null
	scene: BtScene
	dataflow: BtDataflow | null
	children: BtDesiredChild[]
	cables: BtDesiredCable[]
	/** Where scene (0,0) sits in region-local coordinates. */
	origin: BtPoint
	size: { w: number; h: number }
	/** Region-local rectangle of each drawn node, by path. */
	nodeRects: Map<string, BtRect>
}

const projectionMemo = new WeakMap<BehaviorTreeShapeProps, BtProjectionResult>()

export function projectBehaviorTree(props: BehaviorTreeShapeProps): BtProjectionResult {
	const memoized = projectionMemo.get(props)
	if (memoized) return memoized
	const projection = computeProjection(props)
	projectionMemo.set(props, projection)
	return projection
}

/** Port ids on a projected Block: the XML port name behind a direction prefix. */
export const BT_IN_PORT = 'in:'
export const BT_OUT_PORT = 'out:'

function leafPorts(node: BtNode): { inputs: BlockPort[]; outputs: BlockPort[] } {
	const inputs: BlockPort[] = []
	const outputs: BlockPort[] = []
	for (const binding of node.ports) {
		const type = binding.type
		if (binding.direction !== 'output') {
			inputs.push({ id: `${BT_IN_PORT}${binding.name}`, name: binding.name, type, visible: true, defaultValue: binding.value })
		}
		if (binding.direction === 'output' || binding.direction === 'inout') {
			outputs.push({ id: `${BT_OUT_PORT}${binding.name}`, name: binding.name, type, visible: true })
		}
	}
	return { inputs, outputs }
}

function leafBlockProps(node: BtNode, rect: BtRect, face: 'simple' | 'port'): BlockShapeProps {
	const base = getDefaultBlockProps()
	const ports = face === 'port' ? leafPorts(node) : { inputs: [], outputs: [] }
	const views = { ...base.views, simple: { w: rect.w, h: rect.h }, port: { w: rect.w, h: rect.h } }
	return {
		...base,
		w: rect.w,
		h: rect.h,
		title: node.label,
		description: node.reserved.find(([name]) => name === '_description')?.[1] ?? '',
		blockType: btLeafBlockType(node),
		icon: btLeafIcon(node),
		view: face,
		views,
		showDescription: false,
		portLayout: 'inline',
		inputs: ports.inputs,
		outputs: ports.outputs,
		definitionKey: node.kind === 'subtree' ? `subtree:${node.subtreeId ?? ''}` : `bt:${node.id}`,
	}
}

function computeProjection(props: BehaviorTreeShapeProps): BtProjectionResult {
	const document = parseBehaviorTreeXml(props.xml)
	const tree = selectTree(document, props.treeId)
	const lens = props.dataLens
	// Direct cables need ports to land on; the Dataflow lens therefore reads
	// with the port face, and left-to-right, whatever the stored choices say.
	const nodeFace = lens === 'dataflow' ? 'port' : props.nodeFace
	const orientation = lens === 'dataflow' ? 'right' : props.orientation
	const layoutOptions = { orientation, nodeFace, controlFace: props.controlFace, offsets: props.offsets }
	const emptyTree: BtTree = { id: props.treeId, root: null, nodes: [] }
	const scene = props.projection === 'process'
		? layoutProcess(tree ?? emptyTree, layoutOptions)
		: layoutTree(tree ?? emptyTree, { ...layoutOptions, edgeStyle: props.edgeStyle })

	let dataflow: BtDataflow | null = null
	const cables: BtDesiredCable[] = []
	const measurePill = (label: string, type: string) => valueBlockSize(valueBlockLabel(keyPillProps(label, type)))
	if (lens === 'blackboard' && tree) {
		const anchor = (path: string, _portName: string, direction: BtAccessDirection): BtPoint | null => (
			nodeFace === 'port' ? portAnchor(scene, path, direction) : null
		)
		const result = layoutBlackboard(scene, tree, { layout: props.blackboardLayout, orientation, anchor, measurePill })
		scene.keys = result.keys
		scene.edges = [...scene.edges, ...result.edges]
	} else if (lens === 'dataflow' && tree) {
		dataflow = analyzeDataflow(tree)
		for (const edge of dataflow.direct) {
			cables.push({
				path: `cable:${edge.fromPath}:${edge.fromPort}→${edge.toPath}:${edge.toPort}`,
				fromPath: edge.fromPath,
				fromPort: `${BT_OUT_PORT}${edge.fromPort}`,
				toPath: edge.toPath,
				toPort: `${BT_IN_PORT}${edge.toPort}`,
			})
		}
		// Keys that stay on the board: residual pills placed with the rail rule.
		const residualTree: BtTree = {
			...tree,
			nodes: tree.nodes.map((node) => ({
				...node,
				ports: node.ports.filter((binding) => binding.key && dataflow!.residualKeys.includes(`${binding.global ? '@' : ''}${binding.key}`)),
			})),
		}
		const result = layoutBlackboard(scene, residualTree, {
			layout: 'rail',
			orientation,
			anchor: (path, _port, direction) => portAnchor(scene, path, direction),
			measurePill,
		})
		scene.keys = result.keys
		scene.edges = [...scene.edges, ...result.edges]
	}
	scene.bounds = sceneExtent(scene)

	const origin: BtPoint = { x: BT_REGION_PAD - scene.bounds.x, y: BT_HEADER_H + BT_REGION_PAD - scene.bounds.y }
	const children: BtDesiredChild[] = []
	const nodeRects = new Map<string, BtRect>()
	// WHY the whole subtree dims, not just the flagged node: commenting out a
	// control means "this branch does not run", exactly as MoveIt Pro draws it
	// — a dimmed parent over full-strength children would read as live.
	const disabledRoots = (tree?.nodes ?? []).filter(isBtNodeDisabled).map((node) => node.path)
	const dimmed = (path: string) => disabledRoots.some((root) => isAncestorPath(root, path))
	for (const entry of scene.nodes) {
		const rect = { ...entry.rect, x: entry.rect.x + origin.x, y: entry.rect.y + origin.y }
		nodeRects.set(entry.path, rect)
		const opacity = dimmed(entry.path) ? BT_DISABLED_OPACITY : undefined
		if (entry.role === 'control' || isBtControlNode(entry.node)) {
			const label = btControlLabel(entry.node)
			const size = controlShapeSize(props.controlFace, label)
			children.push({
				path: entry.path,
				role: 'node',
				type: 'behaviorTreeControl',
				x: rect.x,
				y: rect.y,
				opacity,
				node: entry.node,
				props: {
					w: size.w,
					h: size.h,
					label,
					glyph: btGlyphFor(entry.node),
					face: props.controlFace,
					tone: btControlTone(entry.node.kind),
					orientation,
				},
			})
			continue
		}
		children.push({ path: entry.path, role: 'node', type: 'block', x: rect.x, y: rect.y, opacity, node: entry.node, props: leafBlockProps(entry.node, rect, nodeFace) })
	}
	for (const key of scene.keys) {
		const rect = { ...key.rect, x: key.rect.x + origin.x, y: key.rect.y + origin.y }
		const pill = keyPillProps(key.label, key.type)
		const typed: BlockShapeProps = { ...pill, w: rect.w, h: rect.h, views: { ...pill.views, value: { w: rect.w, h: rect.h } } }
		children.push({ path: key.path, role: 'key', type: 'block', x: rect.x, y: rect.y, props: typed })
	}
	if (dataflow && dataflow.rootInputs.length > 0) {
		// The tree's own inputs arrive through one unbundle, the way Zach drew
		// `self → unbundle → value`: one outlet per key, wired to every reader.
		const unbundle = createUnbundleProps()
		const outputs: BlockPort[] = dataflow.rootInputs.map((key, index) => ({
			id: `${BT_OUT_PORT}${key}`, name: key, type: '', visible: true, row: index + 1,
		}))
		const h = 110 + outputs.length * 44
		const rect: BtRect = { x: origin.x + scene.bounds.x - 340 - 140, y: origin.y + scene.bounds.y, w: 300, h }
		children.push({
			path: 'unbundle',
			role: 'unbundle',
			type: 'block',
			x: rect.x,
			y: rect.y,
			props: { ...unbundle, title: 'self', w: rect.w, h: rect.h, views: { ...unbundle.views, port: { w: rect.w, h: rect.h } }, outputs, inputs: unbundle.inputs.map((port) => ({ ...port, name: 'self' })) },
		})
		for (const access of dataflow.accesses) {
			if (access.direction !== 'read') continue
			const id = `${access.global ? '@' : ''}${access.key}`
			if (!dataflow.rootInputs.includes(id)) continue
			cables.push({
				path: `cable:unbundle:${id}→${access.path}:${access.portName}`,
				fromPath: 'unbundle',
				fromPort: `${BT_OUT_PORT}${id}`,
				toPath: access.path,
				toPort: `${BT_IN_PORT}${access.portName}`,
			})
		}
	}

	const childExtent = children.reduce(
		(acc, child) => ({
			minX: Math.min(acc.minX, child.x),
			minY: Math.min(acc.minY, child.y),
			maxX: Math.max(acc.maxX, child.x + child.props.w),
			maxY: Math.max(acc.maxY, child.y + child.props.h),
		}),
		{ minX: origin.x + scene.bounds.x, minY: origin.y + scene.bounds.y, maxX: origin.x + scene.bounds.x + scene.bounds.w, maxY: origin.y + scene.bounds.y + scene.bounds.h },
	)
	// Content that reaches left of the padding shifts the origin right.
	const shiftX = Math.max(0, BT_REGION_PAD - childExtent.minX)
	const shiftY = Math.max(0, BT_HEADER_H + BT_REGION_PAD - childExtent.minY)
	if (shiftX > 0 || shiftY > 0) {
		origin.x += shiftX
		origin.y += shiftY
		for (const child of children) {
			child.x += shiftX
			child.y += shiftY
		}
		for (const [path, rect] of nodeRects) nodeRects.set(path, { ...rect, x: rect.x + shiftX, y: rect.y + shiftY })
		childExtent.maxX += shiftX
		childExtent.maxY += shiftY
	}
	const size = {
		w: Math.max(BT_MIN_W, Math.ceil(childExtent.maxX + BT_REGION_PAD)),
		h: Math.max(BT_MIN_H, Math.ceil(childExtent.maxY + BT_REGION_PAD)),
	}
	return { document, tree, scene, dataflow, children, cables, origin, size, nodeRects }
}

/** A Blackboard key as a value pill: the key is the variable name, the declared type its type. */
function keyPillProps(label: string, type: string): BlockShapeProps {
	const pill = createValueBlockProps(getDefaultBlockProps(), '', label)
	return {
		...pill,
		inputs: pill.inputs.map((port) => ({ ...port, type })),
		outputs: pill.outputs.map((port) => ({ ...port, type })),
	}
}

/** A port dot on a projected Block, in scene coordinates: inputs on the left rim, outputs on the right. */
function portAnchor(scene: BtScene, path: string, direction: BtAccessDirection): BtPoint | null {
	const entry = scene.nodes.find((candidate) => candidate.path === path)
	if (!entry) return null
	const rect = entry.rect
	const ports = entry.node.ports
	const side = direction === 'write' ? 'output' : 'input'
	const rows = ports.filter((binding) => (side === 'input' ? binding.direction !== 'output' : binding.direction !== 'input'))
	// Row pitch matches the Block's port face: header 48, gap 8, rows of 44.
	const rowIndex = Math.max(0, rows.findIndex((binding) => binding.key !== null))
	const y = rect.y + 56 + 22 + rowIndex * 44
	return side === 'input' ? { x: rect.x, y } : { x: rect.x + rect.w, y }
}

/** Scene edges translated into region-local coordinates, for the painter. */
export function projectedEdges(projection: BtProjectionResult): BtSceneEdge[] {
	const { origin } = projection
	return projection.scene.edges.map((edge) => ({
		...edge,
		points: edge.points.map((point) => ({ x: point.x + origin.x, y: point.y + origin.y })),
	}))
}

export function sceneToRegion(projection: BtProjectionResult, point: BtPoint): BtPoint {
	return { x: point.x + projection.origin.x, y: point.y + projection.origin.y }
}

export function rectToRegion(projection: BtProjectionResult, rect: BtRect): BtRect {
	return { ...rect, x: rect.x + projection.origin.x, y: rect.y + projection.origin.y }
}

export type { TLShapeId }
