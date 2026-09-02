import { createShapeId, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShape,
} from '../blockModel'
import {
	getConnectionBindingPositionInPageSpace,
	type ConnectionBinding,
} from './ConnectionBindingUtil'

function blockShape(): BlockShape {
	const props = {
		...setBlockViewProps(getDefaultBlockProps(), 'port'),
		inputs: [
			{ id: 'in_a', name: 'first', type: '', visible: true },
			{ id: 'in_b', name: 'second', type: '', visible: true },
		],
		outputs: [],
	}
	return {
		id: createShapeId('bound-block'),
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

function binding(blockId: BlockShape['id']): ConnectionBinding {
	return {
		id: 'binding:connection-test' as ConnectionBinding['id'],
		typeName: 'binding',
		type: 'connection',
		fromId: createShapeId('connection'),
		toId: blockId,
		meta: {},
		props: { portId: 'in_a', terminal: 'end', face: 'outer' },
	}
}

describe('connection binding geometry', () => {
	it('re-derives a stable port id after move, resize, and reorder', () => {
		let block = blockShape()
		let offset = { x: 100, y: 50 }
		const editor = {
			getShape: (id: string) => id === block.id ? block : undefined,
			getShapePageTransform: () => ({
				applyToPoint: (point: { x: number; y: number }) => ({
					x: point.x + offset.x,
					y: point.y + offset.y,
				}),
			}),
		} as unknown as Editor
		const semanticBinding = binding(block.id)

		const initial = getConnectionBindingPositionInPageSpace(editor, semanticBinding)!
		offset = { x: 240, y: 80 }
		const moved = getConnectionBindingPositionInPageSpace(editor, semanticBinding)!
		expect(moved.x - initial.x).toBe(140)
		expect(moved.y - initial.y).toBe(30)

		block = {
			...block,
			props: {
				...block.props,
				w: 520,
				h: 320,
				inputs: [...block.props.inputs].reverse(),
			},
		}
		const relaid = getConnectionBindingPositionInPageSpace(editor, semanticBinding)!
		expect(relaid.x).toBe(240)
		expect(relaid.y).not.toBe(moved.y)
		expect(semanticBinding.props.portId).toBe('in_a')
	})

	it('keeps a hidden named port bound at a fallback anchor', () => {
		let block = blockShape()
		const editor = {
			getShape: () => block,
			getShapePageTransform: () => ({ applyToPoint: (point: unknown) => point }),
		} as unknown as Editor
		const semanticBinding = binding(block.id)
		expect(getConnectionBindingPositionInPageSpace(editor, semanticBinding)).not.toBeNull()

		block = {
			...block,
			props: {
				...block.props,
				inputs: block.props.inputs.map((port) => (
					port.id === 'in_a' ? { ...port, visible: false } : port
				)),
			},
		}
		const hidden = getConnectionBindingPositionInPageSpace(editor, semanticBinding)
		const visibleFallback = getConnectionBindingPositionInPageSpace(editor, {
				...semanticBinding,
				props: { portId: 'in_b', terminal: 'end', face: 'outer' },
			})
		expect(hidden && { x: hidden.x, y: hidden.y }).toEqual(
			visibleFallback && { x: visibleFallback.x, y: visibleFallback.y },
		)
	})
})
