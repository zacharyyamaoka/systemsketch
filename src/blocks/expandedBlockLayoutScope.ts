import { isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { isExpandedBlockShape, isBlockShape, type BlockShape } from './blockModel'
import { isRegionShape } from './connections/connectionScope'
import { getConnectionBindings } from './connections/ConnectionBindingUtil'
import {
	CONNECTION_SHAPE_TYPE,
} from './connections/connectionModel'
import type { ConnectionShape } from './connections/ConnectionShapeUtil'

/**
 * The immediate contents owned by one selected Expanded Block.
 *
 * Connections already use their tldraw parent as their canonical scope. That
 * lets layout commands include child-to-child and boundary cables while
 * excluding exterior cables and the private contents of nested Blocks.
 */
export interface ExpandedBlockLayoutScope {
	parent: BlockShape
	childBlocks: BlockShape[]
	connections: ConnectionShape[]
}

/**
 * A cable is this Block's interior wiring when nothing but regions stands
 * between them. A cable wired inside a Loop or a Branch nested in the Block
 * parents to that region rather than to the Block itself, so a plain
 * `parentId` test used to lose it — and with it the boundary rail that tells
 * ELK where the Block's own children belong.
 */
function ownedByBlock(
	shape: TLShape,
	blockId: TLShapeId,
	byId: ReadonlyMap<string, TLShape>,
): boolean {
	let current: TLShape | undefined = shape
	while (current && isShapeId(current.parentId)) {
		if (current.parentId === blockId) return true
		const parent = byId.get(current.parentId)
		if (!isRegionShape(parent)) return false
		current = parent
	}
	return false
}

/** Resolve the deliberate one-selected-container exception to layout commands. */
export function getSelectedExpandedBlockLayoutScope(
	editor: Editor,
): ExpandedBlockLayoutScope | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1 || !isExpandedBlockShape(selected[0])) return null

	const parent = selected[0]
	const shapes = editor.getCurrentPageShapes()
	const byId = new Map(shapes.map((shape) => [shape.id as string, shape]))
	return {
		parent,
		childBlocks: shapes.filter(
			(shape): shape is BlockShape => isBlockShape(shape) && shape.parentId === parent.id,
		),
		connections: shapes.filter(
			(shape): shape is ConnectionShape => (
				shape.type === CONNECTION_SHAPE_TYPE && ownedByBlock(shape, parent.id, byId)
			),
		),
	}
}

/** A lone child is judgeable only when a boundary rail tells ELK where it belongs. */
export function expandedScopeHasBoundaryConnection(
	editor: Editor,
	scope: ExpandedBlockLayoutScope,
): boolean {
	if (scope.childBlocks.length !== 1) return false
	const childId = scope.childBlocks[0].id
	return scope.connections.some((connection) => {
		const bindings = getConnectionBindings(editor, connection)
		if (!bindings.start || !bindings.end) return false
		const pair = [bindings.start, bindings.end]
		return pair.some((binding) => binding.toId === scope.parent.id && binding.props.face === 'inner')
			&& pair.some((binding) => binding.toId === childId)
	})
}
