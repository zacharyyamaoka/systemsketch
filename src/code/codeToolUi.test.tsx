import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLUiToolsContextType } from 'tldraw'
import { withCodeTool } from './codeToolUi'

describe('Code tool keyboard registration', () => {
	it('releases C from Code and gives Ellipse both C and O', () => {
		const editor = { setCurrentTool: vi.fn() } as unknown as Editor
		const ellipseSelect = vi.fn()
		const tools = {
			draw: { id: 'draw', label: 'Draw', icon: 'tool-pencil', kbd: 'd,c', onSelect: vi.fn() },
			ellipse: { id: 'ellipse', label: 'Ellipse', icon: 'geo-ellipse', kbd: 'o', onSelect: ellipseSelect },
		} as TLUiToolsContextType

		const registered = withCodeTool(editor, tools)

		expect(registered.draw.kbd).toBe('d')
		expect(registered.ellipse.kbd).toBe('o,c')
		expect(registered.code.kbd).toBeUndefined()
		registered.ellipse.onSelect('kbd')
		expect(ellipseSelect).toHaveBeenCalledWith('kbd')
	})
})
