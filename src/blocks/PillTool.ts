import { BaseBoxShapeTool, type TLShape } from 'tldraw'
import { BLOCK_SHAPE_TYPE, PILL_TOOL_ID, isBlockShape, type BlockShape } from './blockModel'
import { createValueBlockProps } from './valueBlock'

/**
 * P draws a pill: a Block already wearing its `value` view.
 *
 * The stock box tool owns pointer capture, click/drag creation, cancellation
 * and history, exactly as it does for the Block tool. Whatever box the gesture
 * produced, the pill lands centred on it at the size its (still empty) literal
 * needs; the instant-typing seam then opens the literal for typing, the same
 * way it opens a drawn Block's title.
 */
export class PillTool extends BaseBoxShapeTool {
	static override id = PILL_TOOL_ID
	static override initial = 'idle'
	override shapeType = BLOCK_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isBlockShape(created)) return
		const props = createValueBlockProps(created.props)
		const centre = {
			x: created.x + created.props.w / 2,
			y: created.y + created.props.h / 2,
		}
		this.editor.updateShape<BlockShape>({
			id: created.id,
			type: BLOCK_SHAPE_TYPE,
			x: centre.x - props.w / 2,
			y: centre.y - props.h / 2,
			props,
		})

		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(PILL_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
