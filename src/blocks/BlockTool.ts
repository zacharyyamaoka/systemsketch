import { BaseBoxShapeTool, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import {
	BLOCK_SHAPE_TYPE,
	BLOCK_TOOL_ID,
	isBlockShape,
	setBlockPlacementViewProps,
	type BlockShape,
} from './blockModel'
import { blockViewForPlacement } from './blockPlacement'

function enclosedSiblingIds(editor: Editor, frame: TLShape): TLShapeId[] {
	const bounds = editor.getShapePageBounds(frame)
	if (!bounds) return []
	const ancestorIds = new Set(editor.getShapeAncestors(frame).map((ancestor) => ancestor.id))

	return editor.getSortedChildIdsForParent(frame.parentId).filter((id) => {
		const sibling = editor.getShape(id)
		if (!sibling || sibling.id === frame.id || sibling.isLocked) return false
		if (ancestorIds.has(sibling.id) || sibling.parentId !== frame.parentId) return false
		const siblingBounds = editor.getShapePageBounds(sibling)
		return Boolean(siblingBounds && bounds.contains(siblingBounds))
	})
}

/**
 * The stock box tool owns pointer capture, click/drag creation, resize,
 * cancellation and history. Block only adds view selection and frame-style
 * enclosure after the stock gesture has completed.
 */
export class BlockTool extends BaseBoxShapeTool {
	static override id = BLOCK_TOOL_ID
	static override initial = 'idle'
	override shapeType = BLOCK_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isBlockShape(created)) return
		const enclosed = enclosedSiblingIds(this.editor, created)
		const view = blockViewForPlacement(created.props.w, created.props.h, enclosed.length > 0)
		const props = setBlockPlacementViewProps(created.props, view)
		this.editor.updateShape<BlockShape>({
			id: created.id,
			type: BLOCK_SHAPE_TYPE,
			props,
		})

		if (view === 'expanded' && enclosed.length > 0) {
			this.editor.reparentShapes(enclosed, created.id)
		}

		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(BLOCK_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
