import { describe, expect, it } from 'vitest'
import { getDefaultBlockProps, setBlockViewProps, type BlockShapeProps } from './blockModel'
import { VALUE_HEIGHT_PX, VALUE_MIN_WIDTH_PX, VALUE_PAD_X, layoutBlock } from './layoutBlock'
import {
	VALUE_FOLD_LENGTH,
	createValueBlockProps,
	inferLiteralType,
	isFoldedLiteral,
	normalizeValueBlockProps,
	valueBlockExactText,
	valueBlockLabel,
	valueBlockSize,
	valueBlockText,
} from './valueBlock'

const DICT = '{"quat": True, "units": "m", "frame_id": "base_link"}'

describe('inferLiteralType', () => {
	it.each([
		['2.0', 'float'],
		['-1.5e3', 'float'],
		['.5', 'float'],
		['2', 'int'],
		['-40', 'int'],
		['True', 'bool'],
		['False', 'bool'],
		['None', 'None'],
		['"base_link"', 'str'],
		["'x'", 'str'],
		['f"{a}"', 'str'],
		['r"raw"', 'str'],
		['b"\\x00"', 'bytes'],
		['rb"\\x00"', 'bytes'],
		[DICT, 'dict'],
		['{}', 'dict'],
		['{1, 2}', 'set'],
		['[1, 2, 3]', 'list'],
		['(1, 2)', 'tuple'],
		['math.pi', ''],
		['', ''],
	])('%s → %s', (literal, type) => {
		expect(inferLiteralType(literal)).toBe(type)
	})
})

describe('folding', () => {
	it('shows a short literal whole and folds a long or multi-line one', () => {
		expect(isFoldedLiteral('2.0')).toBe(false)
		expect(isFoldedLiteral('x'.repeat(VALUE_FOLD_LENGTH))).toBe(false)
		expect(isFoldedLiteral('x'.repeat(VALUE_FOLD_LENGTH + 1))).toBe(true)
		expect(isFoldedLiteral('[\n1\n]')).toBe(true)
		expect(isFoldedLiteral(DICT)).toBe(true)
	})

	it('paints the name only once the outlet has one', () => {
		const unnamed = createValueBlockProps(getDefaultBlockProps(), '2.0')
		expect(valueBlockText(valueBlockLabel(unnamed))).toBe('= 2.0')
		const named = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
		expect(valueBlockText(valueBlockLabel(named))).toBe('gain: float = 2.0')
		const folded = createValueBlockProps(getDefaultBlockProps(), DICT, 'opts')
		expect(valueBlockLabel(folded)).toMatchObject({ display: '…', folded: true, literal: DICT })
		expect(valueBlockText(valueBlockLabel(folded))).toBe('opts: dict = …')
	})

	it('preserves authored punctuation and whitespace unless it explicitly abbreviates', () => {
		const literal = '  _gain_copy_  '
		const props = createValueBlockProps(getDefaultBlockProps(), literal, 'gain_copy')
		const label = valueBlockLabel(props)
		expect(label).toMatchObject({ literal, display: literal, folded: false })
		expect(valueBlockText(label)).toBe('gain_copy =   _gain_copy_  ')
		expect(valueBlockExactText(label)).toBe('gain_copy =   _gain_copy_  ')
	})
})

describe('a fresh pill', () => {
	it('is a Block in the value view with one unnamed, typed inlet and outlet', () => {
		const props = createValueBlockProps(getDefaultBlockProps(), '2.0')
		expect(props.view).toBe('value')
		expect(props.blockType).toBe('literal')
		expect(props.inputs).toEqual([{ id: 'in_1', name: '', type: 'float', visible: true }])
		expect(props.outputs).toEqual([{ id: 'out_1', name: '', type: 'float', visible: true }])
		expect(props.h).toBe(VALUE_HEIGHT_PX)
		expect(props.views.value).toEqual({ w: props.w, h: props.h })
	})

	it('is as wide as its text and never narrower than the floor', () => {
		const empty = createValueBlockProps(getDefaultBlockProps())
		const short = createValueBlockProps(getDefaultBlockProps(), '2.0')
		const named = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
		expect(empty.w).toBeGreaterThanOrEqual(VALUE_MIN_WIDTH_PX)
		expect(short.w).toBeGreaterThan(VALUE_PAD_X * 2)
		expect(named.w).toBeGreaterThan(short.w)
		expect(valueBlockSize(valueBlockLabel(named)).w).toBe(named.w)
	})
})

