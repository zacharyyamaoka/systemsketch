import type { Editor, TLUiToolsContextType } from 'tldraw'
import { CodeIcon } from './CodeIcon'
import { CODE_TOOL_ID } from './codeModel'

function withoutShortcut(kbd: string | undefined, shortcut: string): string | undefined {
	if (!kbd) return kbd
	const next = kbd.split(',').filter((candidate) => candidate.trim() !== shortcut).join(',')
	return next || undefined
}

/** Code deliberately claims C: the custom canvas primitive must be reachable without a menu. */
export function withCodeTool(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType {
	const released = Object.fromEntries(
		Object.entries(tools).map(([id, tool]) => [
			id,
			tool.kbd?.split(',').some((candidate) => candidate.trim() === 'c')
				? { ...tool, kbd: withoutShortcut(tool.kbd, 'c') }
				: tool,
		]),
	) as TLUiToolsContextType

	return {
		...released,
		[CODE_TOOL_ID]: {
			id: CODE_TOOL_ID,
			label: 'Code',
			icon: <CodeIcon />,
			kbd: 'c',
			onSelect() {
				editor.setCurrentTool(CODE_TOOL_ID)
			},
		},
	}
}
