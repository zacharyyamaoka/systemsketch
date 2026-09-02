import { createShapeId, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShape,
} from '../blockModel'
import {
	getBlockConnectionPort,
	getBlockConnectionPorts,
	getBlockPortDotAtPoint,
	getBlockPortDotsNear,
} from './blockPorts'

function portView() {
	return {
		...setBlockViewProps(getDefaultBlockProps(), 'port'),
		inputs: [
			{ id: 'in_a', name: 'a', type: '', visible: true },
			{ id: 'in_b', name: 'b', type: '', visible: true },
		],
		outputs: [{ id: 'out_a', name: 'result', type: '', visible: true }],
	}
}

function blockShape(props = portView(), id = 'ports'): BlockShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props,
	}
}

/** A pure editor: page-space equals shape-space, no store, one Block. */
function pureEditor(shapes: BlockShape[], size = { w: 360, h: 230 }): Editor {
	return {
		getZoomLevel: () => 1,
		getCurrentPageShapesSorted: () => shapes,
		isShapeHidden: () => false,
		store: undefined,
		getShape: (id: string) => shapes.find((shape) => shape.id === id),
		getShapePageBounds: () => ({ minX: 0, minY: 0, maxX: size.w, maxY: size.h }),
		getShapePageTransform: () => ({
			applyToPoint: (point: { x: number; y: number }) => ({ ...point }),
		}),
	} as unknown as Editor
}

describe('Block connection ports', () => {
	it('keeps every Simple-view identity live at its coincident donor midpoint', () => {
		const props = {
			...setBlockViewProps(portView(), 'simple'),
			inputs: [
				{ id: 'in_a', name: 'a', type: '', visible: true },
				{ id: 'in_b', name: 'b', type: '', visible: true },
			],
		}
		expect(getBlockConnectionPorts(props).map(({ id, x, y, subtle }) => ({
			id,
			x,
			y,
			subtle,
		}))).toEqual([
			{ id: 'in_a', x: 0, y: 103, subtle: true },
			{ id: 'in_b', x: 0, y: 103, subtle: true },
			{ id: 'out_a', x: 320, y: 103, subtle: true },
		])
	})

	it('projects one port per port, carrying its lane and no direction', () => {
		// Direction is not a property of a port. It is `portPolarity(side, face)`,
		// and the face belongs to the cable end, not the port — a port projected
		// with a built-in terminal is exactly the model this replaced.
		const ports = getBlockConnectionPorts(portView())
		expect(ports.map(({ id, side }) => ({ id, side }))).toEqual([
			{ id: 'in_a', side: 'input' },
			{ id: 'in_b', side: 'input' },
			{ id: 'out_a', side: 'output' },
		])
		expect(ports.some((port) => 'terminal' in port || 'inner' in port)).toBe(false)
	})

	it('never grows a twin: an Expanded Block has the same ports as a Port one', () => {
		const expanded = setBlockViewProps(portView(), 'expanded')
		expect(getBlockConnectionPorts(expanded).map((port) => port.id))
			.toEqual(['in_a', 'in_b', 'out_a'])
	})

	it('follows stable identity when ports reorder', () => {
		const before = portView()
		const anchorBefore = getBlockConnectionPort(before, 'in_a')!.anchor
		const after = { ...before, inputs: [...before.inputs].reverse() }
		const anchorAfter = getBlockConnectionPort(after, 'in_a')!.anchor
		expect(anchorAfter.y).not.toBe(anchorBefore.y)
	})

	it('keeps hidden port identity anchored without exposing a new hit target', () => {
		const props = portView()
		props.inputs[0] = { ...props.inputs[0], visible: false }
		const hidden = getBlockConnectionPort(props, 'in_a')
		expect(hidden).toMatchObject({ id: 'in_a', hidden: true })
		expect(hidden?.anchor).toEqual(getBlockConnectionPort(props, 'in_b')?.anchor)
		expect(getBlockConnectionPorts(props).some((port) => port.id === 'in_a')).toBe(false)
		expect(getBlockConnectionPort(props, 'missing')).toBeNull()
	})
})

describe('dot hit testing', () => {
	it('answers with the nearest visible dot within reach, nothing about polarity', () => {
		const shape = blockShape()
		const editor = pureEditor([shape])
		const output = getBlockConnectionPort(shape.props, 'out_a')!
		expect(getBlockPortDotAtPoint(editor, output)?.port.id).toBe('out_a')
		expect(getBlockPortDotAtPoint(editor, { x: output.x + 8, y: output.y - 8 })?.port.id)
			.toBe('out_a')
		expect(getBlockPortDotAtPoint(editor, { x: output.x - 200, y: output.y })).toBeNull()
	})

	it('lists every dot in reach nearest-first so the rules can pick the first legal one', () => {
		const shape = blockShape()
		const editor = pureEditor([shape])
		const a = getBlockConnectionPort(shape.props, 'in_a')!
		const b = getBlockConnectionPort(shape.props, 'in_b')!
		const between = { x: a.x, y: (a.y * 2 + b.y) / 3 }
		const hits = getBlockPortDotsNear(editor, between, { pageRadius: 60 })
		expect(hits.map((hit) => hit.port.id)).toEqual(['in_a', 'in_b'])
		expect(hits[0].distance).toBeLessThan(hits[1].distance)
	})

	it('falls back to a Simple card when the pointer is inside it and no dot is drawn', () => {
		const simple = setBlockViewProps(portView(), 'simple')
		const shape = blockShape(simple)
		const editor = pureEditor([shape], { w: simple.w, h: simple.h })
		const hit = getBlockPortDotAtPoint(editor, { x: 40, y: simple.h / 2 })
		expect(hit?.port.subtle).toBe(true)
		expect(hit?.port.side).toBe('input')
		expect(getBlockPortDotAtPoint(editor, { x: -80, y: simple.h / 2 })).toBeNull()
	})
})
