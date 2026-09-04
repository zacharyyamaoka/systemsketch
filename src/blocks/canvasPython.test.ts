import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from './blockModel'
import {
	applyCanvasPillSignature,
	canvasPortSignaturePatch,
	parseCanvasPythonSignature,
} from './canvasPython'
import { createValueBlockProps } from './valueBlock'

describe('canvas Python signatures', () => {
	it('splits a typed declaration without evaluating its value', () => {
		expect(parseCanvasPythonSignature('raw: bytes = {"scale": 2.0}')).toEqual({
			name: 'raw', type: 'bytes', value: '{"scale": 2.0}', hasAnnotation: true, hasAssignment: true,
		})
	})

	it('does not mistake a comparison for an assignment', () => {
		expect(parseCanvasPythonSignature('left == right')).toMatchObject({
			name: 'left == right', hasAnnotation: false, hasAssignment: false,
		})
	})

	it('fills a pill from name, annotation, and literal in one canvas edit', () => {
		const blank = createValueBlockProps(getDefaultBlockProps())
		const next = applyCanvasPillSignature(blank, 'pose: Pose = 2')
		expect(next.title).toBe('2')
		expect(next.inputs[0]).toMatchObject({ name: 'pose', type: 'Pose' })
		expect(next.outputs[0]).toMatchObject({ name: 'pose', type: 'Pose' })
	})

	it('keeps a pristine bare literal as the concise unnamed-pill shorthand', () => {
		const next = applyCanvasPillSignature(createValueBlockProps(getDefaultBlockProps()), '2.0')
		expect(next.title).toBe('2.0')
		expect(next.outputs[0]).toMatchObject({ name: '', type: '' })
	})

	it('keeps a bare canvas word as a name once the pill is not pristine', () => {
		const pill = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
		const next = applyCanvasPillSignature(pill, 'scale')
		expect(next.title).toBe('2.0')
		expect(next.outputs[0]).toMatchObject({ name: 'scale', type: 'float' })
	})

	it('uses the same declaration shell for a new input port and its default', () => {
		const patch = canvasPortSignaturePatch(
			{ id: 'in_1', name: 'in_1', type: '', visible: true },
			'inputs',
			'raw: bytes = 2.0',
		)
		expect(patch).toEqual({ name: 'raw', type: 'bytes', defaultValue: '2.0' })
	})
})
