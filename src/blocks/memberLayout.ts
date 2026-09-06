import type { Editor, TLShapeId } from 'tldraw'

import {
	blockMemberLayout,
	isBlockShape,
	resizeBlockProps,
	type BlockMemberLayout,
	type BlockShape,
	type BlockShapeProps,
} from './blockModel'
import { layoutBlock } from './layoutBlock'

export const BLOCK_MEMBER_INSET_PX = 12
export const BLOCK_MEMBER_GAP_PX = 12

export interface BlockMemberPlacement {
	id: BlockShape['id']
	x: number
	y: number
	w: number
	h: number
}

/**
 * Resolve one explicit, reversible layout pass for direct child Blocks.
 *
 * WHY: Member layout is a helpful command, not an invisible constraint. The
 * user can still drag or resize a member afterward; continuously correcting
 * that gesture would trade the whiteboard's hackability for an auto-layout
 * system. Clicking either mode again reapplies its clean arrangement.
 */
export function blockMemberPlacements(
	parent: BlockShapeProps,
	children: readonly Pick<BlockShape, 'id' | 'x' | 'y' | 'props'>[],
	memberLayout: BlockMemberLayout = blockMemberLayout(parent),
): BlockMemberPlacement[] {
	const frame = layoutBlock(parent)
	const ordered = [...children].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
	const inset = memberLayout === 'inset' ? BLOCK_MEMBER_INSET_PX : 0
	const gap = memberLayout === 'inset' ? BLOCK_MEMBER_GAP_PX : 0
	let y = (frame.header?.h ?? 0) + inset
	const width = Math.max(1, frame.width - inset * 2)
	return ordered.map((child) => {
		const placement = { id: child.id, x: inset, y, w: width, h: child.props.h }
		y += child.props.h + gap
		return placement
	})
}

/** Set the policy and arrange only the Block's immediate Block children. */
export function setBlockMemberLayout(
	editor: Editor,
	shapeId: TLShapeId,
	memberLayout: BlockMemberLayout,
): boolean {
	const parent = editor.getShape(shapeId)
	if (!isBlockShape(parent)) return false

	const children = parent.props.view === 'expanded'
		? editor.getCurrentPageShapes().filter(
			(shape): shape is BlockShape => isBlockShape(shape) && shape.parentId === parent.id,
		)
		: []
	const placements = blockMemberPlacements(parent.props, children, memberLayout)
	const placementById = new Map(placements.map((placement) => [placement.id, placement]))
	const childUpdates = children.flatMap((child) => {
		const placement = placementById.get(child.id)
		if (!placement) return []
		const props = child.props.w === placement.w && child.props.h === placement.h
			? child.props
			: resizeBlockProps(child.props, placement.w, placement.h)
		if (child.x === placement.x && child.y === placement.y && props === child.props) return []
		return [{
			id: child.id,
			type: child.type,
			x: placement.x,
			y: placement.y,
			props,
		}]
	})
	const propsChanged = parent.props.memberLayout !== memberLayout
	if (!propsChanged && childUpdates.length === 0) return false

	editor.markHistoryStoppingPoint(`set member layout ${memberLayout}`)
	editor.updateShapes([
		...(propsChanged ? [{
			id: parent.id,
			type: parent.type,
			props: { memberLayout },
		}] : []),
		...childUpdates,
	] as never)
	return true
}
