import type { Editor, TLUiToolsContextType } from 'tldraw'

import { LoopIcon } from './LoopIcon'
import { LOOP_TOOL_ID } from './loopModel'

/**
 * Add Loop to tldraw's UI-tool registry.
 *
 * Without this the toolbar's submenu listed Loop and clicking it did nothing:
 * `selectSystemFamilyTool` calls `tools[id]?.onSelect(...)`, and an id with no
 * registry entry makes that optional chain a silent no-op. The acceptance
 * journey missed it because it activated the tool with
 * `editor.setCurrentTool('loop')` instead of clicking the item a person clicks
 * — so the journey now clicks the item.
 *
 * No keyboard shortcut: B stays the Block's, and a region is reached from the
 * system-design submenu, which is where Zach wants that habit to form.
 */
export function withLoopTool(
	editor: Editor,
	tools: TLUiToolsContextType,
): TLUiToolsContextType {
	return {
		...tools,
		[LOOP_TOOL_ID]: {
			id: LOOP_TOOL_ID,
			label: 'Loop',
			icon: <LoopIcon />,
			onSelect() {
				editor.setCurrentTool(LOOP_TOOL_ID)
			},
		},
	}
}
