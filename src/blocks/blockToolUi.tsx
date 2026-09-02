import type { Editor, TLUiToolsContextType } from 'tldraw'
import { BlockIcon } from './BlockIcon'
import { PillIcon } from './PillIcon'
import { BLOCK_TOOL_ID, PILL_TOOL_ID } from './blockModel'

function withoutShortcut(kbd: string | undefined, shortcut: string): string | undefined {
  if (!kbd) return kbd
  const next = kbd
    .split(',')
    .filter((candidate) => candidate.trim() !== shortcut)
    .join(',')
  return next || undefined
}

/** Take one key away from every stock tool that has it, so a semantic tool can own it. */
function releaseShortcut(tools: TLUiToolsContextType, shortcut: string): TLUiToolsContextType {
  return Object.fromEntries(
    Object.entries(tools).map(([id, tool]) => [
      id,
      tool.kbd?.split(',').some((candidate) => candidate.trim() === shortcut)
        ? { ...tool, kbd: withoutShortcut(tool.kbd, shortcut) }
        : tool,
    ]),
  ) as TLUiToolsContextType
}

/**
 * Add Block and Pill to tldraw's UI-tool registry with the donor's shortcuts:
 * B draws a Block, P draws a pill (a Block already in its `value` view).
 *
 * The drawing state nodes are registered separately through Tldraw's `tools`
 * prop. This helper is the shared presentation seam used by Stable and the
 * isolated Block development profile.
 */
export function withBlockTool(
  editor: Editor,
  tools: TLUiToolsContextType,
): TLUiToolsContextType {
  return {
    ...releaseShortcut(releaseShortcut(tools, 'b'), 'p'),
    [BLOCK_TOOL_ID]: {
      id: BLOCK_TOOL_ID,
      label: 'Block',
      icon: <BlockIcon />,
      kbd: 'b',
      onSelect() {
        editor.setCurrentTool(BLOCK_TOOL_ID)
      },
    },
    [PILL_TOOL_ID]: {
      id: PILL_TOOL_ID,
      label: 'Pill',
      icon: <PillIcon />,
      kbd: 'p',
      onSelect() {
        editor.setCurrentTool(PILL_TOOL_ID)
      },
    },
  }
}
