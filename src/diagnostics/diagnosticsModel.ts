import type { Editor, TLPageId, TLShape, TLShapeId } from 'tldraw'

import {
	isBlockShape,
	portDefaultValue,
	type BlockPort,
	type BlockShape,
} from '../blocks/blockModel'
import {
	getPortHostPort,
	isPortHostShape,
	type BlockConnectionPort,
	type PortHostShape,
} from '../blocks/connections/blockPorts'
import {
	connectionBindingIsValid,
	connectionEndpointsAreValid,
	getConnectionBindings,
	getConnectionDirection,
	type ConnectionBinding,
} from '../blocks/connections/ConnectionBindingUtil'
import {
	CONNECTION_SHAPE_TYPE,
	portPolarity,
	type BlockPortLane,
	type PortFace,
} from '../blocks/connections/connectionModel'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'

export const BOARD_DIAGNOSTIC_CODES = {
	blankBlockTitle: 'block-title.blank',
	duplicatePortId: 'port-id.duplicate',
	duplicatePortName: 'port-name.duplicate',
	unsatisfiedInput: 'input.unresolved',
	duplicateConnection: 'connection.duplicate',
	dataflowCycle: 'graph.cycle',
} as const

export type BoardDiagnosticCode =
	(typeof BOARD_DIAGNOSTIC_CODES)[keyof typeof BOARD_DIAGNOSTIC_CODES]
export type BoardDiagnosticSeverity = 'error' | 'warning' | 'info'

/**
 * A future analyzer may point at a Python span as well as a canvas shape.
 * Diagnostics stay a read model: this reference never becomes source truth.
 */
export interface BoardDiagnosticSource {
	kind: 'canvas' | 'python' | (string & {})
	label: string
	path?: string
	symbol?: string
	startLine?: number
	endLine?: number
}

/** An optional command descriptor for a future quick-fix registry. */
export interface BoardDiagnosticAction {
	id: string
	label: string
	kind?: 'quick-fix' | 'navigate' | (string & {})
}

/** One deterministic, derived problem. Nothing here is written to the board. */
export interface BoardDiagnostic {
	id: string
	code: BoardDiagnosticCode
	severity: BoardDiagnosticSeverity
	message: string
	detail: string
	pageId: TLPageId
	primaryShapeId: TLShapeId
	affectedIds: TLShapeId[]
	source?: BoardDiagnosticSource
	actions?: BoardDiagnosticAction[]
}

export interface BoardDiagnosticCounts {
	total: number
	error: number
	warning: number
	info: number
}

export interface BoardDiagnosticPageGroup {
	pageId: TLPageId
	pageName: string
	diagnostics: BoardDiagnostic[]
}

export interface BoardDiagnosticsModel {
	diagnostics: BoardDiagnostic[]
	pages: BoardDiagnosticPageGroup[]
	counts: BoardDiagnosticCounts
}

interface BoundEndpoint {
	binding: ConnectionBinding
	host: PortHostShape
	port: BlockConnectionPort
	lane: BlockPortLane
	face: PortFace
	key: string
}

interface SemanticConnection {
	shape: ConnectionShape
	pageId: TLPageId
	start: BoundEndpoint
	end: BoundEndpoint
	source: BoundEndpoint
	sink: BoundEndpoint
	canonicalPair: string
}

interface GraphEdge {
	from: TLShapeId
	to: TLShapeId
	connectionId: TLShapeId
}

const SEVERITY_ORDER: Record<BoardDiagnosticSeverity, number> = {
	error: 0,
	warning: 1,
	info: 2,
}

function diagnosticId(code: BoardDiagnosticCode, ...parts: string[]): string {
	return `systemsketch:${code}:${parts.map((part) => encodeURIComponent(part)).join(':')}`
}

function normalizedName(value: string): string {
	return value.trim().toLocaleLowerCase()
}

function endpointKey(endpoint: Pick<BoundEndpoint, 'host' | 'port' | 'face'>): string {
	return JSON.stringify([endpoint.host.id, endpoint.port.id, endpoint.face])
}

