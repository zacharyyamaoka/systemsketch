import type { Editor, TLUiToolsContextType } from 'tldraw'
import { CodeIcon } from './CodeIcon'
import { CODE_TOOL_ID } from './codeModel'

function withoutShortcut(kbd: string | undefined, shortcut: string): string | undefined {
	if (!kbd) return kbd
	const next = kbd.split(',').filter((candidate) => candidate.trim() !== shortcut).join(',')
	return next || undefined
}

function withShortcut(kbd: string | undefined, shortcut: string): string {
	const shortcuts = kbd?.split(',').map((candidate) => candidate.trim()).filter(Boolean) ?? []
	return shortcuts.includes(shortcut) ? shortcuts.join(',') : [...shortcuts, shortcut].join(',')
}

/** Code stays menu/search-reachable; C and O deliberately converge on Ellipse. */
export function withCodeTool(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType {
	const released = Object.fromEntries(
		Object.entries(tools).map(([id, tool]) => [
			// WHY: C/O together make Ellipse available to both keyboard habits.
			// Keep one outcome even if a future stock tool acquires C.
			id,
			id === 'ellipse'
				? tool
				: tool.kbd?.split(',').some((candidate) => candidate.trim() === 'c')
					? { ...tool, kbd: withoutShortcut(tool.kbd, 'c') }
					: tool,
		]),
	) as TLUiToolsContextType
	const ellipse = released.ellipse

	return {
		...released,
		...(ellipse ? { ellipse: { ...ellipse, kbd: withShortcut(ellipse.kbd, 'c') } } : {}),
		[CODE_TOOL_ID]: {
			id: CODE_TOOL_ID,
			label: 'Code',
			icon: <CodeIcon />,
			onSelect() {
				editor.setCurrentTool(CODE_TOOL_ID)
			},
		},
	}
}
