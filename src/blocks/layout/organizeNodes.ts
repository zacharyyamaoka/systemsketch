/**
 * Organize nodes — choose Block positions with ELK as a one-shot command.
 *
 * Ordinary selections retain the original contract: two or more selected
 * Blocks move and only their internal connections inform ELK. A lone Expanded
 * Block or Loop is the deliberate container exception. Its immediate child
 * Blocks move as one scope; Expanded Blocks expose boundary ports as virtual
 * layout rails, while Loops keep their header operator out of the left/right
 * graph and arrange the body from its own child-to-child wiring.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import { BLOCK_SHAPE_TYPE, blockPortLayout, isBlockShape, type BlockShape } from '../blockModel'
import { getBlockConnectionPortPagePoint, getBlockConnectionPorts } from '../connections/blockPorts'
import { getConnectionBindings, type ConnectionBinding } from '../connections/ConnectionBindingUtil'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'
import {
	expandedScopeHasBoundaryConnection,
	getSelectedExpandedBlockLayoutScope,
	getSelectedLoopLayoutScope,
	type ExpandedBlockLayoutScope,
	type LoopLayoutScope,
} from '../expandedBlockLayoutScope'
import { layoutBlock } from '../layoutBlock'
import { loopLayout, type LoopShape } from '../../loop/loopModel'
import {
	organizeGraph,
	type OrganizeGraphEdge,
	type OrganizeGraphNode,
	type OrganizeGraphPort,
} from './organizeGraph'

export type OrganizeNodesScope = 'selection' | 'expanded-block' | 'loop'

export interface OrganizeNodesOutcome {
	moved: number
	unchanged: number
	edges: number
	scope: OrganizeNodesScope
	reason?: 'insufficient-space'
}

export const EMPTY_ORGANIZE_NODES_OUTCOME: OrganizeNodesOutcome = {
	moved: 0,
	unchanged: 0,
	edges: 0,
	scope: 'selection',
}

export function describeOrganizeNodesOutcome(outcome: OrganizeNodesOutcome): string {
	if (outcome.reason === 'insufficient-space') {
		return outcome.scope === 'loop' ? 'Not enough room inside this Loop' : 'Not enough room inside this Block'
	}
	if (outcome.moved === 0) {
		if (outcome.scope === 'expanded-block') return 'Nodes are already organized inside the Block'
		if (outcome.scope === 'loop') return 'Nodes are already organized inside the Loop'
		return 'Nodes are already organized'
	}
	const where = outcome.scope === 'expanded-block'
		? ' inside the Block'
		: outcome.scope === 'loop'
			? ' inside the Loop'
			: ' in the selection'
	return `Organized ${outcome.moved} node${outcome.moved === 1 ? '' : 's'}${where}`
}

interface OrganizeNodesTarget {
	scope: OrganizeNodesScope
	nodes: BlockShape[]
	expanded?: ExpandedBlockLayoutScope
	loop?: LoopLayoutScope
}

/** Shared applicability rule for toolbar, context menu, and command palette. */
export function canOrganizeNodes(editor: Editor): boolean {
	return getOrganizeNodesTarget(editor) !== null
}

function getOrganizeNodesTarget(editor: Editor): OrganizeNodesTarget | null {
	const expanded = getSelectedExpandedBlockLayoutScope(editor)
	if (expanded) {
		const eligible = expanded.childBlocks.length >= 2
			|| expandedScopeHasBoundaryConnection(editor, expanded)
		return eligible
			? { scope: 'expanded-block', nodes: expanded.childBlocks, expanded }
			: null
	}
	const loop = getSelectedLoopLayoutScope(editor)
	if (loop) {
		return loop.childBlocks.length >= 2
			? { scope: 'loop', nodes: loop.childBlocks, loop }
			: null
	}

	const selectedIds = new Set(editor.getSelectedShapeIds())
	const nodes = editor.getCurrentPageShapes().filter(
		(shape): shape is BlockShape => isBlockShape(shape) && selectedIds.has(shape.id),
	)
	return nodes.length >= 2 ? { scope: 'selection', nodes } : null
}