function inputKey(hostId: TLShapeId, portId: string): string {
	return JSON.stringify([hostId, portId])
}

function stableShapeSort(a: TLShape, b: TLShape): number {
	return String(a.index).localeCompare(String(b.index)) || String(a.id).localeCompare(String(b.id))
}

function uniqueShapeIds(ids: Iterable<TLShapeId>): TLShapeId[] {
	return [...new Set(ids)].sort((a, b) => String(a).localeCompare(String(b)))
}

function blockLabel(block: BlockShape): string {
	return block.props.title.trim() || 'Untitled Block'
}

function portHostLabel(host: PortHostShape): string {
	return isBlockShape(host)
		? blockLabel(host)
		: host.props.title.trim() || 'Untitled Branch'
}

function endpointLabel(endpoint: BoundEndpoint): string {
	return `${portHostLabel(endpoint.host)} · ${endpoint.port.name.trim() || endpoint.port.id}`
}

function resolveEndpoint(
	editor: Editor,
	binding: ConnectionBinding | undefined,
): BoundEndpoint | null {
	if (!binding || !connectionBindingIsValid(editor, binding)) return null
	const host = editor.getShape(binding.toId)
	if (!isPortHostShape(host)) return null
	const port = getPortHostPort(editor, host, binding.props.portId)
	if (!port) return null
	const endpoint: BoundEndpoint = {
		binding,
		host,
		port,
		lane: port.side,
		face: binding.props.face,
		key: '',
	}
	endpoint.key = endpointKey(endpoint)
	return endpoint
}

function inspectConnection(
	editor: Editor,
	shape: ConnectionShape,
	pageId: TLPageId,
): {
	semantic: SemanticConnection | null
	transientSink: BoundEndpoint | null
} {
	const bindings = getConnectionBindings(editor, shape)
	const start = resolveEndpoint(editor, bindings.start)
	const end = resolveEndpoint(editor, bindings.end)

	// A one-ended cable is a normal pointer gesture, not a board problem. Its
	// anchored sink is treated as temporarily occupied so the input warning does
	// not flash underneath the user's pointer.
	if (!bindings.start || !bindings.end) {
		const only = start ?? end
		return {
			semantic: null,
			transientSink: only && portPolarity(only.lane, only.face) === 'sink' ? only : null,
		}
	}
	if (!start || !end || !connectionEndpointsAreValid(editor, shape)) {
		return { semantic: null, transientSink: null }
	}

	const direction = getConnectionDirection(editor, shape)
	const source = direction.sourceTerminal === 'start' ? start : end
	const sink = direction.sinkTerminal === 'start' ? start : end
	const canonicalPair = [start.key, end.key].sort().join('\u2194')
	return {
		semantic: { shape, pageId, start, end, source, sink, canonicalPair },
		transientSink: null,
	}
}

