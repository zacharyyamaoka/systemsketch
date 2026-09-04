import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from './blockModel'
import {
	appendSetAttributesMemberProps,
	createClockTriggerProps,
	createSelectProps,
	createSetAttributesProps,
	setAttributesMemberPorts,
	stockBlockSourceProjection,
} from './stockBlocks'

describe('stock semantic Blocks', () => {
	it('creates a batched Set attributes Block with ordinary record data at both edges', () => {
		const props = createSetAttributesProps()
		expect(props.blockType).toBe('set-attributes')
		expect(props.inputs[0]).toMatchObject({ id: 'record', name: 'record', type: 'Record' })
		expect(props.outputs).toEqual([expect.objectContaining({ id: 'record_out', name: 'record', type: 'Record' })])
		// This is a returned value, not the top-edge mutation grammar.
		expect(props.outputs[0].effect).not.toBe(true)
		expect(setAttributesMemberPorts(props).map((port) => port.id)).toEqual(['member_1'])
	})

	it('keeps a member cable identity stable while the member name changes', () => {
		const once = createSetAttributesProps()
		const renamed = {
			...once,
			inputs: once.inputs.map((port) => port.id === 'member_1' ? { ...port, name: '.quota' } : port),
		}
		const twice = appendSetAttributesMemberProps(renamed)
		expect(setAttributesMemberPorts(twice).map((port) => [port.id, port.name])).toEqual([
			['member_1', '.quota'],
			['member_2', '.field'],
		])
		expect(stockBlockSourceProjection(twice)).toBe('setattr(record, quota=…, field=…)')
	})

	it('creates a true value Select rather than a Branch', () => {
		const props = createSelectProps()
		expect(props.blockType).toBe('select')
		expect(props.inputs.map((port) => [port.id, port.name, port.type])).toEqual([
			['condition', 'condition', 'bool'],
			['true_value', 'true', ''],
			['false_value', 'false', ''],
		])
		expect(props.outputs).toEqual([expect.objectContaining({ id: 'result' })])
		expect(props.outputs[0].effect).not.toBe(true)
		expect(stockBlockSourceProjection(props)).toBe('true_value if condition else false_value')
	})

	it('persists Clock intent but never turns it into an implied runtime', () => {
		const props = createClockTriggerProps()
		expect(props.outputs).toEqual([expect.objectContaining({ id: 'trigger', type: 'Trigger' })])
		expect(props.stockConfig).toEqual({ triggerSource: 'clock', rateHz: 10, runtimeAdapter: 'unavailable' })
		expect(stockBlockSourceProjection(props)).toBeNull()
		// Its configuration is data in ordinary Block props, so document JSON
		// carries it without a side channel or a scheduler record.
		const restored = JSON.parse(JSON.stringify({ ...getDefaultBlockProps(), ...props }))
		expect(restored.stockConfig).toEqual(props.stockConfig)
	})
})
