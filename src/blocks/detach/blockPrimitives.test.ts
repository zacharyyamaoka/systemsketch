import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockPort, type BlockShapeProps } from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import { PORT_INDICATOR_RADIUS, primitivesForBlock } from './blockPrimitives'
import {
	SYSTEMSKETCH_ROUNDED_RECT_GEO,
	readSystemSketchPrimitiveStyle,
} from '../../stockPrimitiveVisuals'

const port = (id: string, name: string, type = ''): BlockPort =>
	({ id, name, type, visible: true })

function blockProps(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
	return { ...getDefaultBlockProps(), ...overrides }
}

const textOf = (shapes: ReturnType<typeof primitivesForBlock>['shapes']) =>
	shapes
		.filter((shape) => shape.type === 'text')
		.map((shape) => JSON.stringify((shape.props as { richText: unknown }).richText))

describe('a Block as stock primitives', () => {
	it('puts the card first, at the Block’s own page origin and exact size', () => {
		const props = blockProps({ view: 'port', title: 'decode', inputs: [port('in_1', 'frame')] })
		const { shapes, cardId } = primitivesForBlock(props, { x: 120, y: 80 })
		const layout = layoutBlock(props)

		expect(shapes[0].id).toBe(cardId)
		expect(shapes[0].type).toBe('geo')
		expect({ x: shapes[0].x, y: shapes[0].y }).toEqual({ x: 120, y: 80 })
		expect(shapes[0].props).toMatchObject({
			geo: SYSTEMSKETCH_ROUNDED_RECT_GEO,
			w: layout.width,
			h: layout.height,
		})
		expect(readSystemSketchPrimitiveStyle(shapes[0] as never)).toMatchObject({
			kind: 'geo', cornerRadius: 9, strokeWidth: 1,
		})
	})

	it('reads every position from layoutBlock, so the copy cannot drift', () => {
		const props = blockProps({ view: 'port', title: 'decode', outputs: [port('out_1', 'rgb')] })
		const layout = layoutBlock(props)
		const origin = { x: 40, y: 60 }
		const { shapes } = primitivesForBlock(props, origin)
		const dot = layout.ports[0]

		const circles = shapes.filter((shape) =>
			(shape.props as { geo?: string; w?: number }).geo === 'ellipse'
			&& (shape.props as { w?: number }).w === PORT_INDICATOR_RADIUS * 2)
		expect(circles.length).toBe(1)
		for (const circle of circles) {
			const w = (circle.props as { w: number }).w
			expect(circle.x! + w / 2).toBeCloseTo(origin.x + dot.x, 6)
			expect(circle.y! + w / 2).toBeCloseTo(origin.y + dot.y, 6)
		}
	})

	it('describes one nested group worth of shapes for every visible port row', () => {
		const props = blockProps({
			view: 'port',
			inputs: [{ ...port('in_1', 'window', 'int'), defaultValue: '5' }],
			outputs: [port('out_1', 'result', 'float')],
		})
		const built = primitivesForBlock(props, { x: 0, y: 0 })
		const byId = new Map(built.shapes.map((shape) => [shape.id, shape]))

		expect(built.portRows.map((row) => `${row.side}:${row.portId}`))
			.toEqual(['input:in_1', 'output:out_1'])
		for (const row of built.portRows) {
			expect(row.shapeIds.length).toBeGreaterThanOrEqual(3)
			expect(row.shapeIds.every((id) => byId.has(id))).toBe(true)
			expect(row.shapeIds.filter((id) => {
				const props = byId.get(id)!.props as { geo?: string; w?: number }
				return props.geo === 'ellipse' && props.w === PORT_INDICATOR_RADIUS * 2
			})).toHaveLength(1)
		}
		const inputShapes = built.portRows[0].shapeIds.map((id) => byId.get(id)!)
		expect(inputShapes.some((shape) =>
			(shape.props as { geo?: string }).geo === SYSTEMSKETCH_ROUNDED_RECT_GEO)).toBe(true)
		const inputText = inputShapes
			.filter((shape) => shape.type === 'text')
			.map((shape) => JSON.stringify((shape.props as { richText: unknown }).richText))
			.join(' ')
		expect(inputText).toContain('window')
		expect(inputText).toContain('int')
		expect(inputText).toContain('= 5')
	})

	it('emits no text shape for an empty field', () => {
		// An empty tldraw text shape is an invisible, unselectable box the user
		// then has to hunt for.
		const empty = primitivesForBlock(blockProps({ view: 'port', title: '', blockType: '' }), { x: 0, y: 0 })
		expect(textOf(empty.shapes)).toEqual([])

		const named = primitivesForBlock(blockProps({ view: 'port', title: 'decode' }), { x: 0, y: 0 })
		expect(textOf(named.shapes).join()).toContain('decode')
	})

	it('freezes what was on screen: a wired dot detaches filled, an unwired one hollow', () => {
		const props = blockProps({
			view: 'port',
			inputs: [port('in_1', 'frame')],
			outputs: [port('out_1', 'rgb')],
		})
		const circles = (connected: ReadonlySet<string>) =>
			primitivesForBlock(props, { x: 0, y: 0 }, connected).shapes
				.filter((shape) => (shape.props as { geo?: string }).geo === 'ellipse'
					&& (shape.props as { w: number }).w === PORT_INDICATOR_RADIUS * 2)
				.map((shape) => (shape.props as { fill: string }).fill)

		expect(circles(new Set())).toEqual(['semi', 'semi'])
		expect(circles(new Set(['in_1', 'out_1']))).toEqual(['fill', 'fill'])
	})

	it('draws an unwired input that carries a default as present, not as connected', () => {
		const props = blockProps({
			view: 'port',
			inputs: [{ ...port('in_1', 'window', 'int'), defaultValue: '5' }],
		})
		const built = primitivesForBlock(props, { x: 0, y: 0 })
		const circle = built.shapes
			.find((shape) => (shape.props as { geo?: string }).geo === 'ellipse'
				&& (shape.props as { w: number }).w === PORT_INDICATOR_RADIUS * 2)
		expect(circle!.props).toMatchObject({ fill: 'solid', color: 'grey' })
		expect(textOf(built.shapes).join()).toContain('= 5')
		expect(built.shapes.some((shape) => {
			const style = readSystemSketchPrimitiveStyle(shape as never)
			return style?.kind === 'geo' && style.cornerRadius === 999
		})).toBe(true)
	})

	it('draws no dots for the Simple face, whose anchors are invisible until hovered', () => {
		const props = blockProps({ view: 'simple', title: 'decode', inputs: [port('in_1', 'frame')] })
		const { shapes } = primitivesForBlock(props, { x: 0, y: 0 })
		expect(shapes.some((shape) => (shape.props as { geo?: string }).geo === 'ellipse')).toBe(false)
	})

	it('gives Port and Expanded their chrome, and Simple none', () => {
		const lines = (view: 'simple' | 'port' | 'expanded') =>
			primitivesForBlock(blockProps({ view, title: 'decode' }), { x: 0, y: 0 })
				.shapes.filter((shape) => shape.type === 'line').length
		expect(lines('simple')).toBe(0)
		expect(lines('port')).toBeGreaterThan(0)
		expect(lines('expanded')).toBeGreaterThan(0)
	})

	it('colours a port by the same family the live canvas paints', () => {
		const props = blockProps({ view: 'port', inputs: [port('in_1', 'frame', 'image')] })
		const ring = primitivesForBlock(props, { x: 0, y: 0 }).shapes
			.find((shape) => (shape.props as { geo?: string; w?: number }).geo === 'ellipse'
				&& (shape.props as { w?: number }).w === PORT_INDICATOR_RADIUS * 2)
		expect((ring!.props as { color: string }).color).toBe('violet')
		expect(readSystemSketchPrimitiveStyle(ring as never)).toMatchObject({
			kind: 'geo', strokeColor: '#c060e0', strokeWidth: 1,
		})
	})

	it('keeps a long header type on one line with the live font metrics', () => {
		const props = blockProps({ view: 'port', title: 'decode', blockType: 'Function' })
		const typeShape = primitivesForBlock(props, { x: 0, y: 0 }).shapes
			.find((shape) => shape.type === 'text'
				&& JSON.stringify((shape.props as { richText: unknown }).richText).includes('Function'))
		expect(typeShape).toBeDefined()
		expect((typeShape!.props as { w: number }).w).toBeGreaterThan(70)
		expect(readSystemSketchPrimitiveStyle(typeShape as never)).toMatchObject({
			kind: 'text', fontSize: 18, lineHeight: 24, fontWeight: 400,
		})
	})
})
