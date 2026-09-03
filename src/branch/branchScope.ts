/**
 * What a Branch does to the shapes inside it, read from the tree.
 *
 * Three questions, one walk. Which arm does a shape sit in, at every Branch
 * above it? Is that arm folded — and if so, where does a cable into the shape
 * attach instead? Is that arm active — and if not, how faded is the shape?
 * All three read the LIVE records through the editor, so a computed reader
 * (`useValue`, a shape util's geometry, tldraw's visibility callback) follows a
 * fold or an activation without any listener of its own.
 */
import { Vec, isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import {
	BRANCH_ARM_META_KEY,
	BRANCH_FADE_OPACITY,
	branchArmIdForChildTop,
	branchLayout,
	isBranchShape,
	type BranchArm,
	type BranchArmLayout,
	type BranchShape,
} from './branchModel'
import { isBranchArmShape } from './BranchArmShapeUtil'

/** One level of the walk: a Branch ancestor and the arm the next shape down sits in. */
export interface BranchAncestryLevel {
	branch: BranchShape
	/** The direct child of `branch` on the path to the shape asked about. */
	child: TLShape
	armId: string | null
	arm: BranchArm | null
}

/**
 * The arm a direct child of a Branch belongs to.
 *
 * The stamped meta wins when it names a live arm — it survives a fold, when
 * the child's row has no body to be inside of. Geometry answers otherwise:
 * the arm whose row holds the child's top edge.
 */
export function branchArmIdOfChild(branch: BranchShape, child: TLShape): string | null {
	if (
		isBranchArmShape(child)
		&& branch.props.arms.some((arm) => arm.id === child.props.armId)
	) return child.props.armId
	const stamped = child.meta?.[BRANCH_ARM_META_KEY]
	if (typeof stamped === 'string' && branch.props.arms.some((arm) => arm.id === stamped)) {
		return stamped
	}
	return branchArmIdForChildTop(branch.props, child.y)
}

/** Every Branch above a shape, outermost first, with the arm taken at each. */
export function branchAncestry(editor: Editor, shapeId: TLShapeId): BranchAncestryLevel[] {
	const levels: BranchAncestryLevel[] = []
	let child = editor.getShape(shapeId)
	while (child && isShapeId(child.parentId)) {
		const parent = editor.getShape(child.parentId)
		if (!parent) break
		if (isBranchShape(parent)) {
			const armId = branchArmIdOfChild(parent, child)
			levels.push({
				branch: parent,
				child,
				armId,
				arm: armId ? parent.props.arms.find((arm) => arm.id === armId) ?? null : null,
			})
		}
		child = parent
	}
	return levels.reverse()
}

/** The outermost folded arm on the way down to a shape, if any. */
export function outermostFoldedLevel(editor: Editor, shapeId: TLShapeId): BranchAncestryLevel | null {
	for (const level of branchAncestry(editor, shapeId)) {
		if (level.arm && !level.arm.open) return level
	}
	return null
}

/** Does any folded arm on the way down sit in a Branch showing Case view? */
export function foldedUnderCaseView(editor: Editor, shapeId: TLShapeId): boolean {
	return branchAncestry(editor, shapeId).some((level) => (
		level.arm !== null && !level.arm.open && level.branch.props.view === 'case'
	))
}

/**
 * Where a cable into or out of a shape attaches once an arm above it folds:
 * the edge centre of that arm's header row — left for an incoming end, right
 * for an outgoing one — in page space. Null while nothing above is folded.
 */
export function branchFoldAttachPoint(
	editor: Editor,
	shapeId: TLShapeId,
	side: 'in' | 'out',
): Vec | null {
	const level = outermostFoldedLevel(editor, shapeId)
	if (!level || !level.armId) return null
	const layout = branchLayout(level.branch.props)
	const row = layout.arms.find((arm) => arm.arm.id === level.armId)
	if (!row) return null
	const local = { x: side === 'in' ? 0 : layout.w, y: row.rowCy }
	return editor.getShapePageTransform(level.branch.id).applyToPoint(local)
}

/**
 * How faded a shape paints, from the arms above it.
 *
 * A Branch with an active arm fades every other arm and everything in it.
 * No active arm means every arm is active, so nothing fades. Nested Branches
 * compound: the shape is as faded as its most-faded ancestor level.
 */
export function branchFadeOpacity(editor: Editor, shapeId: TLShapeId): number {
	for (const level of branchAncestry(editor, shapeId)) {
		const active = level.branch.props.activeArmId
		if (active !== null && level.armId !== active) return BRANCH_FADE_OPACITY
	}
	return 1
}

/** A direct child of a Branch is hidden while its arm is folded. */
export function isHiddenByFoldedArm(editor: Editor, shape: TLShape): boolean {
	if (!isShapeId(shape.parentId)) return false
	const parent = editor.getShape(shape.parentId)
	if (!isBranchShape(parent)) return false
	const armId = branchArmIdOfChild(parent, shape)
	const arm = armId ? parent.props.arms.find((candidate) => candidate.id === armId) : null
	return arm !== null && arm !== undefined && !arm.open
}

/** The row layout for the arm a direct child sits in, or null. */
export function branchArmRowOfChild(branch: BranchShape, child: TLShape): BranchArmLayout | null {
	const armId = branchArmIdOfChild(branch, child)
	if (!armId) return null
	return branchLayout(branch.props).arms.find((arm) => arm.arm.id === armId) ?? null
}
