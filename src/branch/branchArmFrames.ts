import { createShapeId, isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import {
	BRANCH_ARM_META_KEY,
	branchLayout,
	isBranchShape,
	type BranchArmLayout,
	type BranchShape,
} from './branchModel'
import { branchArmIdOfChild } from './branchScope'
import {
	BRANCH_ARM_SHAPE_TYPE,
	isBranchArmShape,
	type BranchArmShape,
} from './BranchArmShapeUtil'

export interface BranchArmFrameRepair {
	created: number
	updated: number
	reparented: number
	removed: number
}

function frameBox(row: BranchArmLayout, width: number) {
	return {
		x: 0,
		y: row.rowTop,
		w: width,
		// The header is deliberately inside the frame. Descendants paint above
		// it, while the next row's top remains the clipping boundary.
		h: Math.max(1, row.bottom - row.rowTop),
	}
}

/** The live structural frame for one semantic arm, if it has been materialized. */
export function branchArmFrame(
	editor: Editor,
	branch: BranchShape,
	armId: string,
): BranchArmShape | null {
	for (const id of editor.getSortedChildIdsForParent(branch.id)) {
		const shape = editor.getShape(id)
		if (isBranchArmShape(shape) && shape.props.armId === armId) return shape
	}
	return null
}

/**
 * Make the structural tree agree with `Branch.props.arms[]`.
 *
 * This is an idempotent projection, not a second arm model. It also upgrades
 * legacy boards by moving the Branch's old direct children underneath the
 * matching helper without changing their page-space positions.
 */
export function reconcileBranchArmFrames(
	editor: Editor,
	branch: BranchShape,
): BranchArmFrameRepair {
	const result: BranchArmFrameRepair = { created: 0, updated: 0, reparented: 0, removed: 0 }
	const layout = branchLayout(branch.props)
	const rows = new Map(layout.arms.map((row) => [row.arm.id, row]))
	const direct = editor
		.getSortedChildIdsForParent(branch.id)
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => shape !== undefined)

	const keepers = new Map<string, BranchArmShape>()
	const redundant: BranchArmShape[] = []
	for (const shape of direct) {
		if (!isBranchArmShape(shape)) continue
		if (!rows.has(shape.props.armId) || keepers.has(shape.props.armId)) {
			redundant.push(shape)
			continue
		}
		keepers.set(shape.props.armId, shape)
	}

	editor.run(() => {
		for (const row of layout.arms) {
			let frame = keepers.get(row.arm.id)
			if (!frame) {
				const id = createShapeId()
				const box = frameBox(row, layout.w)
				editor.createShape<BranchArmShape>({
					id,
					type: BRANCH_ARM_SHAPE_TYPE,
					parentId: branch.id,
					x: box.x,
					y: box.y,
					props: { w: box.w, h: box.h, armId: row.arm.id },
					meta: { [BRANCH_ARM_META_KEY]: row.arm.id },
				})
				frame = editor.getShape<BranchArmShape>(id)
				if (!frame) continue
				keepers.set(row.arm.id, frame)
				result.created += 1
			}

			const box = frameBox(row, layout.w)
			const stamped = frame.meta?.[BRANCH_ARM_META_KEY]
			if (
				frame.x !== box.x
				|| frame.y !== box.y
				|| frame.props.w !== box.w
				|| frame.props.h !== box.h
				|| frame.props.armId !== row.arm.id
				|| stamped !== row.arm.id
			) {
				editor.updateShape<BranchArmShape>({
					id: frame.id,
					type: frame.type,
					x: box.x,
					y: box.y,
					props: { w: box.w, h: box.h, armId: row.arm.id },
					meta: { ...frame.meta, [BRANCH_ARM_META_KEY]: row.arm.id },
				})
				result.updated += 1
			}
		}

		// A duplicate helper is repairable: keep its content in the canonical
		// helper for that arm. A removed arm instead releases its content to the
		// Branch's own parent, matching the existing remove-arm behavior.
		for (const frame of redundant) {
			const children = editor.getSortedChildIdsForParent(frame.id)
			const keeper = keepers.get(frame.props.armId)
			if (children.length > 0) {
				editor.reparentShapes(children, keeper?.id ?? branch.parentId)
				result.reparented += children.length
			}
			editor.deleteShape(frame.id)
			result.removed += 1
		}

		// Old documents stored ordinary content directly under the Branch. The
		// membership stamp wins; geometry is the fallback, exactly as before.
		for (const child of direct) {
			if (isBranchArmShape(child) || child.type === 'connection') continue
			const armId = branchArmIdOfChild(branch, child)
			const frame = armId ? keepers.get(armId) : undefined
			if (!frame) continue
			editor.reparentShapes([child.id], frame.id)
			let current = editor.getShape(child.id)
			// The helper is an untranslated, unrotated child of the Branch. Restore
			// that exact local transform after tldraw's general matrix round-trip so
			// persistence/export does not accumulate floating-point dust.
			if (current) {
				editor.updateShape({
					id: current.id,
					type: current.type,
					x: child.x - frame.x,
					y: child.y - frame.y,
					rotation: child.rotation,
				})
				current = editor.getShape(child.id)
			}
			if (current && current.meta?.[BRANCH_ARM_META_KEY] !== armId) {
				editor.updateShape({
					id: current.id,
					type: current.type,
					meta: { ...current.meta, [BRANCH_ARM_META_KEY]: armId },
				})
			}
			result.reparented += 1
		}
	})

	return result
}

/** Put helper-owned content back under its semantic Branch before stock export. */
export function unwrapBranchArmFrames(editor: Editor, branch: BranchShape): number {
	let count = 0
	for (const id of [...editor.getSortedChildIdsForParent(branch.id)]) {
		const frame = editor.getShape(id)
		if (!isBranchArmShape(frame)) continue
		const children = editor.getSortedChildIdsForParent(frame.id)
		if (children.length > 0) {
			const local = children
				.map((childId) => editor.getShape(childId))
				.filter((shape): shape is TLShape => shape !== undefined)
			editor.reparentShapes(children, branch.id)
			editor.updateShapes(local.map((shape) => ({
				id: shape.id,
				type: shape.type,
				x: shape.x + frame.x,
				y: shape.y + frame.y,
				rotation: shape.rotation,
			})))
			count += children.length
		}
		editor.deleteShape(frame.id)
	}
	return count
}

/** Normalize a helper selection to the semantic object the user can edit. */
export function owningBranchId(editor: Editor, shapeId: TLShapeId): TLShapeId | null {
	const shape = editor.getShape(shapeId)
	if (!isBranchArmShape(shape) || !isShapeId(shape.parentId)) return null
	return isBranchShape(editor.getShape(shape.parentId)) ? shape.parentId : null
}