export async function organizeNodes(
	editor: Editor,
): Promise<OrganizeNodesOutcome> {
	const target = getOrganizeNodesTarget(editor)
	if (!target) return EMPTY_ORGANIZE_NODES_OUTCOME

	const bounds = target.nodes.map((shape) => ({ shape, box: editor.getShapePageBounds(shape.id) }))
	if (bounds.some((entry) => !entry.box)) {
		return { ...EMPTY_ORGANIZE_NODES_OUTCOME, scope: target.scope }
	}

	let graphNodes: OrganizeGraphNode[] = bounds.map(({ shape, box }) => ({
		id: shape.id,
		x: box!.minX,
		y: box!.minY,
		width: box!.width,
		height: box!.height,
		ports: organizePorts(shape),
		portLayout: blockPortLayout(shape.props) === 'inline' ? 'aligned' : 'offset',
	}))
	let edges: OrganizeGraphEdge[]
	let interior: PageRect | null = null

	if (target.expanded) {
		interior = expandedInteriorInPage(editor, target.expanded.parent)
		if (!interior) return { ...EMPTY_ORGANIZE_NODES_OUTCOME, scope: target.scope }
		const graph = collectExpandedOrganizeGraph(editor, target.expanded, interior)
		graphNodes = [...graphNodes, ...graph.rails]
		edges = graph.edges
	} else if (target.loop) {
		interior = loopInteriorInPage(editor, target.loop.parent)
		if (!interior) return { ...EMPTY_ORGANIZE_NODES_OUTCOME, scope: target.scope }
		edges = collectSelectedOrganizeEdges(editor, new Set(target.nodes.map((shape) => shape.id)))
	} else {
		edges = collectSelectedOrganizeEdges(editor, new Set(target.nodes.map((shape) => shape.id)))
	}

	const organized = await organizeGraph(graphNodes, edges)
	const placed = new Map(organized.nodes.map((node) => [node.id, node]))
	if (interior && !target.nodes.every((node) => {
		const placedNode = placed.get(node.id)
		return placedNode ? pageRectContains(interior!, placedNode) : false
	})) {
		return {
			moved: 0,
			unchanged: target.nodes.length,
			edges: edges.length,
			scope: target.scope,
			reason: 'insufficient-space',
		}
	}

	const edits: { id: TLShapeId; type: typeof BLOCK_SHAPE_TYPE; x: number; y: number }[] = []
	let unchanged = 0
	for (const { shape, box } of bounds) {
		const placedNode = placed.get(shape.id)
		if (!placedNode) continue
		const nextX = shape.x + placedNode.x - box!.minX
		const nextY = shape.y + placedNode.y - box!.minY
		if (Math.abs(nextX - shape.x) < 0.5 && Math.abs(nextY - shape.y) < 0.5) {
			unchanged += 1
			continue
		}
		edits.push({ id: shape.id, type: BLOCK_SHAPE_TYPE, x: nextX, y: nextY })
	}

	if (edits.length > 0) {
		editor.markHistoryStoppingPoint('organize nodes')
		editor.updateShapes<BlockShape>(edits)
	}
	return { moved: edits.length, unchanged, edges: edges.length, scope: target.scope }
}

function collectSelectedOrganizeEdges(editor: Editor, ids: Set<TLShapeId>): OrganizeGraphEdge[] {
	const edges: OrganizeGraphEdge[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== CONNECTION_SHAPE_TYPE) continue
		const bindings = editor.getBindingsFromShape<ConnectionBinding>(shape as TLShape, 'connection')
		const start = bindings.find((binding) => binding.props.terminal === 'start')
		const end = bindings.find((binding) => binding.props.terminal === 'end')
		if (!start || !end || !ids.has(start.toId) || !ids.has(end.toId)) continue
		edges.push(organizeEdge(shape.id, start, end))
	}
	return edges
}

interface PageRect {
	minX: number
	minY: number
	maxX: number
	maxY: number
	width: number
	height: number
}

interface ExpandedOrganizeGraph {
	edges: OrganizeGraphEdge[]
	rails: OrganizeGraphNode[]
}

