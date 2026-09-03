import { type Editor, type TLShape, type TLShapeId, createShapeId } from 'tldraw'

import {
	BLOCK_SHAPE_TYPE,
	isBlockShape,
	setBlockPlacementViewProps,
	type BlockShape,
} from '../blocks/blockModel'
import { stampBranchChildArms } from '../branch/branchCommands'
import {
	BRANCH_ARM_HEADER_HEIGHT,
	BRANCH_BAND_HEIGHT,
	BRANCH_PAD_BOTTOM,
	BRANCH_SHAPE_TYPE,
	isBranchShape,
} from '../branch/branchModel'

/**
 * Turn a multi-selection into one container.
 *
 * Four targets, in the order they appear in the menu. `frame` and `group` are
 * stock tldraw actions and are NOT implemented here — the UI dispatches those
 * through `useActions()` so their behaviour, history entry and analytics stay
 * the engine's. Only `block` and `branch` are ours, and both reuse the exact
 * move their own tools already make: create the container, reparent what it
 * encloses, then let the container stamp its children.
 */
export const WRAP_TARGETS = ['frame', 'block', 'branch', 'group'] as const
export type WrapTarget = (typeof WRAP_TARGETS)[number]

/** Which targets this module owns; the rest belong to a stock action. */
export const OWNED_WRAP_TARGETS = ['block', 'branch'] as const satisfies readonly WrapTarget[]

export interface WrapTargetDescriptor {
	target: WrapTarget
	label: string
	/** Second line in the menu — what the container is *for*, not what it does. */
	hint: string
	/** The stock action id, when the engine already owns this move. */
	stockActionId?: 'frame-selection' | 'group'
}

export const WRAP_TARGET_DESCRIPTORS: readonly WrapTargetDescriptor[] = [
	{
		target: 'frame',
		label: 'Frame',
		hint: 'A plain container that clips and moves as one',
		stockActionId: 'frame-selection',
	},
	{ target: 'block', label: 'Block', hint: 'An Expanded Block, so it can carry ports' },
	{ target: 'branch', label: 'Branch region', hint: 'A region with arms, for an if' },
	{
		target: 'group',
		label: 'Group',
		hint: 'Keeps them together without adding a container',
		stockActionId: 'group',
	},
]

/**
 * A connection follows its endpoints, so it is never wrapped: adopting one
 * would reparent a cable away from the Blocks it binds while leaving those
 * Blocks outside. Both shape tools already exclude it for the same reason.
 */
function isWrappable(shape: TLShape | undefined): shape is TLShape {
	return Boolean(shape) && !shape!.isLocked && shape!.type !== 'connection'
}

/** The shapes a wrap would actually adopt, in the editor's own z-order. */
export function wrappableSelection(editor: Editor): TLShape[] {
	return editor
		.getSelectedShapes()
		.filter((shape): shape is TLShape => isWrappable(shape))
}

/**
 * Wrapping needs two or more adoptable shapes.
 *
 * One shape is not a container question — it is already a thing you can move —
 * and this is the same threshold FigJam uses to decide when its own wrap
 * control appears at all.
 */
export function canWrapSelection(editor: Editor): boolean {
	if (editor.getInstanceState().isReadonly) return false
	return wrappableSelection(editor).length >= 2
}

/** Room the container needs around its children, per target. */
const INSETS: Record<'block' | 'branch', { top: number; side: number; bottom: number }> = {
	// A Block's heading band is 48 at canvas scale.
	block: { top: 48, side: 16, bottom: 16 },
	branch: {
		top: BRANCH_BAND_HEIGHT + BRANCH_ARM_HEADER_HEIGHT,
		side: 16,
		bottom: BRANCH_PAD_BOTTOM + 8,
	},
}

/**
 * Where the container goes, in the coordinate space it will be created in.
 *
 * Children keep their page position through `reparentShapes`, so the container
 * is drawn *around* where they already are rather than moving them — which is
 * what makes the gesture feel like wrapping instead of like a layout pass.
 */
function containerBounds(editor: Editor, shapes: TLShape[], target: 'block' | 'branch') {
	const bounds = editor.getSelectionPageBounds()
	if (!bounds) return null
	const inset = INSETS[target]
	return {
		x: bounds.minX - inset.side,
		y: bounds.minY - inset.top,
		w: bounds.width + inset.side * 2,
		h: bounds.height + inset.top + inset.bottom,
	}
}

/**
 * The parent the new container should sit in.
 *
 * When every adopted shape already shares a parent the container joins them
 * there, so wrapping inside an Expanded Block does not eject the result to the
 * page. A mixed selection falls back to the current page, which is the only
 * ancestor all of them are guaranteed to share.
 */
function commonParentId(editor: Editor, shapes: TLShape[]) {
	const [first, ...rest] = shapes
	if (!first) return editor.getCurrentPageId()
	return rest.every((shape) => shape.parentId === first.parentId)
		? first.parentId
		: editor.getCurrentPageId()
}

export interface WrapResult {
	containerId: TLShapeId
	adopted: number
}

/**
 * Wrap the selection in a Block or a Branch region.
 *
 * `frame` and `group` are deliberately rejected here rather than reimplemented:
 * the engine owns those, and a second implementation beside it is exactly the
 * fork this repository's stock boundary exists to prevent.
 */
export function wrapSelectionInto(
	editor: Editor,
	target: (typeof OWNED_WRAP_TARGETS)[number],
): WrapResult | null {
	if (!canWrapSelection(editor)) return null
	const shapes = wrappableSelection(editor)
	const bounds = containerBounds(editor, shapes, target)
	if (!bounds) return null

	const containerId = createShapeId()
	const parentId = commonParentId(editor, shapes)
	const childIds = shapes.map((shape) => shape.id)

	editor.markHistoryStoppingPoint(`wrap selection in ${target}`)
	editor.run(() => {
		editor.createShape({
			id: containerId,
			type: target === 'block' ? BLOCK_SHAPE_TYPE : BRANCH_SHAPE_TYPE,
			parentId,
			x: bounds.x,
			y: bounds.y,
			props: { w: bounds.w, h: bounds.h },
		})

		if (target === 'block') {
			// A Block only holds children in its Expanded view, so a wrap that
			// left the default view would silently produce an empty container.
			const created = editor.getShape(containerId)
			if (isBlockShape(created)) {
				editor.updateShape<BlockShape>({
					id: containerId,
					type: BLOCK_SHAPE_TYPE,
					props: setBlockPlacementViewProps(created.props, 'expanded'),
				})
			}
		}

		editor.reparentShapes(childIds, containerId)

		if (target === 'branch') {
			const branch = editor.getShape(containerId)
			// Arm membership is a stamp, the same one the Branch tool applies
			// to whatever it was drawn around.
			if (isBranchShape(branch)) stampBranchChildArms(editor, branch)
		}

		editor.setSelectedShapes([containerId])
	})

	return { containerId, adopted: childIds.length }
}
