import { BaseBoxShapeTool, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { BRANCH_SHAPE_TYPE, BRANCH_TOOL_ID, isBranchShape } from './branchModel'
import { stampBranchChildArms } from './branchCommands'

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
 * The stock box tool owns the gesture; Branch only adopts what it was drawn
 * around, the way an Expanded Block does, and hands each adopted Block its arm.
 */
export class BranchTool extends BaseBoxShapeTool {
	static override id = BRANCH_TOOL_ID
	static override initial = 'idle'
	override shapeType = BRANCH_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isBranchShape(created)) return
		const enclosed = enclosedSiblingIds(this.editor, created)
		if (enclosed.length > 0) {
			this.editor.reparentShapes(enclosed, created.id)
		}
		const branch = this.editor.getShape(created.id)
		if (isBranchShape(branch)) stampBranchChildArms(this.editor, branch)
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(BRANCH_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
