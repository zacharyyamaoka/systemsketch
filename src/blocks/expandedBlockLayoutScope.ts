import type { Editor } from 'tldraw'

import { isExpandedBlockShape, isBlockShape, type BlockShape } from './blockModel'
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

/** Resolve the deliberate one-selected-container exception to layout commands. */
export function getSelectedExpandedBlockLayoutScope(
	editor: Editor,
): ExpandedBlockLayoutScope | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1 || !isExpandedBlockShape(selected[0])) return null

	const parent = selected[0]
	const shapes = editor.getCurrentPageShapes()
	return {
		parent,
		childBlocks: shapes.filter(
			(shape): shape is BlockShape => isBlockShape(shape) && shape.parentId === parent.id,
		),
		connections: shapes.filter(
			(shape): shape is ConnectionShape => (
				shape.type === CONNECTION_SHAPE_TYPE && shape.parentId === parent.id
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
