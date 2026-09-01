import { describe, expect, it } from 'vitest'
import { getDefaultBlockProps } from '../blockModel'
import { BLOCK_PICKER_PRESETS, blockPresetProps } from './blockPicker'
import { getBlockConnectionPorts } from './blockPorts'

describe('block picker presets', () => {
	it('offers at least one preset that can receive a cable and one that can send', () => {
		expect(BLOCK_PICKER_PRESETS.some((preset) => preset.inputs > 0)).toBe(true)
		expect(BLOCK_PICKER_PRESETS.some((preset) => preset.outputs > 0)).toBe(true)
	})

	it('names ports exactly as the inspector Add control does', () => {
		// Nothing downstream should be able to tell a picked Block from a drawn one.
		const branch = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'branch')!
		const props = blockPresetProps(branch, getDefaultBlockProps())
		expect(props.inputs.map((port) => port.id)).toEqual(['in_1'])
		expect(props.outputs.map((port) => port.id)).toEqual(['out_1', 'out_2'])
		expect(props.inputs[0].name).toBe('in_1')
	})

	it('adopts the preset view and its remembered box', () => {
		const group = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'group')!
		const base = getDefaultBlockProps()
		const props = blockPresetProps(group, base)
		expect(props.view).toBe('expanded')
		expect({ w: props.w, h: props.h }).toEqual(base.views.expanded)
	})

	it('gives every preset a landing port for the terminal it advertises', () => {
		for (const preset of BLOCK_PICKER_PRESETS) {
			const ports = getBlockConnectionPorts(blockPresetProps(preset, getDefaultBlockProps()))
			const outer = ports.filter((port) => !port.inner)
			expect(outer.filter((port) => port.terminal === 'end')).toHaveLength(preset.inputs)
			expect(outer.filter((port) => port.terminal === 'start')).toHaveLength(preset.outputs)
		}
	})
})
