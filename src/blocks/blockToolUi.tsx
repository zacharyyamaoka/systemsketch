import type { Editor, TLUiToolsContextType } from 'tldraw'
import { BlockIcon } from './BlockIcon'
import { PillIcon } from './PillIcon'
import { TypeIcon } from './TypeIcon'
import { BLOCK_TOOL_ID, PILL_TOOL_ID, TYPE_TOOL_ID } from './blockModel'

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
 * Add Block, Pill, and Type to tldraw's UI-tool registry. Type deliberately
 * has no shortcut: T remains stock text, while its tool stays discoverable.
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
    [TYPE_TOOL_ID]: {
      id: TYPE_TOOL_ID,
      label: 'Type',
      icon: <TypeIcon />,
      onSelect() {
        editor.setCurrentTool(TYPE_TOOL_ID)
      },
    },
  }
}
