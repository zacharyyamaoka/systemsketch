import type { Editor, TLUiToolsContextType } from 'tldraw'

import { CalloutIcon } from './CalloutIcon'
import { CALLOUT_TOOL_ID } from './calloutModel'

/** Registers the Callout toolbar item without replacing tldraw’s toolbar system. */
export function withCalloutTool(
  editor: Editor,
  tools: TLUiToolsContextType,
): TLUiToolsContextType {
  return {
    ...tools,
    [CALLOUT_TOOL_ID]: {
      id: CALLOUT_TOOL_ID,
      label: 'Callout',
      icon: <CalloutIcon />,
      onSelect() {
        editor.setCurrentTool(CALLOUT_TOOL_ID)
      },
    },
  }
}
