/**
 * Organize nodes — choose Block positions with ELK as a one-shot command.
 *
 * The command follows the mature PyBlocks contract: two or more selected
 * Blocks make the selection the scope; otherwise the whole page is organized.
 * Only connections wholly inside that scope inform ELK. The result is placed
 * back at the input bounds' top-left, leaving the board's chosen region stable.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockShape } from '../blockModel'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'
import { organizeGraph, type OrganizeGraphEdge } from './organizeGraph'

export interface OrganizeNodesOutcome {
	moved: number
	unchanged: number
	edges: number
	scope: 'all' | 'selection'
}

export const EMPTY_ORGANIZE_NODES_OUTCOME: OrganizeNodesOutcome = {
	moved: 0,
	unchanged: 0,
	edges: 0,
	scope: 'all',
}

export function describeOrganizeNodesOutcome(outcome: OrganizeNodesOutcome): string {
	if (outcome.moved === 0) return 'Nodes are already organized'
	const where = outcome.scope === 'selection' ? ' in the selection' : ''
	return `Organized ${outcome.moved} node${outcome.moved === 1 ? '' : 's'}${where}`
}

export interface OrganizeNodesOptions {
	scope?: 'all' | 'selection'
}

export async function organizeNodes(
	editor: Editor,
	options: OrganizeNodesOptions = {},
): Promise<OrganizeNodesOutcome> {
	const allNodes = editor.getCurrentPageShapes().filter(isBlockShape)
	const selectedIds = new Set(editor.getSelectedShapeIds())
	const selectedNodes = allNodes.filter((shape) => selectedIds.has(shape.id))
	const scope = options.scope ?? (selectedNodes.length >= 2 ? 'selection' : 'all')
	const nodes = scope === 'selection' ? selectedNodes : allNodes
	if (nodes.length < 2) return { ...EMPTY_ORGANIZE_NODES_OUTCOME, scope }

	const bounds = nodes.map((shape) => ({ shape, box: editor.getShapePageBounds(shape.id) }))
	if (bounds.some((entry) => !entry.box)) return { ...EMPTY_ORGANIZE_NODES_OUTCOME, scope }
	const ids = new Set(nodes.map((shape) => shape.id))
	const edges = collectOrganizeEdges(editor, ids)
	const organized = await organizeGraph(
		bounds.map(({ shape, box }) => ({
			id: shape.id,
			x: box!.minX,
			y: box!.minY,
			width: box!.width,
			height: box!.height,
		})),
		edges,
	)
	const placed = new Map(organized.nodes.map((node) => [node.id, node]))

	const edits: { id: TLShapeId; type: typeof BLOCK_SHAPE_TYPE; x: number; y: number }[] = []
	let unchanged = 0
	for (const { shape, box } of bounds) {
		const target = placed.get(shape.id)
		if (!target) continue
		const nextX = shape.x + target.x - box!.minX
		const nextY = shape.y + target.y - box!.minY
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
	return { moved: edits.length, unchanged, edges: edges.length, scope }
}

function collectOrganizeEdges(editor: Editor, ids: Set<TLShapeId>): OrganizeGraphEdge[] {
	const edges: OrganizeGraphEdge[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.type !== CONNECTION_SHAPE_TYPE) continue
		const bindings = editor.getBindingsFromShape(shape as TLShape, 'connection')
		const start = bindings.find((binding) => (
			binding.props as { terminal?: string }
		).terminal === 'start')
		const end = bindings.find((binding) => (
			binding.props as { terminal?: string }
		).terminal === 'end')
		if (!start || !end || !ids.has(start.toId) || !ids.has(end.toId)) continue
		edges.push({ id: shape.id, source: start.toId, target: end.toId })
	}
	return edges
}
