import { createShapeId, type TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	appendBlockPortToProps,
	blockIcon,
	blockNotes,
	blockPortLayout,
	canReparentDraggedShapesIntoBlock,
	canBlockContainChildren,
	expandedSectionWeights,
	findBlockContainmentTarget,
	getDefaultBlockProps,
	mergeBlockResizeProps,
	portDefaultValue,
	portInHeader,
	portStartsBranch,
	portStartsGroup,
	resizeBlockProps,
	setBlockPlacementViewProps,
	setBlockViewProps,
	type BlockShape,
	type PortLayout,
} from './blockModel'

function blockShape(id: string, view: BlockShape['props']['view'], parentId = 'page:page'): BlockShape {
	const base = getDefaultBlockProps()
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: parentId as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: setBlockViewProps(base, view),
	}
}

describe('Block model', () => {
	it('restores the mature pyblocks empty primitive and remembered boxes', () => {
		const props = getDefaultBlockProps()
		expect(props).toMatchObject({
			w: 320,
			h: 206,
			title: '',
			blockType: '',
			icon: '',
			description: '',
			showDescription: true,
			notes: '',
			portLayout: 'inline',
			inputs: [],
			outputs: [],
			views: {
				simple: { w: 320, h: 206 },
				port: { w: 340, h: 198 },
				expanded: { w: 560, h: 380 },
			},
		})
	})

	it('gives pre-donor records safe fallbacks for every optional UI field', () => {
		const props = { ...getDefaultBlockProps() }
		delete props.icon
		delete props.notes
		delete props.expandedWeights
		// portLayout is a required StyleProp since the PortLayoutStyle migration.
		// The reader still guards an in-memory record assembled before the store
		// migrates it, which is what this line reproduces.
		delete (props as { portLayout?: PortLayout }).portLayout
		const port = { id: 'in_1', name: 'value', type: '', visible: true }

		expect(blockIcon(props)).toBe('')
		expect(blockNotes(props)).toBe('')
		expect(blockPortLayout(props)).toBe('inline')
		expect(expandedSectionWeights(props)).toEqual({})
		expect(portDefaultValue(port)).toBe('')
		expect(portStartsGroup(port)).toBe(false)
		expect(portStartsBranch(port)).toBe(false)
		expect(portInHeader(port)).toBe(false)
	})

	it('remembers an independent size for every visual view', () => {
		const simple = resizeBlockProps(getDefaultBlockProps(), 270, 160)
		const expanded = setBlockViewProps(simple, 'expanded')
		expect(expanded).toMatchObject({ view: 'expanded', w: 560, h: 380 })

		const resizedExpanded = resizeBlockProps(expanded, 760, 520)
		const restoredSimple = setBlockViewProps(resizedExpanded, 'simple')
		expect(restoredSimple).toMatchObject({ view: 'simple', w: 270, h: 160 })
		expect(restoredSimple.views.expanded).toEqual({ w: 760, h: 520 })
	})

	it('merges tldraw resize partials without dropping semantic Block props', () => {
		const original = getDefaultBlockProps()
		const resized = mergeBlockResizeProps(original, { w: 319.6, h: 191.2 })

		expect(resized.w).toBe(320)
		expect(resized.h).toBe(191)
		expect(resized.views.simple).toEqual({ w: 320, h: 191 })
		expect(resized.views.port).toEqual(original.views.port)
		expect(resized.inputs).toEqual(original.inputs)
		expect(resized.outputs).toEqual(original.outputs)
	})

	it('keeps the drawn box when placement infers a larger view', () => {
		const drawn = resizeBlockProps(getDefaultBlockProps(), 810, 400)
		const expanded = setBlockPlacementViewProps(drawn, 'expanded')
		expect(expanded).toMatchObject({ view: 'expanded', w: 810, h: 400 })
		expect(expanded.views.expanded).toEqual({ w: 810, h: 400 })
	})

	it('allocates stable port ids independently from editable names', () => {
		const props = {
			...getDefaultBlockProps(),
			inputs: [{ id: 'in_1', name: 'renamed', type: 'text', visible: true }],
		}
		const appended = appendBlockPortToProps(props, 'inputs')
		expect(appended.port).toMatchObject({ id: 'in_2', name: 'in_2' })
		expect(appended.props.inputs[0].name).toBe('renamed')
	})

	it('only gives the expanded view the frame containment contract', () => {
		expect(canBlockContainChildren('simple')).toBe(false)
		expect(canBlockContainChildren('port')).toBe(false)
		expect(canBlockContainChildren('expanded')).toBe(true)
	})
})

describe('expanded Block containment regression', () => {
	it('declines a collapsed child during creation so tldraw can find the expanded frame behind it', () => {
		const frame = blockShape('frame', 'expanded')
		const child = blockShape('child', 'simple', frame.id)
		expect(findBlockContainmentTarget(child, [frame], false)).toBeUndefined()
	})

	it('proxies an existing-child drag target to its nearest expanded ancestor', () => {
		const outer = blockShape('outer', 'expanded')
		const middle = blockShape('middle', 'port', outer.id)
		const child = blockShape('child', 'simple', middle.id)
		// This is Editor.getShapeAncestors' real order: outermost → nearest.
		const target = findBlockContainmentTarget(child, [outer, middle] as TLShape[], true)
		expect(target?.id).toBe(outer.id)
	})

	it('keeps a collapsed child in the nearest of two nested expanded ancestors', () => {
		const outer = blockShape('outer', 'expanded')
		const inner = blockShape('inner', 'expanded', outer.id)
		const child = blockShape('child', 'simple', inner.id)
		const target = findBlockContainmentTarget(child, [outer, inner] as TLShape[], true)
		expect(target?.id).toBe(inner.id)
	})

	it('keeps a nested expanded Block as the immediate target', () => {
		const outer = blockShape('outer', 'expanded')
		const inner = blockShape('inner', 'expanded', outer.id)
		expect(findBlockContainmentTarget(inner, [outer], false)?.id).toBe(inner.id)
	})

	it('never reparents an expanded Block into itself through an ancestor-proxied drag target', () => {
		const frame = blockShape('frame', 'expanded')
		const sibling = blockShape('sibling', 'simple')

		expect(canReparentDraggedShapesIntoBlock(frame, [frame])).toBe(false)
		expect(canReparentDraggedShapesIntoBlock(frame, [frame, sibling])).toBe(false)
		expect(canReparentDraggedShapesIntoBlock(frame, [sibling])).toBe(true)
	})
})

describe('the value view', () => {
	it('is remembered like every other view, with its own box', () => {
		const props = getDefaultBlockProps()
		expect(props.views.value).toEqual({ w: 168, h: 56 })
		const value = setBlockViewProps({ ...props, w: 400, h: 300 }, 'value')
		expect(value.view).toBe('value')
		expect({ w: value.w, h: value.h }).toEqual({ w: 168, h: 56 })
		// The Simple box just left is parked, and comes back on the way out.
		expect(value.views.simple).toEqual({ w: 400, h: 300 })
		const back = setBlockViewProps(value, 'simple')
		expect({ w: back.w, h: back.h }).toEqual({ w: 400, h: 300 })
	})

	it('never contains children', () => {
		expect(canBlockContainChildren('value')).toBe(false)
	})
})
