import { BaseBoxShapeTool, type TLShape } from 'tldraw'

import {
	FLOATING_PORT_SHAPE_TYPE,
	FLOATING_PORT_TOOL_ID,
	isFloatingPortShape,
} from './floatingPortModel'

/**
 * A click makes a one-dot Port at the pointer; a drag is still stock box-tool
 * creation, which means capture, cancellation, undo, and tool locking stay
 * owned by tldraw rather than copied into a miniature drawing state machine.
 */
export class FloatingPortTool extends BaseBoxShapeTool {
	static override id = FLOATING_PORT_TOOL_ID
	static override initial = 'idle'
	override shapeType = FLOATING_PORT_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isFloatingPortShape(created)) return
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(FLOATING_PORT_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
