import type { Editor, TLUiToolsContextType } from 'tldraw'

import { AsyncRegionIcon } from './AsyncRegionIcon'
import { ASYNC_REGION_TOOL_ID } from './asyncRegionModel'

/** Add the Async region drawing state to the system-design tool family. */
export function withAsyncRegionTool(
	editor: Editor,
	tools: TLUiToolsContextType,
): TLUiToolsContextType {
	return {
		...tools,
		[ASYNC_REGION_TOOL_ID]: {
			id: ASYNC_REGION_TOOL_ID,
			label: 'Async region',
			icon: <AsyncRegionIcon />,
			onSelect() {
				editor.setCurrentTool(ASYNC_REGION_TOOL_ID)
			},
		},
	}
}
