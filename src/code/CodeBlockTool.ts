import { BaseBoxShapeTool, type TLShape } from 'tldraw'
import { CODE_SHAPE_TYPE, CODE_TOOL_ID } from './codeModel'

/** Stock box creation supplies drag, cancellation, selection and history. */
export class CodeBlockTool extends BaseBoxShapeTool {
	static override id = CODE_TOOL_ID
	static override initial = 'idle'
	override shapeType = CODE_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (created?.type !== CODE_SHAPE_TYPE) return
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(CODE_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
