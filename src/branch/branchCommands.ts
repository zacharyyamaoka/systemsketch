/**
 * The Branch commands: every gesture — inspector, selection pill, on-canvas
 * chevron and target — writes through here, so each one is a public Editor
 * mutation with a history label and no parallel form state.
 *
 * The one thing the commands know that the pure transitions do not is where
 * the children are. An arm's Blocks keep their offset inside the arm's body
 * across a fold, an unfold, a reorder and a resize, and a removed arm hands
 * its Blocks back to the Branch's own parent at the same page position.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import {
	BRANCH_ARM_META_KEY,
	appendBranchArmProps,
	appendBranchControlProps,
	branchLayout,
	isBranchShape,
	moveBranchArmProps,
	patchBranchArmProps,
	patchBranchControlProps,
	removeBranchArmProps,
	removeBranchControlProps,
	setBranchActiveArmProps,
	setBranchArmOpenProps,
	setBranchViewProps,
	toggleBranchActiveArmProps,
	type BranchArm,
	type BranchControlPort,
	type BranchShape,
	type BranchShapeProps,
	type BranchView,
} from './branchModel'
import { branchArmIdOfChild } from './branchScope'

export type BranchCommandFailure = 'missing-branch' | 'missing-arm' | 'missing-port' | 'unchanged'

export type BranchCommandResult =
	| { ok: true; shapeId: TLShapeId; props: BranchShapeProps }
	| { ok: false; reason: BranchCommandFailure }

export interface BranchCommandOptions {
	/** `false` for continuous inputs that bound their own undo step. */
	historyLabel?: string | false
}

/** The only selected Branch. A mixed or multi-selection is deliberately empty. */
export function getOnlySelectedBranch(editor: Editor): BranchShape | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1) return null
	return isBranchShape(selected[0]) ? selected[0] : null
}

/** Children of a Branch that live in its arms — everything except cables. */
export function branchArmChildren(editor: Editor, branch: BranchShape): TLShape[] {
	return editor
		.getSortedChildIdsForParent(branch.id)
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => shape !== undefined && shape.type !== 'connection')
}

/**
 * Write new Branch props and carry the children with their arms.
 *
 * Each child keeps its offset from its arm's body top; a child of an arm that
 * no longer exists is reparented out, keeping its page position.
 */
function applyBranchProps(
	editor: Editor,
	branch: BranchShape,
	next: BranchShapeProps,
	historyLabel: string | false,
): BranchCommandResult {
	if (next === branch.props) return { ok: false, reason: 'unchanged' }
	const before = branchLayout(branch.props)
	const after = branchLayout(next)
	const rowsBefore = new Map(before.arms.map((row) => [row.arm.id, row]))
	const rowsAfter = new Map(after.arms.map((row) => [row.arm.id, row]))

	const moves: Array<{ id: TLShapeId; type: string; y: number; meta: Record<string, unknown> }> = []
	const orphans: TLShapeId[] = []
	for (const child of branchArmChildren(editor, branch)) {
		const armId = branchArmIdOfChild(branch, child)
		const rowBefore = armId ? rowsBefore.get(armId) : undefined
		const rowAfter = armId ? rowsAfter.get(armId) : undefined
		if (!armId || !rowBefore) continue
		if (!rowAfter) {
			orphans.push(child.id)
			continue
		}
		const y = rowAfter.bodyTop + (child.y - rowBefore.bodyTop)
		const stamped = child.meta?.[BRANCH_ARM_META_KEY]
		if (y !== child.y || stamped !== armId) {
			moves.push({ id: child.id, type: child.type, y, meta: { ...child.meta, [BRANCH_ARM_META_KEY]: armId } })
		}
	}

	if (historyLabel !== false) editor.markHistoryStoppingPoint(historyLabel)
	editor.run(() => {
		editor.updateShape<BranchShape>({ id: branch.id, type: branch.type, props: next })
		if (moves.length > 0) editor.updateShapes(moves as never)
		if (orphans.length > 0) editor.reparentShapes(orphans, branch.parentId)
	})
	return { ok: true, shapeId: branch.id, props: next }
}

export function updateBranchProps(
	editor: Editor,
	shapeId: TLShapeId,
	update: (props: BranchShapeProps) => BranchShapeProps,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	return applyBranchProps(editor, branch, update(branch.props), options.historyLabel ?? 'edit branch')
}

export function setBranchTitle(
	editor: Editor,
	shapeId: TLShapeId,
	title: string,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	return updateBranchProps(
		editor,
		shapeId,
		(props) => (props.title === title ? props : { ...props, title }),
		{ historyLabel: options.historyLabel ?? 'rename branch' },
	)
}

/* ------------------------------ control ports ------------------------------ */

export type BranchControlResult =
	| { ok: true; shapeId: TLShapeId; props: BranchShapeProps; port: BranchControlPort }
	| { ok: false; reason: BranchCommandFailure }

export function addBranchControl(
	editor: Editor,
	shapeId: TLShapeId,
	initial: Partial<Pick<BranchControlPort, 'name' | 'type'>> = {},
	options: BranchCommandOptions = {},
): BranchControlResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	const { props, port } = appendBranchControlProps(branch.props, initial)
	const result = applyBranchProps(editor, branch, props, options.historyLabel ?? 'add branch control port')
	return result.ok ? { ...result, port } : result
}

export function updateBranchControl(
	editor: Editor,
	shapeId: TLShapeId,
	portId: string,
	patch: Partial<Pick<BranchControlPort, 'name' | 'type'>>,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (!branch.props.controls.some((port) => port.id === portId)) return { ok: false, reason: 'missing-port' }
	return applyBranchProps(
		editor,
		branch,
		patchBranchControlProps(branch.props, portId, patch),
		options.historyLabel ?? 'edit branch control port',
	)
}

