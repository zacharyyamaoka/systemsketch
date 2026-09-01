import { createShapeId, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	getDefaultBlockProps,
	innerPortId,
	isInnerPortId,
	outerPortId,
	setBlockViewProps,
	type BlockShape,
} from '../blockModel'
import {
	blockPortFaceIds,
	getBlockConnectionPort,
	getBlockConnectionPortAtPoint,
	getBlockConnectionPorts,
	getBlockInnerFace,
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

function blockShape(props = portView()): BlockShape {
	return {
		id: createShapeId('ports'),
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

	it('maps outputs to start terminals and inputs to end terminals', () => {
		const ports = getBlockConnectionPorts(portView())
		expect(ports.map(({ id, side, terminal }) => ({ id, side, terminal }))).toEqual([
			{ id: 'in_a', side: 'input', terminal: 'end' },
			{ id: 'in_b', side: 'input', terminal: 'end' },
			{ id: 'out_a', side: 'output', terminal: 'start' },
		])
	})

	it('follows stable identity when ports reorder', () => {
		const before = portView()
		const anchorBefore = getBlockConnectionPort(before, 'in_a', 'end')!.anchor
		const after = { ...before, inputs: [...before.inputs].reverse() }
		const anchorAfter = getBlockConnectionPort(after, 'in_a', 'end')!.anchor
		expect(anchorAfter.y).not.toBe(anchorBefore.y)
		expect(getBlockConnectionPort(after, 'in_a', 'start')).toBeNull()
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

	it('hit-tests only the requested opposite-side terminal', () => {
		const shape = blockShape()
		const editor = {
			getZoomLevel: () => 1,
			getCurrentPageShapesSorted: () => [shape],
			isShapeHidden: () => false,
			getShapePageBounds: () => ({ minX: 0, minY: 0, maxX: 360, maxY: 230 }),
			getShapePageTransform: () => ({
				applyToPoint: (point: { x: number; y: number }) => ({ ...point }),
			}),
		} as unknown as Editor
		const output = getBlockConnectionPort(shape.props, 'out_a')!
		expect(getBlockConnectionPortAtPoint(editor, output, { terminal: 'start' })?.port.id)
			.toBe('out_a')
		expect(getBlockConnectionPortAtPoint(editor, output, { terminal: 'end' })).toBeNull()
	})
})

describe('boundary inner faces', () => {
	const visible = (props: ReturnType<typeof portView>) =>
		getBlockConnectionPorts(props).map((port) => port.id)

	it('keeps the inner twin out of every view except expanded', () => {
		expect(visible(portView())).toEqual(['in_a', 'in_b', 'out_a'])
		expect(visible(setBlockViewProps(portView(), 'simple'))).toEqual(['in_a', 'in_b', 'out_a'])

		const expanded = setBlockViewProps(portView(), 'expanded')
		expect(visible(expanded)).toEqual([
			'in_a', 'in_a__inner',
			'in_b', 'in_b__inner',
			'out_a', 'out_a__inner',
		])
	})

	it('flips the terminal and shares the anchor', () => {
		const expanded = setBlockViewProps(portView(), 'expanded')
		const outer = getBlockConnectionPort(expanded, 'in_a')!
		const inner = getBlockConnectionPort(expanded, innerPortId('in_a'))!

		expect(outer.terminal).toBe('end')
		expect(inner.terminal).toBe('start')
		expect({ x: inner.x, y: inner.y }).toEqual({ x: outer.x, y: outer.y })
		expect(inner.inner).toBe(true)
		expect(outer.inner).toBe(false)
	})

	it('keeps a twin resolvable in every view so its cable never dangles', () => {
		// The whole point of hiding rather than dropping the twin: a cable welded
		// to an inner face has to survive Expanded -> Port without its binding
		// becoming invalid, which would delete the cable.
		for (const view of ['simple', 'port', 'expanded'] as const) {
			const props = setBlockViewProps(portView(), view)
			expect(getBlockConnectionPort(props, innerPortId('in_a'))).not.toBeNull()
		}
	})

	it('hides the twin of a hidden port even inside expanded', () => {
		const props = setBlockViewProps(portView(), 'expanded')
		props.inputs = [{ ...props.inputs[0], visible: false }, props.inputs[1]]
		expect(visible(props)).not.toContain('in_a')
		expect(visible(props)).not.toContain('in_a__inner')
	})

	it('resolves the two faces of one dot', () => {
		expect(isInnerPortId('in_a')).toBe(false)
		expect(isInnerPortId('in_a__inner')).toBe(true)
		expect(outerPortId('in_a__inner')).toBe('in_a')
		expect(outerPortId('in_a')).toBe('in_a')
		expect(blockPortFaceIds('in_a')).toEqual(['in_a', 'in_a__inner'])
		expect(blockPortFaceIds('in_a__inner')).toEqual(['in_a__inner', 'in_a'])

		const expanded = setBlockViewProps(portView(), 'expanded')
		const ports = getBlockConnectionPorts(expanded, { includeHidden: true })
		expect(getBlockInnerFace(ports, 'in_a')?.id).toBe('in_a__inner')
		// Outside expanded the twin exists but is not a live face.
		const port = getBlockConnectionPorts(portView(), { includeHidden: true })
		expect(getBlockInnerFace(port, 'in_a')).toBeNull()
	})

	it('lets a drag out of the boundary find an inner face the outer port refuses', () => {
		// The reported bug, at the model layer: dragging from run.in_1 makes the
		// free handle a 'start', and only an inner face can answer that on a port
		// whose outer terminal is 'end'.
		const expanded = setBlockViewProps(portView(), 'expanded')
		const shape = blockShape(expanded)
		const editor = {
			getZoomLevel: () => 1,
			getCurrentPageShapesSorted: () => [shape],
			isShapeHidden: () => false,
			store: undefined,
			getShapePageBounds: () => ({ minX: 0, minY: 0, maxX: 560, maxY: 380 }),
			getShapePageTransform: () => ({
				applyToPoint: (point: { x: number; y: number }) => ({ ...point }),
			}),
		} as unknown as Editor

		const boundaryInput = getBlockConnectionPort(expanded, 'in_a')!
		expect(getBlockConnectionPortAtPoint(editor, boundaryInput, { terminal: 'start' })?.port.id)
			.toBe('in_a__inner')
		expect(getBlockConnectionPortAtPoint(editor, boundaryInput, { terminal: 'end' })?.port.id)
			.toBe('in_a')
	})
})
