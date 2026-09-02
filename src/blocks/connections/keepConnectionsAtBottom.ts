/**
 * Cables paint under Blocks, per parent.
 *
 * A cable that crosses over a Block's face reads as a wire lying on top of it
 * rather than one running behind it, and inside an Expanded Block that is the
 * difference between legible internal wiring and a tangle. tldraw orders by
 * fractional index within a parent, so the rule is enforced per parent, on every
 * completed operation, rather than at creation time — reparenting a cable into a
 * frame has to re-settle it too.
 */
import {
	getIndexBetween,
	getIndicesBetween,
	type Editor,
	type TLParentId,
} from 'tldraw'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'

export function keepConnectionsAtBottom(editor: Editor) {
	let pendingChangedParentIds = new Set<TLParentId>()

	editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source === 'remote') return
		pendingChangedParentIds.add(shape.parentId)
	})
	editor.sideEffects.registerAfterChangeHandler('shape', (oldShape, newShape, source) => {
		if (source === 'remote') return
		if (oldShape.parentId === newShape.parentId && oldShape.index === newShape.index) return
		pendingChangedParentIds.add(newShape.parentId)
	})

	editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pendingChangedParentIds.size === 0) return

		const changedParentIds = pendingChangedParentIds
		pendingChangedParentIds = new Set()

		const updates = []

		for (const parentId of changedParentIds) {
			const childIds = editor.getSortedChildIdsForParent(parentId)

			let i = childIds.length - 1
			let highestConnectionIndex = null
			let nextIndexAboveHighestConnectionIndex = null
			for (; i >= 0; i--) {
				const child = editor.getShape(childIds[i])
				if (!child) continue

				if (child.type === CONNECTION_SHAPE_TYPE) {
					highestConnectionIndex = child.index
					break
				} else {
					nextIndexAboveHighestConnectionIndex = child.index
				}
			}

			const shapesToMove = []
			for (; i >= 0; i--) {
				const child = editor.getShape(childIds[i])
				if (!child) continue

				if (child.type !== CONNECTION_SHAPE_TYPE) {
					shapesToMove.push(child)
				}
			}

			shapesToMove.reverse()

			const newIndexes = getIndicesBetween(
				highestConnectionIndex,
				nextIndexAboveHighestConnectionIndex,
				shapesToMove.length
			)

			for (let i = 0; i < shapesToMove.length; i++) {
				const shape = shapesToMove[i]
				const newIndex = newIndexes[i]
				updates.push({
					id: shape.id,
					type: shape.type,
					index: newIndex,
				} as const)
			}
		}

		// Nothing to move is the common case — a created cable is already at
		// the bottom — and an empty update still opens a transaction.
		if (updates.length > 0) editor.updateShapes(updates)
	})
}

export function getNextConnectionIndex(
	editor: Editor,
	parentId: TLParentId = editor.getCurrentPageId()
) {
	const childIds = editor.getSortedChildIdsForParent(parentId)

	let prevIndex = null
	let highestConnectionIndex = null
	for (let i = childIds.length - 1; i >= 0; i--) {
		const child = editor.getShape(childIds[i])
		if (!child) continue

		if (child.type === CONNECTION_SHAPE_TYPE) {
			highestConnectionIndex = child.index
			break
		}
		prevIndex = child.index
	}

	return getIndexBetween(highestConnectionIndex, prevIndex)
}
