import { BaseBoxShapeTool, type TLShape } from 'tldraw'
import { BT_INSERT_GLYPH_SHAPE_TYPE, BT_INSERT_GLYPH_TOOL_ID } from './btInsertGlyphModel'

/** Stock box creation supplies drag, cancellation, selection and history. */
export class BtInsertGlyphTool extends BaseBoxShapeTool {
	static override id = BT_INSERT_GLYPH_TOOL_ID
	static override initial = 'idle'
	override shapeType = BT_INSERT_GLYPH_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (created?.type !== BT_INSERT_GLYPH_SHAPE_TYPE) return
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(BT_INSERT_GLYPH_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
