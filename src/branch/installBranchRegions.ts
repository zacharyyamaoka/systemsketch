/**
 * Keep every child of a Branch stamped with its arm.
 *
 * Membership is geometry — the arm whose row holds the child's top edge — but
 * geometry stops answering the moment the arm folds and its row has no body.
 * So after any completed operation that moved a child into, out of or within
 * a Branch, or changed a Branch's arms, the arm is written to the child's
 * `meta`, where the fold and the visibility rule read it back. Per parent,
 * per operation, and only when the answer changed — the same shape as
 * `keepConnectionsAtBottom`.
 */
import { isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { isBranchShape } from './branchModel'
import { stampBranchChildArms } from './branchCommands'

export function installBranchRegions(editor: Editor): () => void {
	let pending = new Set<TLShapeId>()

	const noteParent = (shape: TLShape) => {
		if (!isShapeId(shape.parentId)) return
		const parent = editor.getShape(shape.parentId)
		if (isBranchShape(parent)) pending.add(parent.id)
	}

	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'remote') return
		noteParent(shape)
	})
	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		if (source === 'remote') return
		if (before.parentId !== after.parentId || before.y !== after.y) noteParent(after)
		if (isBranchShape(after) && isBranchShape(before) && before.props.arms !== after.props.arms) {
			pending.add(after.id)
		}
	})
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pending.size === 0) return
		const branchIds = pending
		pending = new Set()
		for (const id of branchIds) {
			const branch = editor.getShape(id)
			if (isBranchShape(branch)) stampBranchChildArms(editor, branch)
		}
	})

	return () => {
		stopCreate()
		stopChange()
		stopComplete()
	}
}
