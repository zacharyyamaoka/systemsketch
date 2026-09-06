/**
 * The Behavior Tree region: one BT.CPP definition drawn as real Blocks.
 *
 * The region stores the canonical XML plus presentation choices. Every node
 * a person can select on the canvas is a real child shape — a Block for an
 * action, condition or SubTree, a small control shape for Sequence /
 * Fallback / Parallel / decorators, a value pill for a Blackboard key — and
 * the region itself paints only the connective tissue: Start, control wires,
 * Flowstate-style rails, groups, outcome chips, insertion targets and
 * Blackboard access edges. Nothing here is a second graph: the XML is the
 * definition, `btcppXml.ts` is the only reader, and the projection in
 * `behaviorTreeProjection.ts` recomputes the children from it.
 */
import { T, type TLShape, type TLShapeId } from 'tldraw'

import { measureBlockText } from '../blocks/layoutBlock'
import type { BtNode, BtNodeKind } from './btcppXml'

export const BEHAVIOR_TREE_SHAPE_TYPE = 'behaviorTree' as const
export const BEHAVIOR_TREE_TOOL_ID = 'behaviorTree' as const
export const BT_CONTROL_SHAPE_TYPE = 'behaviorTreeControl' as const

export const BT_PROJECTIONS = ['tree', 'process'] as const
export type BtProjection = (typeof BT_PROJECTIONS)[number]
/** `down` is top-to-bottom, `right` is left-to-right. */
export const BT_ORIENTATIONS = ['down', 'right'] as const
export type BtOrientation = (typeof BT_ORIENTATIONS)[number]
export const BT_NODE_FACES = ['simple', 'port'] as const
export type BtNodeFace = (typeof BT_NODE_FACES)[number]
export const BT_CONTROL_FACES = ['expanded', 'compact'] as const
export type BtControlFace = (typeof BT_CONTROL_FACES)[number]
export const BT_EDGE_STYLES = ['straight', 'elbow', 'curved', 'slanted'] as const
export type BtEdgeStyle = (typeof BT_EDGE_STYLES)[number]
export const BT_DATA_LENSES = ['none', 'blackboard', 'dataflow'] as const
export type BtDataLens = (typeof BT_DATA_LENSES)[number]
export const BT_BLACKBOARD_LAYOUTS = ['table', 'rail', 'pytrees'] as const
export type BtBlackboardLayout = (typeof BT_BLACKBOARD_LAYOUTS)[number]
export const BT_ARRANGEMENTS = ['tidy', 'free'] as const
export type BtArrangement = (typeof BT_ARRANGEMENTS)[number]

export const BtOffset = T.object({ dx: T.number, dy: T.number })
export type BtOffset = T.TypeOf<typeof BtOffset>

export const BEHAVIOR_TREE_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	/** The region's header: the tree ID by default. */
	title: T.string,
	/** The canonical BT.CPP v4 document. Never rewritten except by a semantic edit. */
	xml: T.string,
	/** Which `<BehaviorTree ID>` this region projects; '' means the main tree. */
	treeId: T.string,
	projection: T.literalEnum(...BT_PROJECTIONS),
	orientation: T.literalEnum(...BT_ORIENTATIONS),
	nodeFace: T.literalEnum(...BT_NODE_FACES),
	controlFace: T.literalEnum(...BT_CONTROL_FACES),
	edgeStyle: T.literalEnum(...BT_EDGE_STYLES),
	dataLens: T.literalEnum(...BT_DATA_LENSES),
	blackboardLayout: T.literalEnum(...BT_BLACKBOARD_LAYOUTS),
	arrangement: T.literalEnum(...BT_ARRANGEMENTS),
	/** 0–1: how strongly control wires paint while a data lens is on. */
	controlWireOpacity: T.number,
	/** Free-arrangement offsets per node path, presentation only. */
	offsets: T.dict(T.string, BtOffset),
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[BEHAVIOR_TREE_SHAPE_TYPE]: {
			w: number
			h: number
			title: string
			xml: string
			treeId: string
			projection: BtProjection
			orientation: BtOrientation
			nodeFace: BtNodeFace
			controlFace: BtControlFace
			edgeStyle: BtEdgeStyle
			dataLens: BtDataLens
			blackboardLayout: BtBlackboardLayout
			arrangement: BtArrangement
			controlWireOpacity: number
			offsets: Record<string, BtOffset>
		}
		[BT_CONTROL_SHAPE_TYPE]: {
			w: number
			h: number
			label: string
			glyph: BtGlyph
			face: BtControlFace
			tone: BtControlTone
			orientation: BtOrientation
		}
	}
}

