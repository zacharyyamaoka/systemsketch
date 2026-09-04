import { describe, expect, it } from 'vitest'
import { getDefaultBlockProps } from '../blockModel'
import { BLOCK_PICKER_PRESETS, blockPickerPresetsFor, blockPresetProps } from './blockPicker'
import { firstOuterPortForPolarity } from './connectionRules'

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

	it('gives every preset a landing port for the polarity it advertises', () => {
		for (const preset of BLOCK_PICKER_PRESETS) {
			const props = blockPresetProps(preset, getDefaultBlockProps())
			expect(firstOuterPortForPolarity(props, 'sink') !== null).toBe(preset.inputs > 0)
			expect(firstOuterPortForPolarity(props, 'source') !== null).toBe(preset.outputs > 0)
		}
	})

	it('offers only the presets that can answer the cable', () => {
		// A cable looking for a consumer is not helped by a Source; one looking
		// for a producer is not helped by a Sink.
		expect(blockPickerPresetsFor(false).every((preset) => preset.inputs > 0)).toBe(true)
		expect(blockPickerPresetsFor(true).every((preset) => preset.outputs > 0)).toBe(true)
		expect(blockPickerPresetsFor(false).map((preset) => preset.id)).not.toContain('source')
		expect(blockPickerPresetsFor(true).map((preset) => preset.id)).not.toContain('sink')
	})

	it('ships the three approved semantic stock Blocks through the same picker seam', () => {
		const setAttributes = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'set-attributes')!
		const select = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'select')!
		const clock = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'clock-trigger')!

		expect(blockPresetProps(setAttributes, getDefaultBlockProps())).toMatchObject({
			blockType: 'set-attributes', inputs: expect.arrayContaining([expect.objectContaining({ id: 'record' })]),
		})
		expect(blockPresetProps(select, getDefaultBlockProps())).toMatchObject({
			blockType: 'select', inputs: expect.arrayContaining([expect.objectContaining({ id: 'condition', type: 'bool' })]),
		})
		expect(blockPresetProps(clock, getDefaultBlockProps())).toMatchObject({
			blockType: 'clock-trigger', stockConfig: { triggerSource: 'clock', rateHz: 10 },
		})
		expect(blockPickerPresetsFor(true).map((preset) => preset.id)).toContain('clock-trigger')
	})
})

describe('the Value preset', () => {
	it('answers a cable that wants a producer and one that wants a consumer', () => {
		// A variable can be typed as a literal and read, or fed a result and named.
		expect(blockPickerPresetsFor(true).some((preset) => preset.id === 'value')).toBe(true)
		expect(blockPickerPresetsFor(false).some((preset) => preset.id === 'value')).toBe(true)
	})

	it('arrives as an unnamed variable in the value view, an inlet and an outlet', () => {
		const value = BLOCK_PICKER_PRESETS.find((preset) => preset.id === 'value')!
		const props = blockPresetProps(value, getDefaultBlockProps())
		expect(props.view).toBe('value')
		expect(props.blockType).toBe('literal')
		expect(props.inputs).toEqual([{ id: 'in_1', name: '', type: '', visible: true }])
		expect(props.outputs).toEqual([{ id: 'out_1', name: '', type: '', visible: true }])
		expect(firstOuterPortForPolarity(props, 'source')?.id).toBe('out_1')
		expect(firstOuterPortForPolarity(props, 'sink')?.id).toBe('in_1')
	})
})