function addBlockDiagnostics(
	diagnostics: BoardDiagnostic[],
	block: BlockShape,
	pageId: TLPageId,
	occupiedInputs: ReadonlySet<string>,
): void {
	const label = blockLabel(block)
	if (block.props.title.trim() === '') {
		diagnostics.push({
			id: diagnosticId(BOARD_DIAGNOSTIC_CODES.blankBlockTitle, block.id),
			code: BOARD_DIAGNOSTIC_CODES.blankBlockTitle,
			severity: 'warning',
			message: 'Block has no title',
			detail: 'Name this Block so the board and its diagnostics can identify it.',
			pageId,
			primaryShapeId: block.id,
			affectedIds: [block.id],
		})
	}

	const ports = [
		...block.props.inputs.map((port) => ({ lane: 'input' as const, port })),
		...block.props.outputs.map((port) => ({ lane: 'output' as const, port })),
	]
	const byId = new Map<string, typeof ports>()
	for (const entry of ports) {
		const found = byId.get(entry.port.id) ?? []
		found.push(entry)
		byId.set(entry.port.id, found)
	}
	const duplicatePortIds = new Set(
		[...byId].filter(([, duplicates]) => duplicates.length > 1).map(([id]) => id),
	)
	for (const [id, duplicates] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
		if (duplicates.length < 2) continue
		const lanes = duplicates.map(({ lane }) => lane).join(', ')
		diagnostics.push({
			id: diagnosticId(BOARD_DIAGNOSTIC_CODES.duplicatePortId, block.id, id),
			code: BOARD_DIAGNOSTIC_CODES.duplicatePortId,
			severity: 'error',
			message: `${label} reuses port id ${id || '(blank)'}`,
			detail: `A port id is durable identity. It appears ${duplicates.length} times across: ${lanes}.`,
			pageId,
			primaryShapeId: block.id,
			affectedIds: [block.id],
		})
	}

	for (const [lane, lanePorts] of [
		['input', block.props.inputs],
		['output', block.props.outputs],
	] as const) {
		const byName = new Map<string, BlockPort[]>()
		for (const port of lanePorts) {
			const name = normalizedName(port.name)
			if (!name) continue
			const found = byName.get(name) ?? []
			found.push(port)
			byName.set(name, found)
		}
		for (const [name, duplicates] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
			if (duplicates.length < 2) continue
			diagnostics.push({
				id: diagnosticId(BOARD_DIAGNOSTIC_CODES.duplicatePortName, block.id, lane, name),
				code: BOARD_DIAGNOSTIC_CODES.duplicatePortName,
				severity: 'warning',
				message: `${label} has duplicate ${lane} name “${duplicates[0].name.trim()}”`,
				detail: `Rename one of the ${duplicates.length} ${lane} ports so diagrams and generated references stay unambiguous.`,
				pageId,
				primaryShapeId: block.id,
				affectedIds: [block.id],
			})
		}
	}

	for (const port of block.props.inputs) {
		// A Value-view Block is a literal/variable Pill. Its inlet is optional:
		// unconnected means the Pill's own literal is the source, while a cable
		// turns it into a named pass-through value. The title/literal validation
		// above still catches an empty Pill without inventing an unresolved input.
		if (block.props.view === 'value') continue
		// A duplicate durable id cannot identify which physical input a cable or
		// default belongs to. The identity error is the actionable root cause;
		// suppress derived unresolved rows until that ambiguity is repaired.
		if (duplicatePortIds.has(port.id)) continue
		if (portDefaultValue(port).trim() !== '') continue
		if (occupiedInputs.has(inputKey(block.id, port.id))) continue
		diagnostics.push({
			id: diagnosticId(BOARD_DIAGNOSTIC_CODES.unsatisfiedInput, block.id, port.id),
			code: BOARD_DIAGNOSTIC_CODES.unsatisfiedInput,
			severity: 'warning',
			message: `${label} · ${port.name.trim() || port.id || 'unnamed input'} has no value`,
			detail: 'Connect an incoming source or give this input a default value.',
			pageId,
			primaryShapeId: block.id,
			affectedIds: [block.id],
		})
	}
}

function addDuplicateConnectionDiagnostics(
	diagnostics: BoardDiagnostic[],
	connections: SemanticConnection[],
): void {
	const groups = new Map<string, SemanticConnection[]>()
	for (const connection of connections) {
		const found = groups.get(connection.canonicalPair) ?? []
		found.push(connection)
		groups.set(connection.canonicalPair, found)
	}
	for (const [pair, duplicates] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
		if (duplicates.length < 2) continue
		duplicates.sort((a, b) => stableShapeSort(a.shape, b.shape))
		const first = duplicates[0]
		const affectedIds = uniqueShapeIds([
			...duplicates.map(({ shape }) => shape.id),
			first.start.host.id,
			first.end.host.id,
		])
		diagnostics.push({
			id: diagnosticId(BOARD_DIAGNOSTIC_CODES.duplicateConnection, pair),
			code: BOARD_DIAGNOSTIC_CODES.duplicateConnection,
			severity: 'warning',
			message: `Duplicate cable: ${endpointLabel(first.source)} \u2192 ${endpointLabel(first.sink)}`,
			detail: `${duplicates.length} semantic cables join the same two port faces. Keep one and remove the rest.`,
			pageId: first.pageId,
			primaryShapeId: first.shape.id,
			affectedIds,
		})
	}
}

