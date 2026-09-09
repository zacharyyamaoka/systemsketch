import { describe, expect, it } from 'vitest'

import {
	formatPortSignature,
	parsePortSignature,
	portSignaturePatch,
	portSignatureSlotAt,
	portTypeSlot,
} from './portSignature'

describe('parsePortSignature', () => {
	it('reads a full Python parameter into name, type and default', () => {
		const parsed = parsePortSignature('pose: Pose = None')
		expect(parsed).toMatchObject({ name: 'pose', type: 'Pose', defaultValue: 'None' })
		expect(parsed.spans.colon).toBe(4)
		expect(parsed.spans.equals).toBe(11)
	})

	it('treats free text as a name and nothing else', () => {
		expect(parsePortSignature('temperature sensor readings')).toMatchObject({
			name: 'temperature sensor readings',
			type: '',
			defaultValue: '',
		})
	})

	it('keeps brackets and quotes out of the split', () => {
		expect(parsePortSignature('table: dict[str, int] = {"a": 1}')).toMatchObject({
			name: 'table',
			type: 'dict[str, int]',
			defaultValue: '{"a": 1}',
		})
		expect(parsePortSignature('f: Callable[[int], str] = lambda x: str(x)')).toMatchObject({
			name: 'f',
			type: 'Callable[[int], str]',
			defaultValue: 'lambda x: str(x)',
		})
		expect(parsePortSignature("label = 'a: b = c'")).toMatchObject({
			name: 'label',
			type: '',
			defaultValue: "'a: b = c'",
		})
	})

	it('does not mistake comparisons or a walrus for the assignment', () => {
		expect(parsePortSignature('ok: bool = a == b')).toMatchObject({ type: 'bool', defaultValue: 'a == b' })
		expect(parsePortSignature('n = x := 3')).toMatchObject({ name: 'n', defaultValue: 'x := 3' })
	})

	it('tolerates any spacing and a missing side', () => {
		expect(parsePortSignature('x:int=3')).toMatchObject({ name: 'x', type: 'int', defaultValue: '3' })
		expect(parsePortSignature('gain = 1.0')).toMatchObject({ name: 'gain', type: '', defaultValue: '1.0' })
		expect(parsePortSignature(': int')).toMatchObject({ name: '', type: 'int', defaultValue: '' })
		expect(parsePortSignature('')).toMatchObject({ name: '', type: '', defaultValue: '' })
	})
})

describe('formatPortSignature', () => {
	it('spells the stored triple canonically and round-trips it', () => {
		const ports = [
			{ name: 'pose', type: 'Pose', defaultValue: 'None' },
			{ name: 'raw', type: 'bytes' },
			{ name: 'gain', type: '', defaultValue: '1.0' },
			{ name: 'temperature sensor readings', type: '' },
			{ name: 'a b', type: 'int' },
			{ name: 'table', type: 'dict[str, int]', defaultValue: '{"a": 1}' },
		]
		for (const port of ports) {
			const text = formatPortSignature(port)
			const back = parsePortSignature(text)
			expect(back.name).toBe(port.name)
			expect(back.type).toBe(port.type)
			expect(back.defaultValue).toBe(port.defaultValue ?? '')
		}
		expect(formatPortSignature({ name: 'pose', type: 'Pose', defaultValue: 'None' })).toBe('pose: Pose = None')
		expect(formatPortSignature({ name: 'raw', type: 'bytes' })).toBe('raw: bytes')
		expect(formatPortSignature({ name: 'gain', type: '', defaultValue: '1.0' })).toBe('gain = 1.0')
	})
})

describe('portSignatureSlotAt', () => {
	const text = 'pose: Pose = None'
	it('names the slot under the caret', () => {
		expect(portSignatureSlotAt(text, 2).slot).toBe('name')
		expect(portSignatureSlotAt(text, 4).slot).toBe('name')
		expect(portSignatureSlotAt(text, 5)).toMatchObject({ slot: 'type', start: 6, query: '' })
		expect(portSignatureSlotAt(text, 8)).toMatchObject({ slot: 'type', start: 6, query: 'Po' })
		expect(portSignatureSlotAt(text, 12)).toMatchObject({ slot: 'default', start: 13, query: '' })
		expect(portSignatureSlotAt(text, 17)).toMatchObject({ slot: 'default', start: 13, query: 'None' })
	})

	it('is a type slot only in the type', () => {
		expect(portTypeSlot(text, 2)).toBeNull()
		expect(portTypeSlot(text, 8)).toEqual({ start: 6, query: 'Po' })
		expect(portTypeSlot(text, 15)).toBeNull()
		expect(portTypeSlot('x:', 2)).toEqual({ start: 2, query: '' })
	})
})

describe('portSignaturePatch', () => {
	it('returns only what changed, and null when nothing did', () => {
		const port = { name: 'pose', type: 'Pose', defaultValue: 'None' }
		expect(portSignaturePatch(port, 'pose: Pose = None')).toBeNull()
		expect(portSignaturePatch(port, 'pose: Pose')).toEqual({ defaultValue: undefined })
		expect(portSignaturePatch(port, 'pos: Pose = None')).toEqual({ name: 'pos' })
		expect(portSignaturePatch(port, 'pose')).toEqual({ type: '', defaultValue: undefined })
	})

	it('never stores an empty default', () => {
		expect(portSignaturePatch({ name: 'x', type: '' }, 'x =')).toBeNull()
		expect(portSignaturePatch({ name: 'x', type: '' }, 'x: int')).toEqual({ type: 'int' })
	})
})
