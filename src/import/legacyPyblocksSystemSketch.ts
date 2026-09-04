/**
 * One-way import of PyBlocks' retired React Flow SystemSketch document.
 *
 * The old golden corpus predates the tldraw-backed `.systemsketch` envelope.
 * It stored `{ version, nodes, edges, viewport, metadata }`, with semantic
 * Blocks and assertions inside `data.extension`.  Import those documents
 * through the current editor's supported shape and binding seams.  The source
 * record for each imported item is retained in tldraw `meta`: PyBlocks can
 * recover its semantic supplement after a person edits the current Block.
 */

import {
	createShapeId,
	type Editor,
	type JsonObject,
	type TLParentId,
	type TLShapeId,
} from 'tldraw'
import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	type BlockPort,
	type BlockShape,
	type BlockView,
} from '../blocks/blockModel'
import {
	createOrUpdateConnectionBinding,
	type ConnectionShape,
} from '../blocks/connections'

export const LEGACY_PYBLOCKS_META_KEY = 'pyblocks.legacySystemSketch'

export interface LegacyPyblocksSystemSketchDocument {
	version?: number
	nodes: unknown[]
	edges: unknown[]
	viewport?: { x?: unknown; y?: unknown; zoom?: unknown }
	metadata?: Record<string, unknown>
	[key: string]: unknown
}

interface LegacyPoint { x?: unknown; y?: unknown }
interface LegacySize { width?: unknown; height?: unknown }
interface LegacyPort {
	id?: unknown
	name?: unknown
	type?: unknown
	visible?: unknown
	defaultValue?: unknown
}
interface LegacyBlockExtension {
	content?: {
		title?: unknown
		inputs?: unknown
		outputs?: unknown
		type?: unknown
		description?: unknown
	}
	presentation?: {
		detail?: unknown
		simpleWidth?: unknown
		simpleHeight?: unknown
		portWidth?: unknown
		portHeight?: unknown
		expandedWidth?: unknown
		expandedHeight?: unknown
		portLayout?: unknown
		hiddenPortIds?: unknown
	}
}
interface LegacyNode {
	id?: unknown
	position?: LegacyPoint
	style?: LegacySize
	hidden?: unknown
	data?: {
		label?: unknown
		extension?: Record<string, unknown>
	}
}
interface LegacyEdge {
	id?: unknown
	source?: unknown
	target?: unknown
	sourceHandle?: unknown
	targetHandle?: unknown
	hidden?: unknown
	data?: {
		style?: { routing?: unknown }
		extension?: Record<string, unknown>
	}
}

export interface LegacyBlockPlan {
	legacyId: string
	shapeId: TLShapeId
	parentShapeId: TLParentId | null
	x: number
	y: number
	props: BlockShape['props']
	meta: JsonObject
}

export interface LegacyConnectionPlan {
	legacyId: string
	shapeId: TLShapeId
	sourceShapeId: TLShapeId
	targetShapeId: TLShapeId
	sourcePortId: string
	targetPortId: string
	sourceFace: 'outer' | 'inner'
	targetFace: 'outer' | 'inner'
	routing: ConnectionShape['props']['routing']
	meta: JsonObject
}

export interface LegacyPyblocksImportPlan {
	blocks: LegacyBlockPlan[]
	connections: LegacyConnectionPlan[]
	documentMeta: JsonObject
	viewport: { x: number; y: number; zoom: number }
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? value as Record<string, unknown>
		: null
}

function finite(value: unknown, fallback: number): number {
	const number = Number(value)
	return Number.isFinite(number) ? number : fallback
}

function positive(value: unknown, fallback: number): number {
	const number = finite(value, fallback)
	return number > 0 ? number : fallback
}

function text(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback
}