export type BehaviorTreeShape = TLShape<typeof BEHAVIOR_TREE_SHAPE_TYPE>
export type BehaviorTreeShapeProps = BehaviorTreeShape['props']
export type BtControlShape = TLShape<typeof BT_CONTROL_SHAPE_TYPE>

export function isBehaviorTreeShape(shape: TLShape | null | undefined): shape is BehaviorTreeShape {
	return shape?.type === BEHAVIOR_TREE_SHAPE_TYPE
}

export function isBtControlShape(shape: TLShape | null | undefined): shape is BtControlShape {
	return shape?.type === BT_CONTROL_SHAPE_TYPE
}

/* ------------------------------- child meta -------------------------------- */

/**
 * How a projected child remembers what it stands for. Identity lives in meta
 * rather than in a map on the region so a child can be found from itself, and
 * so a structural edit re-stamps paths in place instead of recreating shapes.
 */
export const BT_META_REGION = 'btRegion'
export const BT_META_PATH = 'btPath'
export const BT_META_ROLE = 'btRole'
export type BtChildRole = 'node' | 'key' | 'unbundle' | 'cable'

export interface BtChildMeta {
	[BT_META_REGION]: string
	[BT_META_PATH]: string
	[BT_META_ROLE]: BtChildRole
}

export function btChildMeta(regionId: TLShapeId, path: string, role: BtChildRole): BtChildMeta {
	return { [BT_META_REGION]: regionId, [BT_META_PATH]: path, [BT_META_ROLE]: role }
}

export function readBtChildMeta(shape: TLShape | null | undefined): BtChildMeta | null {
	const meta = shape?.meta as Partial<BtChildMeta> | undefined
	if (!meta || typeof meta[BT_META_REGION] !== 'string' || typeof meta[BT_META_PATH] !== 'string') return null
	const role = meta[BT_META_ROLE]
	if (role !== 'node' && role !== 'key' && role !== 'unbundle' && role !== 'cable') return null
	return { [BT_META_REGION]: meta[BT_META_REGION], [BT_META_PATH]: meta[BT_META_PATH], [BT_META_ROLE]: role }
}

export const BT_KEY_PATH_PREFIX = 'key:'
export function keyPath(key: string, global: boolean): string {
	return `${BT_KEY_PATH_PREFIX}${global ? '@' : ''}${key}`
}

/* --------------------------------- glyphs ---------------------------------- */

export const BT_GLYPHS = [
	'sequence', 'sequence-reactive', 'fallback', 'fallback-reactive', 'parallel', 'branch', 'switch', 'generic',
	'inverter', 'retry', 'repeat', 'timeout', 'delay', 'force-success', 'force-failure',
	'run-once', 'keep-running', 'loop', 'precondition', 'breakpoint',
] as const
export type BtGlyph = (typeof BT_GLYPHS)[number]
export type BtControlTone = 'control' | 'decorator' | 'unknown'

/**
 * Which glyph a control or decorator wears, from its registration ID.
 *
 * WHY: `ReactiveSequence`/`ReactiveFallback` share `controlKind` with their
 * latched siblings (`Sequence`/`Fallback`) — Process-view layout treats both
 * pairs the same way — but BT.CPP's own runtime does not: `Fallback` latches
 * `current_child_idx_` across ticks (src/controls/fallback_node.cpp) and does
 * not re-check an earlier child while a later one is RUNNING, while the
 * Reactive variant re-evaluates every child from index 0 on every tick. That
 * is a real behavioral fork a person reading the tree needs to see without
 * opening the inspector, so the reactive id forks to its own glyph name here
 * rather than collapsing onto `controlKind` like everything else in this
 * switch.
 */
export function btGlyphFor(node: Pick<BtNode, 'id' | 'kind' | 'controlKind'>): BtGlyph {
	if (node.kind === 'control' || (node.kind === 'unknown' && node.controlKind)) {
		if (node.id === 'ReactiveSequence') return 'sequence-reactive'
		if (node.id === 'ReactiveFallback') return 'fallback-reactive'
		switch (node.controlKind) {
			case 'sequence': return 'sequence'
			case 'fallback': return 'fallback'
			case 'parallel': return 'parallel'
			case 'branch': return 'branch'
			case 'switch': return 'switch'
			default: return 'generic'
		}
	}
	switch (node.id) {
		case 'Inverter': return 'inverter'
		case 'RetryUntilSuccessful': return 'retry'
		case 'Repeat': return 'repeat'
		case 'Timeout': return 'timeout'
		case 'Delay': return 'delay'
		case 'ForceSuccess': return 'force-success'
		case 'ForceFailure': return 'force-failure'
		case 'RunOnce': return 'run-once'
		case 'KeepRunningUntilFailure': return 'keep-running'
		case 'Precondition': return 'precondition'
		// WHY its own glyph and not the generic decorator box: Breakpoint is a
		// debugging aid, not tree logic, and the IDE breakpoint dot is the one
		// mark every editor already taught people to read that way — see
		// docs/behavior-tree-node-survey-2026-09-05.html.
		case 'Breakpoint': return 'breakpoint'
		default: return node.id.startsWith('Loop') ? 'loop' : 'generic'
	}
}