/** Deterministic strongly connected components over imported outer-face flow. */
function stronglyConnectedComponents(edges: GraphEdge[]): TLShapeId[][] {
	const adjacency = new Map<TLShapeId, TLShapeId[]>()
	for (const edge of edges) {
		const found = adjacency.get(edge.from) ?? []
		found.push(edge.to)
		adjacency.set(edge.from, found)
		if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
	}
	for (const targets of adjacency.values()) {
		targets.sort((a, b) => String(a).localeCompare(String(b)))
	}

	let nextIndex = 0
	const index = new Map<TLShapeId, number>()
	const lowLink = new Map<TLShapeId, number>()
	const stack: TLShapeId[] = []
	const onStack = new Set<TLShapeId>()
	const components: TLShapeId[][] = []

	const visit = (node: TLShapeId) => {
		index.set(node, nextIndex)
		lowLink.set(node, nextIndex)
		nextIndex += 1
		stack.push(node)
		onStack.add(node)

		for (const target of adjacency.get(node) ?? []) {
			if (!index.has(target)) {
				visit(target)
				lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(target)!))
			} else if (onStack.has(target)) {
				lowLink.set(node, Math.min(lowLink.get(node)!, index.get(target)!))
			}
		}

		if (lowLink.get(node) !== index.get(node)) return
		const component: TLShapeId[] = []
		let member: TLShapeId
		do {
			member = stack.pop()!
			onStack.delete(member)
			component.push(member)
		} while (member !== node)
		component.sort((a, b) => String(a).localeCompare(String(b)))
		components.push(component)
	}

	for (const node of [...adjacency.keys()].sort((a, b) => String(a).localeCompare(String(b)))) {
		if (!index.has(node)) visit(node)
	}
	return components.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

function addCycleDiagnostics(
	editor: Editor,
	diagnostics: BoardDiagnostic[],
	connections: SemanticConnection[],
): void {
	const outer = connections.filter((connection) => (
		connection.source.face === 'outer' && connection.sink.face === 'outer'
	))
	const edges: GraphEdge[] = outer.map((connection) => ({
		from: connection.source.host.id,
		to: connection.sink.host.id,
		connectionId: connection.shape.id,
	}))
	for (const component of stronglyConnectedComponents(edges)) {
		const members = new Set(component)
		const cyclicEdges = edges.filter((edge) => members.has(edge.from) && members.has(edge.to))
		const isSelfCycle = component.length === 1
			&& cyclicEdges.some((edge) => edge.from === edge.to)
		if (component.length < 2 && !isSelfCycle) continue
		const primaryShapeId = component[0]
		const pageId = editor.getAncestorPageId(primaryShapeId)
		if (!pageId) continue
		const names = component.map((id) => {
			const shape = editor.getShape(id)
			return isPortHostShape(shape) ? portHostLabel(shape) : String(id)
		})
		diagnostics.push({
			id: diagnosticId(BOARD_DIAGNOSTIC_CODES.dataflowCycle, ...component),
			code: BOARD_DIAGNOSTIC_CODES.dataflowCycle,
			severity: 'error',
			message: `Imported dataflow cycle across ${component.length} Blocks`,
			detail: `${names.join(' \u2192 ')} forms a loop. SystemSketch prevents new loops, but imported records can still contain one.`,
			pageId,
			primaryShapeId,
			affectedIds: uniqueShapeIds([
				...component,
				...cyclicEdges.map((edge) => edge.connectionId),
			]),
		})
	}
}

/**
 * Build the local Problems view from the current editor state.
 *
 * The analyzer never mutates records, never persists findings, and deliberately
 * ignores incomplete connection gestures. Fixing the board removes a finding.
 */
