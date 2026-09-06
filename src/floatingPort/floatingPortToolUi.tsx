import type { Editor, TLUiToolsContextType } from 'tldraw'

import { FloatingPortIcon } from './FloatingPortIcon'
import { FLOATING_PORT_TOOL_ID } from './floatingPortModel'

/** Register the Port beside Block and Pill; it intentionally claims no key. */
export function withFloatingPortTool(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType {
	return {
		...tools,
		[FLOATING_PORT_TOOL_ID]: {
			id: FLOATING_PORT_TOOL_ID,
			label: 'Port',
			icon: <FloatingPortIcon />,
			onSelect() {
				editor.setCurrentTool(FLOATING_PORT_TOOL_ID)
			},
		},
	}
}