export function btControlTone(kind: BtNodeKind): BtControlTone {
	return kind === 'control' ? 'control' : kind === 'decorator' ? 'decorator' : 'unknown'
}

/** The subtitle a leaf Block wears — Flowstate's word for an action is a skill. */
export function btLeafBlockType(node: Pick<BtNode, 'kind'>): string {
	switch (node.kind) {
		case 'action': return 'Skill'
		case 'condition': return 'Condition'
		case 'subtree': return 'Sub Tree'
		default: return 'Unknown'
	}
}

/** The curated Block icon for a leaf kind; names come from `blockIcons.tsx`. */
export function btLeafIcon(node: Pick<BtNode, 'kind'>): string {
	switch (node.kind) {
		case 'action': return 'Zap'
		case 'condition': return 'Braces'
		case 'subtree': return 'Workflow'
		default: return 'Box'
	}
}

/** A decorator's short label with its one telling parameter, e.g. `Retry ×3`. */
export function btDecoratorLabel(node: Pick<BtNode, 'id' | 'name' | 'ports'>): string {
	const value = (name: string) => node.ports.find((binding) => binding.name === name)?.value
	switch (node.id) {
		case 'RetryUntilSuccessful': return `Retry ×${value('num_attempts') ?? '?'}`
		case 'Repeat': return `Repeat ×${value('num_cycles') ?? '?'}`
		case 'Timeout': return `Timeout ${value('msec') ?? '?'} ms`
		case 'Delay': return `Delay ${value('delay_msec') ?? '?'} ms`
		case 'Inverter': return 'Invert'
		case 'ForceSuccess': return 'Force success'
		case 'ForceFailure': return 'Force failure'
		case 'RunOnce': return 'Run once'
		case 'KeepRunningUntilFailure': return 'Keep running'
		case 'Precondition': return `If ${value('if') ?? '…'}`
		default: return node.name || node.id
	}
}

