import { describe, expect, it } from 'vitest'

import { createTypeProps, isTypeBlock, parseTypeAttributeSource, typeAttributeDisplay } from './typeAttributes'

describe('Type attribute source', () => {
	it('projects indented annotations into a compact tree without changing their source meaning', () => {
		const attributes = parseTypeAttributeSource('pose: Pose = …\n  xyz: Position = …\n    x: float = 0.0\nquality: float')
		expect(attributes.map((attribute) => attribute.name)).toEqual(['pose', 'quality'])
		expect(attributes[0]?.children[0]?.children[0]).toMatchObject({ name: 'x', type: 'float', value: '0.0' })
		expect(typeAttributeDisplay(attributes[0]!)).toBe('pose: Pose = …')
	})

	it('accepts a pasted NamedTuple body while keeping the class wrapper out of the attribute tree', () => {
		const source = 'class EstimatePairOut(NamedTuple):\n    """A pose and a score.\n\n    The prose must not become a fake attribute.\n    """\n    pose: Pose\n    quality: float'
		const attributes = parseTypeAttributeSource(source)
		expect(attributes.map((attribute) => [attribute.name, attribute.type])).toEqual([
			['pose', 'Pose'],
			['quality', 'float'],
		])
		expect(attributes.every((attribute) => attribute.indent === 0)).toBe(true)
	})

	it('learns the pasted body indent instead of assuming PEP 8 four spaces', () => {
		const twoSpace = parseTypeAttributeSource('class Foo:\n  pose: Pose\n  quality: float')
		expect(twoSpace.map((attribute) => attribute.indent)).toEqual([0, 0])

		const tabbed = parseTypeAttributeSource('class Foo:\n\tpose: Pose\n\tquality: float')
		expect(tabbed.map((attribute) => attribute.indent)).toEqual([0, 0])
	})

	it('keeps a nested attribute nested regardless of the outer class indent width', () => {
		const attributes = parseTypeAttributeSource('class Foo:\n  pose: Pose\n    x: float\n  quality: float')
		expect(attributes.map((attribute) => attribute.name)).toEqual(['pose', 'quality'])
		expect(attributes[0]?.children[0]).toMatchObject({ name: 'x', type: 'float' })
	})

	it('keeps incomplete lines readable rather than rejecting a whiteboard draft', () => {
		expect(parseTypeAttributeSource('pose: Pose\nthis is not ready')[1]).toMatchObject({
			name: 'this is not ready', type: '', raw: 'this is not ready',
		})
	})

	it('creates a class-derived Type as a Port-view Block with one editable body', () => {
		const props = createTypeProps()
		expect(isTypeBlock(props)).toBe(true)
		expect(props).toMatchObject({ view: 'port', icon: 'Braces', attributeSource: 'field: Type', inputs: [], outputs: [] })
	})
})
