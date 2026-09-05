import { BaseBoxShapeTool, type TLShape } from 'tldraw'

import { BEHAVIOR_TREE_SHAPE_TYPE, BEHAVIOR_TREE_TOOL_ID, isBehaviorTreeShape } from './behaviorTreeModel'
import { isEmptyBehaviorTreeXml, SAMPLE_BEHAVIOR_TREE_XML } from './btcppXml'
import { reconcileBehaviorTree } from './installBehaviorTreeRegions'

/**
 * The stock box tool owns the gesture. A drawn region starts with a small
 * real tree rather than an empty frame, so the first thing a person sees is
 * the grammar — Start, a Sequence, a Fallback, a Parallel — and every card
 * is a Block they already know how to edit.
 */
export class BehaviorTreeTool extends BaseBoxShapeTool {
	static override id = BEHAVIOR_TREE_TOOL_ID
	static override initial = 'idle'
	override shapeType = BEHAVIOR_TREE_SHAPE_TYPE

	override onCreate(created: TLShape | null): void {
		if (!isBehaviorTreeShape(created)) return
		if (isEmptyBehaviorTreeXml(created.props.xml)) {
			this.editor.updateShape({ id: created.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...created.props, xml: SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace' } })
		}
		reconcileBehaviorTree(this.editor, created.id)
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(BEHAVIOR_TREE_TOOL_ID)
		} else {
			this.editor.setCurrentTool('select.idle')
		}
	}
}
