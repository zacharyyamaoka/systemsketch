import type { Editor, TLUiToolsContextType } from 'tldraw'

import { BehaviorTreeIcon } from './BehaviorTreeIcon'
import { BEHAVIOR_TREE_TOOL_ID } from './behaviorTreeModel'

/**
 * Register the tool with tldraw's UI so the system-family submenu row can
 * select it — the same omission that once made the Loop row a silent no-op.
 * No shortcut: a region is reached from the family menu, like Branch and Loop.
 */
export function withBehaviorTreeTool(
	editor: Editor,
	tools: TLUiToolsContextType,
): TLUiToolsContextType {
	return {
		...tools,
		[BEHAVIOR_TREE_TOOL_ID]: {
			id: BEHAVIOR_TREE_TOOL_ID,
			label: 'Behavior Tree',
			icon: <BehaviorTreeIcon />,
			onSelect() {
				editor.setCurrentTool(BEHAVIOR_TREE_TOOL_ID)
			},
		},
	}
}
