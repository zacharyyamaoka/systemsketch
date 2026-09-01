import type { Editor, TLUiToolsContextType } from 'tldraw'
import { BlockIcon } from './BlockIcon'
import { BLOCK_TOOL_ID } from './blockModel'

function withoutShortcut(kbd: string | undefined, shortcut: string): string | undefined {
  if (!kbd) return kbd
  const next = kbd
    .split(',')
    .filter((candidate) => candidate.trim() !== shortcut)
    .join(',')
  return next || undefined
}

/**
 * Add Block to tldraw's UI-tool registry and give it the donor's B shortcut.
 *
 * The drawing state node is registered separately through Tldraw's `tools`
 * prop. This helper is the shared presentation seam used by Stable and the
 * isolated Block development profile.
 */
export function withBlockTool(
  editor: Editor,
  tools: TLUiToolsContextType,
): TLUiToolsContextType {
  return {
    ...tools,
    ...(tools.draw ? { draw: { ...tools.draw, kbd: withoutShortcut(tools.draw.kbd, 'b') } } : {}),
    [BLOCK_TOOL_ID]: {
      id: BLOCK_TOOL_ID,
      label: 'Block',
      icon: <BlockIcon />,
      kbd: 'b',
      onSelect() {
        editor.setCurrentTool(BLOCK_TOOL_ID)
      },
    },
  }
}
