/**
 * Members of an Expanded Block, authored the way ports are: add, reorder,
 * remove, and the parent-level stack policy. Membership itself stays tldraw's
 * `parentId`; order stays tldraw's child index. Every reorder is expressed
 * against a neighbour id (`before`), never a position, so a hidden or
 * annotation child cannot shift it.
 */
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'

import {
	blockBodyLayout,
	blockMemberSpacing,
	blockMemberWidth,
	getDefaultBlockProps,
	isBlockShape,
	isExpandedBlockShape,
	resizeBlockProps,
	setBlockViewProps,
	type BlockBodyLayout,
	type BlockMemberWidth,
	type BlockShape,
} from '../blockModel'
import { BLOCK_PORT_PLACEMENT_H, BLOCK_PORT_PLACEMENT_W } from '../blockPlacement'
import { layoutBlock } from '../layoutBlock'
import { stackMemberPlacements } from '../memberLayout'
import { assignMemberOrder, blockStackMembers, layoutBlockStack, stackMemberOf } from '../memberStack'
import { updateBlockProps, type BlockCommandOptions, type BlockCommandResult } from './blockCommands'

/** Free frame or live stack. Entering the stack settles it at once. */
export function setBlockBodyLayout(
	editor: Editor,
	shapeId: TLShapeId,
	bodyLayout: BlockBodyLayout,
	options: BlockCommandOptions = {},
): BlockCommandResult {
	const result = updateBlockProps(
		editor,
		shapeId,
		(props) => (blockBodyLayout(props) === bodyLayout ? props : { ...props, bodyLayout }),
		{ historyLabel: options.historyLabel ?? `${bodyLayout === 'stack' ? 'stack' : 'free'} block members` },
	)
	// WHY synchronous here and derived elsewhere: the toggle is the one gesture
	// whose whole point is the arrangement, so it lands in the same undo step.
	if (result.ok && bodyLayout === 'stack') layoutBlockStack(editor, shapeId)
	return result
}

/** Type a number; the preset buttons write both numbers through this too. */
export function setBlockMemberSpacing(
	editor: Editor,
	shapeId: TLShapeId,
	patch: { gap?: number; gutter?: number },
	options: BlockCommandOptions = {},
): BlockCommandResult {
	return updateBlockProps(
		editor,
		shapeId,
		(props) => {
			const next = { ...props }
			if (patch.gap !== undefined) next.memberGap = Math.max(0, Math.round(patch.gap))
			if (patch.gutter !== undefined) next.memberGutter = Math.max(0, Math.round(patch.gutter))
			const before = blockMemberSpacing(props)
			const after = blockMemberSpacing(next)
			return before.gap === after.gap && before.gutter === after.gutter ? props : next
		},
		{ historyLabel: options.historyLabel ?? 'set member spacing' },
	)
}

export function setBlockMemberWidth(
	editor: Editor,
	shapeId: TLShapeId,
	memberWidth: BlockMemberWidth,
	options: BlockCommandOptions = {},
): BlockCommandResult {
	return updateBlockProps(
		editor,
		shapeId,
		(props) => (blockMemberWidth(props) === memberWidth ? props : { ...props, memberWidth }),
		{ historyLabel: options.historyLabel ?? `members ${memberWidth === 'fill' ? 'fill' : 'keep their'} width` },
	)
}

/**
 * Add one blank member: a fresh definition in Port view, parented to the
 * Block. In a stack it lands last; in a free frame it lands in the middle of
 * the body, where a person would have dropped it. WHY blank: naming it is what
 * links it — typing an existing definition's title adopts that definition
 * through the ordinary title commit, so there is no second "link" dialog.
 */
export function addBlockMember(editor: Editor, parentId: TLShapeId): TLShapeId | null {
	const parent = editor.getShape(parentId)
	if (!isExpandedBlockShape(parent) || parent.isLocked) return null
	const props = resizeBlockProps(
		setBlockViewProps(getDefaultBlockProps(), 'port'),
		BLOCK_PORT_PLACEMENT_W,
		BLOCK_PORT_PLACEMENT_H,
	)
	const id = createShapeId()
	let x: number
	let y: number
	if (blockBodyLayout(parent.props) === 'stack') {
		const members = blockStackMembers(editor, parent.id).map(stackMemberOf)
		const { bodyBottom } = stackMemberPlacements(parent.props, members)
		x = blockMemberSpacing(parent.props).gutter
		y = bodyBottom
	} else {
		const frame = layoutBlock(parent.props)
		const interior = frame.frameInterior ?? frame.body
		x = Math.max(0, interior.x + (interior.w - props.w) / 2)
		y = Math.max(frame.header?.h ?? 0, interior.y + (interior.h - props.h) / 2)
	}
	editor.markHistoryStoppingPoint('add block member')
	editor.createShape<BlockShape>({ id, type: 'block', parentId: parent.id, x, y, props })
	if (blockBodyLayout(parent.props) === 'stack') layoutBlockStack(editor, parent.id)
	return id
}

/** Place `memberId` before `before` (null = last) in the stack's authored order. */
export function moveBlockMember(
	editor: Editor,
	parentId: TLShapeId,
	memberId: TLShapeId,
	before: TLShapeId | null,
): boolean {
	const parent = editor.getShape(parentId)
	if (!isExpandedBlockShape(parent) || parent.isLocked) return false
	const members = blockStackMembers(editor, parent.id)
	const moving = members.find((member) => member.id === memberId)
	if (!moving || memberId === before) return false
	const rest = members.filter((member) => member.id !== memberId)
	const at = before === null ? rest.length : rest.findIndex((member) => member.id === before)
	if (at < 0) return false
	const ordered = [...rest.slice(0, at), moving, ...rest.slice(at)]
	if (ordered.every((member, position) => member.id === members[position]?.id)) return false
	editor.markHistoryStoppingPoint('reorder block members')
	editor.run(() => {
		assignMemberOrder(editor, ordered)
		// A free frame has no slots: the authored order is only what the list shows.
		if (blockBodyLayout(parent.props) === 'stack') layoutBlockStack(editor, parent.id, { order: 'authored' })
	})
	return true
}

/** Step one slot up or down — the ↑↓ keys on a list row. */
export function stepBlockMember(editor: Editor, parentId: TLShapeId, memberId: TLShapeId, delta: -1 | 1): boolean {
	const members = blockStackMembers(editor, parentId)
	const at = members.findIndex((member) => member.id === memberId)
	if (at < 0) return false
	const target = at + delta
	if (target < 0 || target >= members.length) return false
	const before = delta < 0 ? members[target].id : members[target + 1]?.id ?? null
	return moveBlockMember(editor, parentId, memberId, before)
}

/**
 * Leave the Block, keeping the page position — the same stock reparent the
 * "Remove from container" context command uses, so nothing is deleted.
 */
export function removeBlockMember(editor: Editor, parentId: TLShapeId, memberId: TLShapeId): boolean {
	const parent = editor.getShape(parentId)
	const member = editor.getShape(memberId)
	if (!isBlockShape(parent) || !member || member.parentId !== parent.id || parent.isLocked) return false
	editor.markHistoryStoppingPoint('remove block member')
	editor.reparentShapes([member.id], parent.parentId)
	return true
}