/** FNV-1a makes stable tldraw-safe ids without leaking punctuation from IR ids. */
function stableToken(value: string): string {
	let hash = 0x811c9dc5
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

export function legacyPyblocksShapeId(kind: 'block' | 'connection', legacyId: string): TLShapeId {
	return createShapeId(`legacy-${kind}-${stableToken(legacyId)}`)
}

export function parseLegacyPyblocksSystemSketch(
	source: string,
): LegacyPyblocksSystemSketchDocument | null {
	try {
		const parsed = record(JSON.parse(source))
		if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
		return parsed as unknown as LegacyPyblocksSystemSketchDocument
	} catch {
		return null
	}
}

function blockExtension(node: LegacyNode): LegacyBlockExtension | null {
	return record(node.data?.extension?.pyblocksBlock) as LegacyBlockExtension | null
}

function isSelectedFunctionBoundary(node: LegacyNode, extension: LegacyBlockExtension): boolean {
	if (text(extension.content?.type).toLowerCase() === 'boundary') return true
	const supplement = record(node.data?.extension?.pyblocksBlockView)
	const metadata = record(supplement?.metadata)
	const analysis = record(metadata?.['pyblocks.analysis'])
	if (analysis?.semanticKind === 'boundary') return true
	const ports = [
		...(Array.isArray(extension.content?.inputs) ? extension.content.inputs : []),
		...(Array.isArray(extension.content?.outputs) ? extension.content.outputs : []),
	]
	return ports.some((candidate) => text(record(candidate)?.displayRole).startsWith('boundary-'))
}

function legacyView(extension: LegacyBlockExtension): BlockView {
	const detail = text(extension.presentation?.detail).toLowerCase()
	if (detail === 'expanded') return 'expanded'
	if (detail === 'simple' || detail === 'minimal') return 'simple'
	return 'port'
}

function readPorts(value: unknown, hidden: Set<string>): BlockPort[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((candidate, index) => {
		const port = record(candidate) as LegacyPort | null
		if (!port) return []
		const id = text(port.id, `port_${index + 1}`)
		return [{
			id,
			name: text(port.name, id),
			type: text(port.type),
			visible: port.visible !== false && !hidden.has(id),
			...(typeof port.defaultValue === 'string' && port.defaultValue !== ''
				? { defaultValue: port.defaultValue }
				: {}),
		}]
	})
}

function blockProps(node: LegacyNode, extension: LegacyBlockExtension): BlockShape['props'] {
	const defaults = getDefaultBlockProps()
	const content = extension.content ?? {}
	const presentation = extension.presentation ?? {}
	const view = legacyView(extension)
	const sourceWidth = positive(node.style?.width, defaults.views[view].w)
	const sourceHeight = positive(node.style?.height, defaults.views[view].h)
	const views = {
		simple: {
			w: positive(presentation.simpleWidth, view === 'simple' ? sourceWidth : defaults.views.simple.w),
			h: positive(presentation.simpleHeight, view === 'simple' ? sourceHeight : defaults.views.simple.h),
		},
		port: {
			w: positive(presentation.portWidth, view === 'port' ? sourceWidth : defaults.views.port.w),
			h: positive(presentation.portHeight, view === 'port' ? sourceHeight : defaults.views.port.h),
		},
		expanded: {
			w: positive(presentation.expandedWidth, view === 'expanded' ? sourceWidth : defaults.views.expanded.w),
			h: positive(presentation.expandedHeight, view === 'expanded' ? sourceHeight : defaults.views.expanded.h),
		},
		value: { ...defaults.views.value },
	}
	const hiddenIds = new Set(
		Array.isArray(presentation.hiddenPortIds)
			? presentation.hiddenPortIds.filter((id): id is string => typeof id === 'string')
			: [],
	)
	const description = text(content.description)
	return {
		...defaults,
		...views[view],
		title: text(content.title, text(node.data?.label)),
		description,
		blockType: text(content.type),
		view,
		views,
		showDescription: description !== '',
		// Omission in the old adapter meant its historical default: stacked.
		portLayout: presentation.portLayout === 'inline' ? 'inline' : 'offset',
		inputs: readPorts(content.inputs, hiddenIds),
		outputs: readPorts(content.outputs, hiddenIds),
	}
}

function bounds(block: LegacyBlockPlan) {
	return {
		left: block.x,
		top: block.y,
		right: block.x + block.props.w,
		bottom: block.y + block.props.h,
	}
}

function contains(outer: ReturnType<typeof bounds>, inner: ReturnType<typeof bounds>): boolean {
	return inner.left >= outer.left && inner.top >= outer.top
		&& inner.right <= outer.right && inner.bottom <= outer.bottom
}

/** Which lane of a multi-view board one legacy node belongs to, if it says. */
function legacyLaneId(node: LegacyNode): string | null {
	const supplement = record(record(node.data)?.extension)?.pyblocksBlockView
	const stamp = record(record(supplement)?.metadata)?.['pyblocks.view']
	const id = record(stamp)?.id
	return typeof id === 'string' && id !== '' ? id : null
}

function handlePortId(handle: unknown): string {
	return text(handle).replace(/^(?:source|target):port:/, '')
}

function legacyRecordMeta(kind: 'node' | 'edge', index: number, original: unknown): JsonObject {
	return {
		[LEGACY_PYBLOCKS_META_KEY]: {
			version: 1,
			kind,
			index,
			original,
		},
	} as JsonObject
}

export function planLegacyPyblocksSystemSketch(
	document: LegacyPyblocksSystemSketchDocument,
): LegacyPyblocksImportPlan {
	const legacyNodes = document.nodes.filter((candidate) => record(candidate) !== null) as LegacyNode[]
	const blocks = legacyNodes.flatMap((legacyNode, index): LegacyBlockPlan[] => {
		const extension = blockExtension(legacyNode)
		if (!extension) return []
		const legacyId = text(legacyNode.id, `node-${index + 1}`)
		return [{
			legacyId,
			shapeId: legacyPyblocksShapeId('block', legacyId),
			parentShapeId: null,
			x: finite(legacyNode.position?.x, 0),
			y: finite(legacyNode.position?.y, 0),
			props: blockProps(legacyNode, extension),
			meta: legacyRecordMeta('node', index, legacyNode),
		}]
	})

	// The selected-function boundary owns the function's whole projected flow.
	// Generated legacy boards laid that flow beyond the old boundary rectangle,
	// so geometry alone is not enough to recover the semantic scope.
	//
	// A document can carry SEVERAL selected functions: PyBlocks stores one
	// board per *series* now, with one lane per selected view of a shared
	// source file. Each lane names itself on every block, so parent a block to
	// its own lane's boundary. Picking the first boundary for all of them
	// nested every lane inside lane one, and each later lane's two boundary
	// connections then failed to bind — measured as 37 of 75 on a 12-lane
	// board. A one-lane document has one boundary and behaves exactly as
	// before.
	const laneByLegacyId = new Map(legacyNodes.flatMap((node, index) => {
		const lane = legacyLaneId(node)
		return lane === null ? [] : [[text(node.id, `node-${index + 1}`), lane] as const]
	}))
	const boundaryByLane = new Map<string | null, LegacyBlockPlan>()
	for (const [index, node] of legacyNodes.entries()) {
		const extension = blockExtension(node)
		if (!extension || !isSelectedFunctionBoundary(node, extension)) continue
		const legacyId = text(node.id, `node-${index + 1}`)
		const plan = blocks.find((block) => block.legacyId === legacyId)
		if (!plan) continue
		const lane = laneByLegacyId.get(legacyId) ?? null
		if (!boundaryByLane.has(lane)) boundaryByLane.set(lane, plan)
	}
	const soleBoundary = boundaryByLane.size === 1
		? [...boundaryByLane.values()][0]
		: undefined

	// Other old documents encoded containment only visually. Recover the
	// smallest expanded Block that contains each child as the fallback.
	const expanded = blocks.filter((block) => block.props.view === 'expanded')
	for (const block of blocks) {
		const lane = laneByLegacyId.get(block.legacyId) ?? null
		const selectedBoundary = boundaryByLane.get(lane) ?? soleBoundary
		if (block === selectedBoundary) continue
		const parent = selectedBoundary ?? (
			block.props.view === 'expanded' ? undefined : expanded
				.filter((candidate) => contains(bounds(candidate), bounds(block)))
				.sort((left, right) => {
					const a = bounds(left)
					const b = bounds(right)
					return (a.right - a.left) * (a.bottom - a.top)
						- (b.right - b.left) * (b.bottom - b.top)
				})[0]
		)
		if (!parent) continue
		block.parentShapeId = parent.shapeId
		block.x -= parent.x
		block.y -= parent.y
	}

	const byLegacyId = new Map(blocks.map((block) => [block.legacyId, block]))
	const connections = document.edges.flatMap((candidate, index): LegacyConnectionPlan[] => {
		const edge = record(candidate) as LegacyEdge | null
		if (!edge) return []
		const source = byLegacyId.get(text(edge.source))
		const target = byLegacyId.get(text(edge.target))
		if (!source || !target) return []
		const sourcePortId = handlePortId(edge.sourceHandle)
		const targetPortId = handlePortId(edge.targetHandle)
		if (!sourcePortId || !targetPortId) return []
		const legacyId = text(edge.id, `edge-${index + 1}`)
		const rawRouting = text(edge.data?.style?.routing).toLowerCase()
		const routing = rawRouting === 'straight' || rawRouting === 'curved' ? rawRouting : 'elbow'
		return [{
			legacyId,
			shapeId: legacyPyblocksShapeId('connection', legacyId),
			sourceShapeId: source.shapeId,
			targetShapeId: target.shapeId,
			sourcePortId,
			targetPortId,
			// A boundary port uses its inner face only when the other endpoint is
			// one of that expanded Block's children.
			sourceFace: target.parentShapeId === source.shapeId ? 'inner' : 'outer',
			targetFace: source.parentShapeId === target.shapeId ? 'inner' : 'outer',
			routing,
			meta: legacyRecordMeta('edge', index, edge),
		}]
	})

	return {
		blocks,
		connections,
		documentMeta: {
			[LEGACY_PYBLOCKS_META_KEY]: {
				version: 1,
				kind: 'document',
				metadata: record(document.metadata) ?? {},
				viewport: record(document.viewport) ?? {},
			},
		} as JsonObject,
		viewport: {
			x: finite(document.viewport?.x, 0),
			y: finite(document.viewport?.y, 0),
			zoom: positive(document.viewport?.zoom, 1),
		},
	}
}

/** Import through Editor APIs so current migrations/defaults remain authoritative. */
export function importLegacyPyblocksSystemSketch(
	editor: Editor,
	document: LegacyPyblocksSystemSketchDocument,
): LegacyPyblocksImportPlan {
	const plan = planLegacyPyblocksSystemSketch(document)
	editor.store.mergeRemoteChanges(() => {
		const pageId = editor.getCurrentPageId()
		const roots = plan.blocks.filter((block) => block.parentShapeId === null)
		const children = plan.blocks.filter((block) => block.parentShapeId !== null)
		for (const batch of [roots, children]) {
			editor.createShapes<BlockShape>(batch.map((block) => ({
				id: block.shapeId,
				type: BLOCK_SHAPE_TYPE,
				parentId: block.parentShapeId ?? pageId,
				x: block.x,
				y: block.y,
				meta: block.meta,
				props: block.props,
			})))
		}

		for (const connection of plan.connections) {
			editor.createShape<ConnectionShape>({
				id: connection.shapeId,
				type: 'connection',
				x: 0,
				y: 0,
				meta: connection.meta,
				props: {
					start: { x: 0, y: 0 },
					end: { x: 100, y: 0 },
					routing: connection.routing,
					curve: null,
					pins: [],
					elbowRoute: null,
					routeMode: 'automatic',
					temporal: 'data',
					delayValue: '',
					pillPosition: 0.5,
					tunnel: false,
					tunnelLayer: '',
				},
			})
			createOrUpdateConnectionBinding(editor, connection.shapeId, connection.sourceShapeId, {
				terminal: 'start',
				portId: connection.sourcePortId,
				face: connection.sourceFace,
			})
			createOrUpdateConnectionBinding(editor, connection.shapeId, connection.targetShapeId, {
				terminal: 'end',
				portId: connection.targetPortId,
				face: connection.targetFace,
			})
		}

		const settings = editor.getDocumentSettings()
		editor.store.put([{ ...settings, meta: plan.documentMeta }])
		editor.setCamera({ x: plan.viewport.x, y: plan.viewport.y, z: plan.viewport.zoom })
	})
	return plan
}