/** The label on a control card: the name, else the ID split from CamelCase. */
export function btControlLabel(node: Pick<BtNode, 'id' | 'name' | 'kind' | 'ports'>): string {
	if (node.name) return node.name
	if (node.kind === 'decorator') return btDecoratorLabel(node)
	return node.id.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/* -------------------------------- geometry --------------------------------- */

export interface BtPoint { x: number; y: number }
export interface BtRect { x: number; y: number; w: number; h: number }

/**
 * Leaf Blocks in the Tree and Process views. A card is as wide as its title
 * needs at the Block's own 44px mono face (plus icon and padding), within
 * bounds; a title that still cannot fit takes a second line and the card
 * grows by one title line. The heights are the Block's simple-face arithmetic:
 * title lines × 50, an 8px top inset, and the 46px footer that carries the
 * `Skill` / `Condition` / `Sub Tree` label.
 */
export const BT_LEAF_SIMPLE_MIN_W = 300
export const BT_LEAF_SIMPLE_MAX_W = 640
export const BT_LEAF_SIMPLE_H = 112
export const BT_LEAF_TITLE_LINE_H = 50
/** Icon 40 + gap 12 + side padding 16×2, from `layoutBlock`'s simple face. */
export const BT_LEAF_SIMPLE_CHROME_W = 84
export const BT_LEAF_PORT_MIN_W = 520
export const BT_LEAF_PORT_MAX_W = 760
/** Port face: the Block's own header, row pitch and footer, from `layoutBlock`. */
export const BT_LEAF_PORT_BASE_H = 110
export const BT_LEAF_PORT_ROW_H = 44
export const BT_CONTROL_EXPANDED_H = 64
export const BT_CONTROL_EXPANDED_MIN_W = 180
export const BT_CONTROL_COMPACT = 56
export const BT_START_W = 150
export const BT_START_H = 52
/** The region's header band, matching the Branch band. */
export const BT_HEADER_H = 44
export const BT_REGION_PAD = 60
export const BT_MIN_W = 420
export const BT_MIN_H = 260

export interface BtSizeOptions {
	nodeFace: BtNodeFace
	controlFace: BtControlFace
}

/** The canvas size a node's child shape will have, before any layout. */
export function btNodeSize(node: BtNode, options: BtSizeOptions): { w: number; h: number } {
	if (node.kind === 'control' || node.kind === 'decorator' || (node.kind === 'unknown' && node.children.length > 0)) {
		if (options.controlFace === 'compact') return { w: BT_CONTROL_COMPACT, h: BT_CONTROL_COMPACT }
		const label = btControlLabel(node)
		return { w: Math.max(BT_CONTROL_EXPANDED_MIN_W, 64 + label.length * 13), h: BT_CONTROL_EXPANDED_H }
	}
	if (options.nodeFace === 'port') {
		const inputs = node.ports.filter((binding) => binding.direction !== 'output')
		const outputs = node.ports.filter((binding) => binding.direction !== 'input')
		const rows = Math.max(1, inputs.length, outputs.length)
		// The header sets the floor: 36px mono title beside a 22px icon and the
		// 18px type label on the right; a row needs both lanes' names and chips.
		const header = measureBlockText(node.label, 36, 500, 'mono') + 22 + 12 * 4 + measureBlockText(btLeafBlockType(node), 18, 400, 'sans')
		// Each lane needs its widest row whole: dot inset, name, type, value chip.
		const rowWidth = (binding: BtNode['ports'][number], withValue: boolean) => (
			24 + measureBlockText(binding.name, 18, 500, 'sans')
			+ (binding.type ? measureBlockText(binding.type, 13, 400, 'sans') + 10 : 0)
			+ (withValue && binding.value ? Math.min(88, measureBlockText(binding.value, 13, 400, 'mono') + 16) + 10 : 0)
		)
		const inLane = Math.max(0, ...inputs.map((binding) => rowWidth(binding, true)))
		const outLane = Math.max(0, ...outputs.map((binding) => rowWidth(binding, false)))
		const w = Math.min(BT_LEAF_PORT_MAX_W, Math.max(BT_LEAF_PORT_MIN_W, Math.ceil(Math.max(header, (inLane + outLane) * 1.25 + 56))))
		return { w, h: BT_LEAF_PORT_BASE_H + rows * BT_LEAF_PORT_ROW_H }
	}
	const titleWidth = measureBlockText(node.label, 44, 600, 'mono')
	const w = Math.min(BT_LEAF_SIMPLE_MAX_W, Math.max(BT_LEAF_SIMPLE_MIN_W, Math.ceil(titleWidth + BT_LEAF_SIMPLE_CHROME_W + 20)))
	const lines = Math.min(2, Math.max(1, Math.ceil(titleWidth / (w - BT_LEAF_SIMPLE_CHROME_W))))
	return { w, h: BT_LEAF_SIMPLE_H + (lines - 1) * BT_LEAF_TITLE_LINE_H }
}

export function isBtControlNode(node: Pick<BtNode, 'kind' | 'children'>): boolean {
	return node.kind === 'control' || node.kind === 'decorator' || (node.kind === 'unknown' && node.children.length > 0)
}

/* ---------------------------------- scene ---------------------------------- */

export type BtSceneNodeRole = 'leaf' | 'control'

export interface BtSceneNode {
	path: string
	node: BtNode
	rect: BtRect
	role: BtSceneNodeRole
}

export type BtEdgeKind = 'control' | 'recovery' | 'merge' | 'write' | 'read' | 'use'

export interface BtSceneEdge {
	id: string
	kind: BtEdgeKind
	points: BtPoint[]
	/**
	 * Cubic curve through the points rather than a polyline. Two shapes: the
	 * Blackboard lens's py_trees splines give the two endpoints only and let
	 * `sceneSvg` infer a bend from the reading direction; the Tree view's
	 * `curved` wire style is explicit about its own control points, giving
	 * all four — p0, c1, c2, p3 — so no heuristic has to guess the axis.
	 */
	curve?: boolean
	arrowEnd: boolean
	from?: string
	to?: string
}

export interface BtSceneRail {
	id: string
	from: BtPoint
	to: BtPoint
	kind: 'fork' | 'join'
}

export interface BtSceneGroup {
	path: string
	rect: BtRect
	title: string
}

export interface BtSceneChip {
	id: string
	rect: BtRect
	text: string
	kind: 'failure' | 'fail' | 'decorator' | 'label'
	path?: string
}

export interface BtSceneInsert {
	id: string
	at: BtPoint
	/** null: the tree is empty and this creates the root. */
	parentPath: string | null
	index: number
	kind: 'between' | 'end' | 'root' | 'empty' | 'child'
	/** Drawn at rest (Flowstate's small square) rather than only on hover. */
	persistent: boolean
}

export interface BtSceneKey {
	key: string
	global: boolean
	path: string
	rect: BtRect
	label: string
	type: string
	reads: string[]
	writes: string[]
	uses: string[]
}

export interface BtScene {
	bounds: BtRect
	nodes: BtSceneNode[]
	edges: BtSceneEdge[]
	rails: BtSceneRail[]
	groups: BtSceneGroup[]
	chips: BtSceneChip[]
	inserts: BtSceneInsert[]
	start: BtRect | null
	keys: BtSceneKey[]
}

export function emptyScene(): BtScene {
	return { bounds: { x: 0, y: 0, w: 0, h: 0 }, nodes: [], edges: [], rails: [], groups: [], chips: [], inserts: [], start: null, keys: [] }
}

export function rectCenter(rect: BtRect): BtPoint {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

export function unionRects(rects: BtRect[]): BtRect {
	if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const rect of rects) {
		minX = Math.min(minX, rect.x)
		minY = Math.min(minY, rect.y)
		maxX = Math.max(maxX, rect.x + rect.w)
		maxY = Math.max(maxY, rect.y + rect.h)
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The scene's extent including every painted element, not only nodes. */
export function sceneExtent(scene: BtScene): BtRect {
	const rects: BtRect[] = [
		...scene.nodes.map((entry) => entry.rect),
		...scene.groups.map((entry) => entry.rect),
		...scene.chips.map((entry) => entry.rect),
		...scene.keys.map((entry) => entry.rect),
	]
	if (scene.start) rects.push(scene.start)
	for (const edge of scene.edges) {
		for (const point of edge.points) rects.push({ x: point.x, y: point.y, w: 0, h: 0 })
	}
	for (const rail of scene.rails) {
		rects.push({ x: rail.from.x, y: rail.from.y, w: 0, h: 0 }, { x: rail.to.x, y: rail.to.y, w: 0, h: 0 })
	}
	for (const insert of scene.inserts) {
		if (insert.persistent) rects.push({ x: insert.at.x - 14, y: insert.at.y - 14, w: 28, h: 28 })
	}
	return unionRects(rects)
}

export function translateScene(scene: BtScene, dx: number, dy: number): BtScene {
	const move = (rect: BtRect): BtRect => ({ ...rect, x: rect.x + dx, y: rect.y + dy })
	const movePoint = (point: BtPoint): BtPoint => ({ x: point.x + dx, y: point.y + dy })
	return {
		bounds: move(scene.bounds),
		nodes: scene.nodes.map((entry) => ({ ...entry, rect: move(entry.rect) })),
		edges: scene.edges.map((entry) => ({ ...entry, points: entry.points.map(movePoint) })),
		rails: scene.rails.map((entry) => ({ ...entry, from: movePoint(entry.from), to: movePoint(entry.to) })),
		groups: scene.groups.map((entry) => ({ ...entry, rect: move(entry.rect) })),
		chips: scene.chips.map((entry) => ({ ...entry, rect: move(entry.rect) })),
		inserts: scene.inserts.map((entry) => ({ ...entry, at: movePoint(entry.at) })),
		start: scene.start ? move(scene.start) : null,
		keys: scene.keys.map((entry) => ({ ...entry, rect: move(entry.rect) })),
	}
}

/* --------------------------------- defaults --------------------------------- */

export function getDefaultBehaviorTreeProps(): BehaviorTreeShapeProps {
	return {
		w: 900,
		h: 600,
		title: '',
		xml: '',
		treeId: '',
		projection: 'tree',
		orientation: 'down',
		nodeFace: 'simple',
		controlFace: 'expanded',
		edgeStyle: 'straight',
		dataLens: 'none',
		blackboardLayout: 'rail',
		arrangement: 'tidy',
		controlWireOpacity: 1,
		offsets: {},
	}
}

export function getDefaultBtControlProps(): BtControlShape['props'] {
	return {
		w: BT_CONTROL_EXPANDED_MIN_W,
		h: BT_CONTROL_EXPANDED_H,
		label: 'Sequence',
		glyph: 'sequence',
		face: 'expanded',
		tone: 'control',
		orientation: 'down',
	}
}