export function getBoardDiagnosticsModel(editor: Editor): BoardDiagnosticsModel {
	const pages = editor.getPages()
	const pageOrder = new Map(pages.map((page, index) => [page.id, index]))
	const pageName = new Map(pages.map((page) => [page.id, page.name.trim() || 'Untitled page']))
	const shapesByPage = new Map<TLPageId, TLShape[]>()
	for (const page of pages) {
		const shapes = [...editor.getPageShapeIds(page)]
			.map((id) => editor.getShape(id))
			.filter((shape): shape is TLShape => Boolean(shape))
			.sort(stableShapeSort)
		shapesByPage.set(page.id, shapes)
	}

	const connections: SemanticConnection[] = []
	const transientlyOccupiedInputs = new Set<string>()
	for (const page of pages) {
		for (const shape of shapesByPage.get(page.id) ?? []) {
			if (shape.type !== CONNECTION_SHAPE_TYPE) continue
			const inspected = inspectConnection(editor, shape as ConnectionShape, page.id)
			if (inspected.semantic) connections.push(inspected.semantic)
			const transient = inspected.transientSink
			if (transient?.lane === 'input') {
				transientlyOccupiedInputs.add(inputKey(transient.host.id, transient.port.id))
			}
		}
	}

	const occupiedInputs = new Set(transientlyOccupiedInputs)
	for (const connection of connections) {
		if (connection.sink.lane === 'input') {
			occupiedInputs.add(inputKey(connection.sink.host.id, connection.sink.port.id))
		}
	}

	const diagnostics: BoardDiagnostic[] = []
	for (const page of pages) {
		for (const shape of shapesByPage.get(page.id) ?? []) {
			if (isBlockShape(shape)) addBlockDiagnostics(diagnostics, shape, page.id, occupiedInputs)
		}
	}
	addDuplicateConnectionDiagnostics(diagnostics, connections)
	addCycleDiagnostics(editor, diagnostics, connections)

	diagnostics.sort((a, b) => (
		(pageOrder.get(a.pageId) ?? Number.MAX_SAFE_INTEGER)
			- (pageOrder.get(b.pageId) ?? Number.MAX_SAFE_INTEGER)
		|| SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
		|| a.code.localeCompare(b.code)
		|| String(a.primaryShapeId).localeCompare(String(b.primaryShapeId))
		|| a.id.localeCompare(b.id)
	))

	const counts: BoardDiagnosticCounts = { total: diagnostics.length, error: 0, warning: 0, info: 0 }
	for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1
	const groupedPages: BoardDiagnosticPageGroup[] = pages.flatMap((page) => {
		const found = diagnostics.filter((diagnostic) => diagnostic.pageId === page.id)
		return found.length > 0
			? [{ pageId: page.id, pageName: pageName.get(page.id)!, diagnostics: found }]
			: []
	})

	// A defensive group for a malformed editor projection: valid diagnostics
	// normally always point at one of editor.getPages().
	for (const pageId of new Set(diagnostics.map((diagnostic) => diagnostic.pageId))) {
		if (pageOrder.has(pageId)) continue
		groupedPages.push({
			pageId,
			pageName: 'Unknown page',
			diagnostics: diagnostics.filter((diagnostic) => diagnostic.pageId === pageId),
		})
	}

	return { diagnostics, pages: groupedPages, counts }
}

const CAMERA_ANIMATION = { duration: 220 }

/** Select and fit every live shape implicated by one Problems row. */
export function focusBoardDiagnostic(editor: Editor, diagnostic: BoardDiagnostic): boolean {
	if (!editor.getPage(diagnostic.pageId)) return false
	const primary = editor.getShape(diagnostic.primaryShapeId)
	if (!primary || editor.getAncestorPageId(primary) !== diagnostic.pageId) return false
	const implicated = uniqueShapeIds([
		diagnostic.primaryShapeId,
		...diagnostic.affectedIds,
	]).filter((id) => (
		editor.getShape(id) !== undefined && editor.getAncestorPageId(id) === diagnostic.pageId
	))
	if (implicated.length === 0) return false

	editor.setCurrentPage(diagnostic.pageId)
	editor.setCurrentTool('select')
	editor.select(...implicated)
	editor.zoomToSelection({ animation: CAMERA_ANIMATION })
	return true
}
