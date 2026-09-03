import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockShape } from '../blockModel'
import type { ConnectionBinding } from '../connections/ConnectionBindingUtil'
import type { ConnectionShape } from '../connections/ConnectionShapeUtil'
import { describeOrganizeNodesOutcome, organizeNodes } from './organizeNodes'

function block(
	id: string,
	parentId: string,
	x: number,
	y: number,
	overrides: Partial<BlockShape['props']> = {},
): BlockShape {
	return {
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'block',
		x,
		y,
		rotation: 0,
		index: 'a1',
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: { ...getDefaultBlockProps(), w: 220, h: 140, ...overrides },
	} as BlockShape
}

function connection(id: string, parentId: string): ConnectionShape {
	return {
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'connection',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
			curve: null, pins: [], elbowRoute: null, temporal: 'data', delayValue: '', pillPosition: 0.5,
		},
	} as unknown as ConnectionShape
}

function binding(
	fromId: ConnectionShape['id'],
	toId: BlockShape['id'],
	terminal: 'start' | 'end',
	portId: string,
	face: 'inner' | 'outer' = 'outer',
): ConnectionBinding {
	return {
		id: `binding:${fromId}:${terminal}`,
		typeName: 'binding', type: 'connection', fromId, toId, meta: {},
		props: { terminal, portId, face },
	} as ConnectionBinding
}

function editorFor(
	parent: BlockShape,
	shapes: (BlockShape | ConnectionShape)[],
	bindings: Map<string, ConnectionBinding[]>,
) {
	const edits: { id: string; x: number; y: number }[][] = []
	const parentOffset = { x: parent.x, y: parent.y }
	const editor = {
		getSelectedShapeIds: () => [parent.id],
		getSelectedShapes: () => [parent],
		getCurrentPageShapes: () => shapes,
		getShape: (id: string) => shapes.find((shape) => shape.id === id),
		getBindingsFromShape: (shape: string | ConnectionShape) => (
			bindings.get(typeof shape === 'string' ? shape : shape.id) ?? []
		),
		getShapePageTransform: () => ({
			applyToPoint: (point: { x: number; y: number }) => ({
				x: point.x + parentOffset.x,
				y: point.y + parentOffset.y,
			}),
		}),
		getShapePageBounds: (id: string) => {
			const shape = shapes.find((candidate) => candidate.id === id)
			if (!shape || shape.type !== 'block') return undefined
			const pageX = shape.id === parent.id ? shape.x : parentOffset.x + shape.x
			const pageY = shape.id === parent.id ? shape.y : parentOffset.y + shape.y
			return {
				minX: pageX, minY: pageY, maxX: pageX + shape.props.w, maxY: pageY + shape.props.h,
				width: shape.props.w, height: shape.props.h,
			}
		},
		markHistoryStoppingPoint: () => undefined,
		updateShapes: (updates: { id: string; x: number; y: number }[]) => edits.push(updates),
	} as never
	return { editor, edits }
}

describe('organizing inside one selected Expanded Block', () => {
	it('uses parent boundary rails, moves immediate children, and treats a nested Block atomically', async () => {
		const parent = block('parent', 'page:page', 100, 80, {
			view: 'expanded', w: 1200, h: 700,
			inputs: [{ id: 'parent-in', name: 'input', type: 'data', visible: true }],
			outputs: [{ id: 'parent-out', name: 'output', type: 'data', visible: true }],
		})
		const first = block('first', parent.id, 350, 160)
		const nested = block('nested', parent.id, 360, 180, { view: 'expanded', w: 260, h: 180 })
		const grandchild = block('grandchild', nested.id, 20, 70)
		const input = connection('input-edge', parent.id)
		const middle = connection('middle-edge', parent.id)
		const output = connection('output-edge', parent.id)
		const bindings = new Map<string, ConnectionBinding[]>([
			[input.id, [
				binding(input.id, parent.id, 'start', 'parent-in', 'inner'),
				binding(input.id, first.id, 'end', 'in0'),
			]],
			[middle.id, [
				binding(middle.id, first.id, 'start', 'out0'),
				binding(middle.id, nested.id, 'end', 'in0'),
			]],
			[output.id, [
				binding(output.id, nested.id, 'start', 'out0'),
				binding(output.id, parent.id, 'end', 'parent-out', 'inner'),
			]],
		])
		const { editor, edits } = editorFor(
			parent,
			[parent, first, nested, grandchild, input, middle, output],
			bindings,
		)

		const outcome = await organizeNodes(editor)
		expect(outcome).toMatchObject({ scope: 'expanded-block', edges: 3 })
		expect(outcome.reason).toBeUndefined()
		expect(edits).toHaveLength(1)
		expect(new Set(edits[0].map((edit) => edit.id))).toEqual(new Set([first.id, nested.id]))
		expect(edits[0].some((edit) => edit.id === parent.id || edit.id === grandchild.id)).toBe(false)
		expect(describeOrganizeNodesOutcome(outcome)).toContain('inside the Block')
	})

	it('does not resize or move anything when the organized contents cannot fit', async () => {
		const parent = block('parent', 'page:page', 100, 80, {
			view: 'expanded', w: 300, h: 220,
		})
		const first = block('first', parent.id, 10, 60)
		const second = block('second', parent.id, 40, 70)
		const edge = connection('edge', parent.id)
		const bindings = new Map<string, ConnectionBinding[]>([[edge.id, [
			binding(edge.id, first.id, 'start', 'out0'),
			binding(edge.id, second.id, 'end', 'in0'),
		]]])
		const { editor, edits } = editorFor(parent, [parent, first, second, edge], bindings)

		const outcome = await organizeNodes(editor)
		expect(outcome.reason).toBe('insufficient-space')
		expect(outcome.moved).toBe(0)
		expect(edits).toEqual([])
		expect(describeOrganizeNodesOutcome(outcome)).toBe('Not enough room inside this Block')
	})
})