/** Removing a control port drops any cable welded to it — the binding rule does that. */
export function removeBranchControl(
	editor: Editor,
	shapeId: TLShapeId,
	portId: string,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	return updateBranchProps(
		editor,
		shapeId,
		(props) => removeBranchControlProps(props, portId),
		{ historyLabel: options.historyLabel ?? 'remove branch control port' },
	)
}

/* ----------------------------------- arms ---------------------------------- */

export type BranchArmResult =
	| { ok: true; shapeId: TLShapeId; props: BranchShapeProps; arm: BranchArm }
	| { ok: false; reason: BranchCommandFailure }

export function addBranchArm(
	editor: Editor,
	shapeId: TLShapeId,
	initial: Partial<Pick<BranchArm, 'title' | 'h'>> = {},
	options: BranchCommandOptions = {},
): BranchArmResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	const { props, arm } = appendBranchArmProps(branch.props, initial)
	const result = applyBranchProps(editor, branch, props, options.historyLabel ?? 'add branch arm')
	return result.ok ? { ...result, arm } : result
}

export function updateBranchArm(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	patch: Partial<Pick<BranchArm, 'title' | 'h'>>,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (!branch.props.arms.some((arm) => arm.id === armId)) return { ok: false, reason: 'missing-arm' }
	return applyBranchProps(
		editor,
		branch,
		patchBranchArmProps(branch.props, armId, patch),
		options.historyLabel ?? 'edit branch arm',
	)
}

export function removeBranchArm(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (!branch.props.arms.some((arm) => arm.id === armId)) return { ok: false, reason: 'missing-arm' }
	return applyBranchProps(
		editor,
		branch,
		removeBranchArmProps(branch.props, armId),
		options.historyLabel ?? 'remove branch arm',
	)
}

export function moveBranchArm(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	toIndex: number,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (!branch.props.arms.some((arm) => arm.id === armId)) return { ok: false, reason: 'missing-arm' }
	return applyBranchProps(
		editor,
		branch,
		moveBranchArmProps(branch.props, armId, toIndex),
		options.historyLabel ?? 'reorder branch arms',
	)
}

export function setBranchArmOpen(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	open: boolean,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (!branch.props.arms.some((arm) => arm.id === armId)) return { ok: false, reason: 'missing-arm' }
	return applyBranchProps(
		editor,
		branch,
		setBranchArmOpenProps(branch.props, armId, open),
		options.historyLabel ?? (open ? 'open branch arm' : 'fold branch arm'),
	)
}

export function toggleBranchArmOpen(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	const arm = branch.props.arms.find((candidate) => candidate.id === armId)
	if (!arm) return { ok: false, reason: 'missing-arm' }
	return setBranchArmOpen(editor, shapeId, armId, !arm.open, options)
}

export function setBranchActiveArm(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string | null,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	return updateBranchProps(
		editor,
		shapeId,
		(props) => setBranchActiveArmProps(props, armId),
		{ historyLabel: options.historyLabel ?? (armId ? 'make branch arm active' : 'clear active branch arm') },
	)
}

export function toggleBranchActiveArm(
	editor: Editor,
	shapeId: TLShapeId,
	armId: string,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	return updateBranchProps(
		editor,
		shapeId,
		(props) => toggleBranchActiveArmProps(props, armId),
		{ historyLabel: options.historyLabel ?? 'toggle active branch arm' },
	)
}

/** The pill's ◎: clear the active arm if one is set, else make the first open arm active. */
export function cycleBranchActiveArm(editor: Editor, shapeId: TLShapeId): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	if (branch.props.activeArmId !== null) return setBranchActiveArm(editor, shapeId, null)
	const first = branch.props.arms.find((arm) => arm.open) ?? branch.props.arms[0]
	if (!first) return { ok: false, reason: 'missing-arm' }
	return setBranchActiveArm(editor, shapeId, first.id)
}

export function setBranchView(
	editor: Editor,
	shapeId: TLShapeId,
	view: BranchView,
	options: BranchCommandOptions = {},
): BranchCommandResult {
	const branch = editor.getShape(shapeId)
	if (!isBranchShape(branch)) return { ok: false, reason: 'missing-branch' }
	return applyBranchProps(
		editor,
		branch,
		setBranchViewProps(branch.props, view),
		options.historyLabel ?? `show branch as ${view}`,
	)
}

/**
 * Stamp every direct child with the arm its geometry puts it in.
 *
 * Runs after a completed operation, so a Block dropped or dragged into a
 * Branch settles into its arm as a fact the fold can read back later, when
 * the row it was dropped in has no body to be inside of any more.
 */
export function stampBranchChildArms(editor: Editor, branch: BranchShape): number {
	const updates: Array<{ id: TLShapeId; type: string; meta: Record<string, unknown> }> = []
	const layout = branchLayout(branch.props)
	for (const child of branchArmChildren(editor, branch)) {
		// Only geometry can re-home a child: an open arm's row must hold its top
		// edge. Children of folded arms keep the stamp they have.
		const row = layout.arms.find((arm) => arm.bodyH > 0 && child.y >= arm.rowTop && child.y < arm.bottom)
		const stamped = child.meta?.[BRANCH_ARM_META_KEY]
		const stampedIsLive = typeof stamped === 'string'
			&& branch.props.arms.some((arm) => arm.id === stamped)
		const armId = row?.arm.id ?? (stampedIsLive ? (stamped as string) : branchArmIdOfChild(branch, child))
		if (!armId || stamped === armId) continue
		updates.push({ id: child.id, type: child.type, meta: { ...child.meta, [BRANCH_ARM_META_KEY]: armId } })
	}
	if (updates.length > 0) editor.updateShapes(updates as never)
	return updates.length
}
