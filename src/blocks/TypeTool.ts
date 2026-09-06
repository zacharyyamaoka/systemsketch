import { BaseBoxShapeTool, type TLShape } from 'tldraw'

import { BLOCK_SHAPE_TYPE, TYPE_TOOL_ID, isBlockShape, type BlockShape } from './blockModel'
import { createTypeProps } from './typeAttributes'

/**
 * Type draws through the stock box tool, exactly as Block and Pill do: it owns
 * no drag, resize, or cancellation logic of its own. The one addition is a
 * Type-shaped starting body once the drag completes.
 */
export class TypeTool extends BaseBoxShapeTool {
	static override id = TYPE_TOOL_ID
	static override initial = 'idle'
	override shapeType = BLOCK_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isBlockShape(created)) return
		const props = createTypeProps(created.props)
		// A Type's box is a fixed size, independent of whatever rectangle was
		// dragged — keep the drag's centre fixed instead of its top-left corner,
		// the same correction the Pill tool makes for the same reason. Unlike a
		// Pill, a Type stays resizable while it is being drawn (`canResize` only
		// excludes the `value` view), so the box tool's own live-resize already
		// rewrote `created`'s x/y/w/h once by the time this runs — reading the
		// gesture's actual endpoints from `inputs` instead of back-computing a
		// centre from that already-resized geometry is what keeps this correct.
		const { originPagePoint, currentPagePoint } = this.editor.inputs
		const centre = {
			x: (originPagePoint.x + currentPagePoint.x) / 2,
			y: (originPagePoint.y + currentPagePoint.y) / 2,
		}
		this.editor.updateShape<BlockShape>({
			id: created.id,
			type: BLOCK_SHAPE_TYPE,
			x: centre.x - props.w / 2,
			y: centre.y - props.h / 2,
			props,
		})

		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(TYPE_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