describe('normalizeValueBlockProps', () => {
	function valueBlock(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
		return { ...createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain'), ...overrides }
	}

	it('leaves every other view alone', () => {
		const port = setBlockViewProps(getDefaultBlockProps(), 'port')
		expect(normalizeValueBlockProps(port)).toBe(port)
	})

	it('returns the same object when nothing has to change', () => {
		const props = valueBlock()
		expect(normalizeValueBlockProps(props, props)).toBe(props)
	})

	it('keeps exactly one inlet and one outlet, preserving identity and mirroring the name', () => {
		const props = valueBlock({
			inputs: [
				{ id: 'in_3', name: 'x', type: '', visible: false, defaultValue: '1.0' },
				{ id: 'in_4', name: 'extra', type: '', visible: true },
			],
			outputs: [
				{ id: 'out_7', name: 'gain', type: 'float', visible: false },
				{ id: 'out_8', name: 'extra', type: '', visible: true },
			],
		})
		const next = normalizeValueBlockProps(props)
		expect(next.inputs).toEqual([{ id: 'in_3', name: 'gain', type: 'float', visible: true }])
		expect(next.outputs).toEqual([{ id: 'out_7', name: 'gain', type: 'float', visible: true }])
	})

	it('strips callable-Definition metadata so copied pills are always independent', () => {
		const props = valueBlock({
			definitionId: 'shared-callable-definition',
			definitionKey: 'shared_callable',
			draftOrdinal: 2,
		})
		const normalised = normalizeValueBlockProps(props)
		expect(normalised.definitionId).toBeUndefined()
		expect(normalised.definitionKey).toBeUndefined()
		expect(normalised.draftOrdinal).toBeUndefined()
	})

	it('honours a rename through either rim', () => {
		const previous = valueBlock()
		const viaOutlet = normalizeValueBlockProps(
			{ ...previous, outputs: [{ ...previous.outputs[0], name: 'k' }] }, previous)
		expect(viaOutlet.inputs[0].name).toBe('k')
		expect(viaOutlet.outputs[0].name).toBe('k')
		const viaInlet = normalizeValueBlockProps(
			{ ...previous, inputs: [{ ...previous.inputs[0], name: 'scale' }] }, previous)
		expect(viaInlet.outputs[0].name).toBe('scale')
		expect(viaInlet.inputs[0].name).toBe('scale')
	})

	it('gives a record with only an inlet its name and an outlet', () => {
		const sink = normalizeValueBlockProps({
			...createValueBlockProps(getDefaultBlockProps(), '', 'payload'),
			outputs: [],
		})
		expect(sink.outputs).toEqual([{ id: 'out_1', name: 'payload', type: '', visible: true }])
	})

	it('re-infers the type when the literal changes and keeps it otherwise', () => {
		const previous = valueBlock()
		const retyped = normalizeValueBlockProps({ ...previous, title: '"m"' }, previous)
		expect(retyped.outputs[0].type).toBe('str')

		const manual = { ...previous, outputs: [{ ...previous.outputs[0], type: 'Gain' }] }
		expect(normalizeValueBlockProps(manual, manual).outputs[0].type).toBe('Gain')

		// An expression the spelling cannot type keeps the type it had.
		const opaque = normalizeValueBlockProps({ ...manual, title: 'math.pi' }, manual)
		expect(opaque.outputs[0].type).toBe('Gain')
	})

	it('keeps an explicit annotation when canvas entry changes it with the literal', () => {
		const previous = valueBlock()
		const annotated = normalizeValueBlockProps({
			...previous,
			title: '2',
			inputs: [{ ...previous.inputs[0], name: 'pose', type: 'Pose' }],
			outputs: [{ ...previous.outputs[0], name: 'pose', type: 'Pose' }],
		}, previous)
		expect(annotated.outputs[0]).toMatchObject({ name: 'pose', type: 'Pose' })
		expect(annotated.inputs[0]).toMatchObject({ name: 'pose', type: 'Pose' })
	})

	it('re-fits the box when the text changes, in the box and in the remembered view', () => {
		const previous = valueBlock()
		const longer = normalizeValueBlockProps({ ...previous, title: '123456.789' }, previous)
		expect(longer.w).toBeGreaterThan(previous.w)
		expect(longer.views.value).toEqual({ w: longer.w, h: longer.h })
		expect(longer.h).toBe(VALUE_HEIGHT_PX)
	})

	it('fits a Block switched into the value view from another view', () => {
		const port = setBlockViewProps({
			...getDefaultBlockProps(),
			title: '2.0',
			inputs: [{ id: 'in_1', name: 'x', type: '', visible: true }],
			outputs: [{ id: 'out_1', name: 'out_1', type: '', visible: true }],
		}, 'port')
		const switched = normalizeValueBlockProps(setBlockViewProps(port, 'value'), port)
		expect(switched.view).toBe('value')
		expect(switched.inputs).toEqual([{ id: 'in_1', name: 'out_1', type: 'float', visible: true }])
		expect(switched.outputs[0]).toMatchObject({ id: 'out_1', name: 'out_1', type: 'float' })
		expect(switched.h).toBe(VALUE_HEIGHT_PX)
	})
})

describe('the capsule layout', () => {
	it('puts the inlet on the left rim, the outlet on the right, both at mid-height, and the text across the face', () => {
		const props = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
		const layout = layoutBlock(props)
		expect(layout.view).toBe('value')
		expect(layout.header).toBeNull()
		expect(layout.footerTop).toBe(props.h)
		expect(layout.ports).toHaveLength(2)
		expect(layout.ports[0]).toMatchObject({
			side: 'input',
			x: 0,
			y: props.h / 2,
			subtle: false,
			label: null,
		})
		expect(layout.ports[1]).toMatchObject({
			side: 'output',
			x: props.w,
			y: props.h / 2,
			subtle: false,
			label: null,
		})
		expect(layout.title).toEqual({ x: VALUE_PAD_X, y: 0, w: props.w - VALUE_PAD_X * 2, h: props.h })
	})
})
