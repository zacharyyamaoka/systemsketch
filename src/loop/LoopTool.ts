import { BaseBoxShapeTool, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { LOOP_SHAPE_TYPE, LOOP_TOOL_ID, isLoopShape } from './loopModel'

function enclosedSiblingIds(editor: Editor, frame: TLShape): TLShapeId[] {
	const bounds = editor.getShapePageBounds(frame)
	if (!bounds) return []
	const ancestorIds = new Set(editor.getShapeAncestors(frame).map((ancestor) => ancestor.id))
	return editor.getSortedChildIdsForParent(frame.parentId).filter((id) => {
		const sibling = editor.getShape(id)
		if (!sibling || sibling.id === frame.id || sibling.isLocked) return false
		if (sibling.type === 'connection') return false
		if (ancestorIds.has(sibling.id) || sibling.parentId !== frame.parentId) return false
		const siblingBounds = editor.getShapePageBounds(sibling)
		return Boolean(siblingBounds && bounds.contains(siblingBounds))
	})
}

/**
 * The stock box tool owns the gesture; Loop only adopts what it was drawn
 * around, the way the Branch and an Expanded Block do.
 */
export class LoopTool extends BaseBoxShapeTool {
	static override id = LOOP_TOOL_ID
	static override initial = 'idle'
	override shapeType = LOOP_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isLoopShape(created)) return
		const enclosed = enclosedSiblingIds(this.editor, created)
		if (enclosed.length > 0) {
			this.editor.reparentShapes(enclosed, created.id)
		}
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(LOOP_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
