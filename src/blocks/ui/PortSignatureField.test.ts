import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import { portCompletionSource } from './PortSignatureField'

function complete(text: string, pos: number, explicit = false) {
	const state = EditorState.create({ doc: text })
	const source = portCompletionSource({ editor: null, registryNames: ['chassis_width', 'wheel_radius'] })
	return source(new CompletionContext(state, pos, explicit))
}

describe('portCompletionSource', () => {
	it('never interrupts a name', () => {
		expect(complete('temperature', 11)).toBeNull()
		expect(complete('temperature sensor', 18, true)).toBeNull()
	})

	it('offers the board variables and the safe namespace in the default slot', () => {
		const result = complete('radius: float = cha', 19)
		expect(result).not.toBeNull()
		const labels = result!.options.map((option) => option.label)
		expect(labels).toContain('chassis_width')
		expect(labels).toContain('wheel_radius')
		expect(labels).toContain('round')
		expect(result!.from).toBe(16)
	})

	it('stays quiet in the default slot before a word starts, unless asked', () => {
		expect(complete('radius: float = ', 16)).toBeNull()
		expect(complete('radius: float = ', 16, true)).not.toBeNull()
	})

	it('has no types to offer without a board', () => {
		expect(complete('pose: P', 7)).toBeNull()
	})
})
