import type { ReactNode } from 'react'
import type { Editor } from 'tldraw'

export type CommandPaletteMode = 'commands' | 'find-replace'

export interface CommandPaletteAction {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  shortcut?: string
  icon?: ReactNode
  disabled?: boolean | ((editor: Editor) => boolean)
  /** Keep the palette open after a successful command. Defaults to false. */
  keepOpen?: boolean
  run(editor: Editor): void | Promise<void>
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function actionSearchText(action: CommandPaletteAction): string {
  return [action.label, action.description, action.shortcut, ...(action.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

function actionRank(action: CommandPaletteAction, query: string): number {
  const label = action.label.toLocaleLowerCase()
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2
  return 3
}

/** Token-aware, stable command filtering; all query words must be represented. */
export function filterCommandPaletteActions(
  actions: readonly CommandPaletteAction[],
  query: string,
): CommandPaletteAction[] {
  const tokens = normalized(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return [...actions]
  return actions
    .map((action, index) => ({ action, index, haystack: actionSearchText(action) }))
    .filter(({ haystack }) => tokens.every((token) => haystack.includes(token)))
    .sort((a, b) =>
      actionRank(a.action, tokens[0]) - actionRank(b.action, tokens[0]) || a.index - b.index,
    )
    .map(({ action }) => action)
}

export function commandPaletteActionDisabled(
  editor: Editor,
  action: CommandPaletteAction,
): boolean {
  return typeof action.disabled === 'function' ? action.disabled(editor) : Boolean(action.disabled)
}

export function nextPaletteIndex(
  current: number,
  direction: 1 | -1,
  itemCount: number,
): number {
  if (itemCount <= 0) return -1
  if (current < 0 || current >= itemCount) return direction === 1 ? 0 : itemCount - 1
  return (current + direction + itemCount) % itemCount
}
