import { isShapeId, type Editor, type TLShape } from 'tldraw'

import { isBlockShape } from './blockModel'
import { isBranchShape } from '../branch/branchModel'
import {
	foldedUnderCaseView,
	isHiddenByFoldedArm,
	outermostFoldedLevel,
} from '../branch/branchScope'
import { getConnectionBindings } from './connections/ConnectionBindingUtil'
import { CONNECTION_SHAPE_TYPE } from './connections/connectionModel'

/**
 * A Block is an opaque leaf unless its active view is Expanded, and a Branch
 * arm is opaque while it is folded.
 *
 * tldraw's visibility callback is recursive: hiding one direct child also
 * hides that child's descendants. Internal Blocks, stock shapes and semantic
 * connections therefore follow the same rule without being deleted,
 * reparented or copied into a second visibility model.
 *
 * A cable is the one shape whose visibility is read from its ENDS rather than
 * its parent, because it lives in the scope outside the Branch. Expanded view
 * keeps a cable into a folded arm and re-attaches it at the arm's header (see
 * `branchFoldAttachPoint`); it drops only a cable wholly inside one folded
 * arm. Case view drops every cable that touches a folded arm — the open case
 * reads as one straight dataflow.
 */
export function getBlockShapeVisibility(
	shape: TLShape,
	editor: Editor,
): 'hidden' | 'inherit' {
	if (isShapeId(shape.parentId)) {
		const parent = editor.getShape(shape.parentId)
		if (isBlockShape(parent) && parent.props.view !== 'expanded') return 'hidden'
	}
	if (shape.type === CONNECTION_SHAPE_TYPE) {
		return connectionHiddenByBranch(editor, shape) ? 'hidden' : 'inherit'
	}
	if (!isShapeId(shape.parentId)) return 'inherit'
	const parent = editor.getShape(shape.parentId)
	if (isBranchShape(parent) && isHiddenByFoldedArm(editor, shape)) return 'hidden'
	return 'inherit'
}

export function connectionHiddenByBranch(editor: Editor, connection: TLShape): boolean {
	const bindings = getConnectionBindings(editor, connection.id)
	const ends = [bindings.start, bindings.end].filter((binding) => binding !== undefined)
	if (ends.length === 0) return false
	for (const binding of ends) {
		if (foldedUnderCaseView(editor, binding.toId)) return true
	}
	if (ends.length < 2) return false
	const [a, b] = ends.map((binding) => outermostFoldedLevel(editor, binding.toId))
	return a !== null && b !== null && a.branch.id === b.branch.id && a.armId === b.armId
}