function collectExpandedOrganizeGraph(
	editor: Editor,
	scope: ExpandedBlockLayoutScope,
	interior: PageRect,
): ExpandedOrganizeGraph {
	const childIds = new Set(scope.childBlocks.map((shape) => shape.id))
	const inputPorts = new Map<string, OrganizeGraphPort>()
	const outputPorts = new Map<string, OrganizeGraphPort>()
	const parentPorts = new Map(
		getBlockConnectionPorts(scope.parent.props, { includeHidden: true })
			.map((port) => [port.id, port]),
	)
	const inputRailId = virtualRailId(scope.parent.id, 'input')
	const outputRailId = virtualRailId(scope.parent.id, 'output')
	const edges: OrganizeGraphEdge[] = []

	for (const connection of scope.connections) {
		const bindings = getConnectionBindings(editor, connection)
		if (!bindings.start || !bindings.end) continue

		const endpoint = (binding: ConnectionBinding) => {
			if (childIds.has(binding.toId)) {
				return { nodeId: binding.toId, portId: organizePortId(binding.toId, binding.props.portId) }
			}
			if (binding.toId !== scope.parent.id || binding.props.face !== 'inner') return null
			const port = parentPorts.get(binding.props.portId)
			if (!port) return null
			const point = getBlockConnectionPortPagePoint(editor, scope.parent, port.id)
			if (!point) return null
			const graphPort: OrganizeGraphPort = {
				id: organizePortId(scope.parent.id, port.id),
				side: port.side === 'input' ? 'right' : 'left',
				x: port.side === 'input' ? 1 : 0,
				y: Math.max(0, Math.min(interior.height, point.y - interior.minY)),
			}
			const ports = port.side === 'input' ? inputPorts : outputPorts
			ports.set(graphPort.id, graphPort)
			return {
				nodeId: port.side === 'input' ? inputRailId : outputRailId,
				portId: graphPort.id,
			}
		}

		const start = endpoint(bindings.start)
		const end = endpoint(bindings.end)
		if (!start || !end || (!childIds.has(bindings.start.toId) && !childIds.has(bindings.end.toId))) continue
		edges.push({
			id: connection.id,
			source: start.nodeId,
			target: end.nodeId,
			sourcePort: start.portId,
			targetPort: end.portId,
		})
	}

	const rails: OrganizeGraphNode[] = []
	if (inputPorts.size > 0) {
		rails.push({
			id: inputRailId,
			x: interior.minX,
			y: interior.minY,
			width: 1,
			height: interior.height,
			ports: [...inputPorts.values()],
		})
	}
	if (outputPorts.size > 0) {
		rails.push({
			id: outputRailId,
			x: interior.maxX - 1,
			y: interior.minY,
			width: 1,
			height: interior.height,
			ports: [...outputPorts.values()],
		})
	}
	return { edges, rails }
}

function expandedInteriorInPage(editor: Editor, parent: BlockShape): PageRect | null {
	const frame = layoutBlock(parent.props).frameInterior
	if (!frame) return null
	const transform = editor.getShapePageTransform(parent.id)
	const a = transform.applyToPoint({ x: frame.x, y: frame.y })
	const b = transform.applyToPoint({ x: frame.x + frame.w, y: frame.y + frame.h })
	const minX = Math.min(a.x, b.x)
	const minY = Math.min(a.y, b.y)
	const maxX = Math.max(a.x, b.x)
	const maxY = Math.max(a.y, b.y)
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** The open body below a Loop's header and above its optional footer. */
function loopInteriorInPage(editor: Editor, parent: LoopShape): PageRect | null {
	const body = loopLayout(parent.props).body
	if (body.w <= 0 || body.h <= 0) return null
	const transform = editor.getShapePageTransform(parent.id)
	const a = transform.applyToPoint({ x: body.x, y: body.y })
	const b = transform.applyToPoint({ x: body.x + body.w, y: body.y + body.h })
	const minX = Math.min(a.x, b.x)
	const minY = Math.min(a.y, b.y)
	const maxX = Math.max(a.x, b.x)
	const maxY = Math.max(a.y, b.y)
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function pageRectContains(rect: PageRect, node: OrganizeGraphNode): boolean {
	const epsilon = 0.5
	return node.x >= rect.minX - epsilon
		&& node.y >= rect.minY - epsilon
		&& node.x + node.width <= rect.maxX + epsilon
		&& node.y + node.height <= rect.maxY + epsilon
}

function organizeEdge(id: string, start: ConnectionBinding, end: ConnectionBinding): OrganizeGraphEdge {
	return {
		id,
		source: start.toId,
		target: end.toId,
		sourcePort: organizePortId(start.toId, start.props.portId),
		targetPort: organizePortId(end.toId, end.props.portId),
	}
}

function virtualRailId(shapeId: TLShapeId, side: 'input' | 'output'): string {
	return `virtual:${shapeId}:${side}-rail`
}

function organizePortId(shapeId: TLShapeId, portId: string): string {
	return `${shapeId}::${portId}`
}

function organizePorts(shape: BlockShape): OrganizeGraphPort[] {
	return getBlockConnectionPorts(shape.props, { includeHidden: true }).map((port) => ({
		id: organizePortId(shape.id, port.id),
		side: port.side === 'input' ? 'left' : 'right',
		x: port.x,
		y: port.y,
	}))
}
