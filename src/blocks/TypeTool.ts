import { BaseBoxShapeTool, type TLShape } from 'tldraw'

import { BLOCK_SHAPE_TYPE, TYPE_TOOL_ID, isBlockShape, type BlockShape } from './blockModel'
import { createTypeProps } from './typeAttributes'

/**
 * Type reuses the stock Block box gesture rather than owning drag, resize, or
 * containment. The one addition is a Type-shaped starting body after drawing.
 */
export class TypeTool extends BaseBoxShapeTool {
  static override id = TYPE_TOOL_ID
  static override initial = 'idle'
  override shapeType = BLOCK_SHAPE_TYPE

  override onCreate(created: TLShape | null): void {
    if (!isBlockShape(created)) return
    this.editor.updateShape<BlockShape>({
      id: created.id,
      type: BLOCK_SHAPE_TYPE,
      props: createTypeProps(created.props),
    })
    this.editor.setCurrentTool(this.editor.getInstanceState().isToolLocked ? TYPE_TOOL_ID : 'select.idle')
  }
}
