import type { Editor, TLUiToolsContextType } from 'tldraw'

import { BranchIcon } from './BranchIcon'
import { BRANCH_TOOL_ID } from './branchModel'

/**
 * Add Branch to tldraw's UI-tool registry.
 *
 * No keyboard shortcut yet: B stays the Block's, and Branch is reached from
 * the system-design submenu under the Block slot, which is where Zach wants
 * that muscle memory to form.
 */
export function withBranchTool(
	editor: Editor,
	tools: TLUiToolsContextType,
): TLUiToolsContextType {
	return {
		...tools,
		[BRANCH_TOOL_ID]: {
			id: BRANCH_TOOL_ID,
			label: 'Branch',
			icon: <BranchIcon />,
			onSelect() {
				editor.setCurrentTool(BRANCH_TOOL_ID)
			},
		},
	}
}
