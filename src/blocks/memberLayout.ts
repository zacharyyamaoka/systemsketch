import type { Editor, TLShape, TLShapeId } from 'tldraw'

import {
	blockBodyLayout,
	blockMemberLayout,
	blockMemberSpacing,
	blockMemberWidth,
	isBlockShape,
	resizeBlockProps,
	type BlockMemberLayout,
	type BlockMemberSpacing,
	type BlockMemberWidth,
	type BlockShape,
	type BlockShapeProps,
} from './blockModel'
import { layoutBlock } from './layoutBlock'

export const BLOCK_MEMBER_INSET_PX = 12
export const BLOCK_MEMBER_GAP_PX = 12

export interface BlockMemberPlacement {
	id: TLShapeId
	x: number
	y: number
	w: number
	h: number
}

/** The box a stackable member contributes; every SystemSketch primitive has one. */
export interface StackMember {
	id: TLShapeId
	type: TLShape['type']
	x: number
	y: number
	w: number
	h: number
	/** A Block's own view: an Expanded member never takes the parent's width. */
	view?: BlockShapeProps['view']
}

/**
 * Rule 4 of the members proposal: Fill only ever writes an occurrence's Port or
 * Simple box. An Expanded member keeps its own width and drives the parent,
 * because `views.expanded` is shared by every occurrence of its definition —
 * two parents filling it to different widths would fight over one field.
 * Non-Block members keep their own width in V1 too: only a Block knows how to
 * absorb a width change through `resizeBlockProps`.
 */
export function stackMemberFillsWidth(member: Pick<StackMember, 'type' | 'view'>, width: BlockMemberWidth): boolean {
	return width === 'fill' && member.type === 'block' && member.view !== 'expanded'
}

/**
 * Lay an ordered run of members down the parent's body.
 *
 * Pure arithmetic over the parent's own `layoutBlock()` geometry: the first
 * slot starts one gap below the header, members follow in the given order,
 * and the returned `bodyBottom` is where a hugging parent's footer begins.
 */
export function stackMemberPlacements(
	parent: BlockShapeProps,
	members: readonly StackMember[],
	spacing: BlockMemberSpacing = blockMemberSpacing(parent),
	width: BlockMemberWidth = blockMemberWidth(parent),
): { placements: BlockMemberPlacement[]; bodyBottom: number } {
	const frame = layoutBlock(parent)
	const { gap, gutter } = spacing
	let y = (frame.header?.h ?? 0) + gap
	const inner = Math.max(1, frame.width - gutter * 2)
	const placements = members.map((member) => {
		const w = stackMemberFillsWidth(member, width) ? inner : member.w
		const placement = { id: member.id, x: gutter, y, w, h: member.h }
		y += member.h + gap
		return placement
	})
	return { placements, bodyBottom: y }
}

/**
 * Which slot a member dropped at `y` (parent-local, its top edge) takes.
 * Decided at the landing, like a cable's polarity: the member goes before the
 * first laid-out neighbour whose vertical midpoint is below the drop.
 */
export function blockMemberDropTarget(
	placements: readonly BlockMemberPlacement[],
	y: number,
	movingId?: TLShapeId,
): { before: TLShapeId | null } {
	for (const placement of placements) {
		if (placement.id === movingId) continue
		if (y < placement.y + placement.h / 2) return { before: placement.id }
	}
	return { before: null }
}

function stackMemberOf(shape: BlockShape): StackMember {
	return { id: shape.id, type: shape.type, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h, view: shape.props.view }
}

/**
 * Resolve one explicit, reversible layout pass for direct child Blocks of a
 * FREE Block — sorted by where they sit, since a free frame has no authored
 * order.
 *
 * WHY: in free mode member layout is a helpful command, not an invisible
 * constraint. The user can still drag or resize a member afterward;
 * continuously correcting that gesture would trade the whiteboard's
 * hackability for an auto-layout system. Clicking either mode again reapplies
 * its clean arrangement. A Block in `stack` mode is the opposite by choice —
 * see `memberStack.ts`.
 */
export function blockMemberPlacements(
	parent: BlockShapeProps,
	children: readonly Pick<BlockShape, 'id' | 'x' | 'y' | 'props' | 'type'>[],
	memberLayout: BlockMemberLayout = blockMemberLayout(parent),
): BlockMemberPlacement[] {
	const ordered = [...children].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
	const preset = memberLayout === 'inset' ? BLOCK_MEMBER_INSET_PX : 0
	return stackMemberPlacements(
		parent,
		ordered.map((child) => stackMemberOf(child as BlockShape)),
		{ gap: memberLayout === 'inset' ? BLOCK_MEMBER_GAP_PX : 0, gutter: preset },
		'fill',
	).placements
}

/**
 * Set the preset and, for a free Block, arrange its immediate Block children
 * once. A stacked Block only takes the preset (clearing any typed override):
 * its live pass does the arranging.
 */
export function setBlockMemberLayout(
	editor: Editor,
	shapeId: TLShapeId,
	memberLayout: BlockMemberLayout,
): boolean {
	const parent = editor.getShape(shapeId)
	if (!isBlockShape(parent)) return false

	if (blockBodyLayout(parent.props) === 'stack') {
		const cleared = parent.props.memberGap === undefined && parent.props.memberGutter === undefined
		if (parent.props.memberLayout === memberLayout && cleared) return false
		editor.markHistoryStoppingPoint(`set member layout ${memberLayout}`)
		editor.updateShape<BlockShape>({
			id: parent.id,
			type: parent.type,
			props: { memberLayout, memberGap: undefined, memberGutter: undefined },
		})
		return true
	}

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
