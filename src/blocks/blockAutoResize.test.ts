import { createShapeId, type Editor, type TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'
import {
	removeSelectedFromAutoResizeContainer,
	selectedAutoResizeMembership,
} from './blockAutoResize'

function autoBlock(): BlockShape {
	return {
		id: createShapeId('auto'),
		typeName: 'shape', type: 'block', x: 20, y: 30, rotation: 0, index: 'a1',
		parentId: 'page:page', isLocked: false, opacity: 1, meta: {},
		props: { ...setBlockViewProps(getDefaultBlockProps(), 'expanded'), autoResize: true },
	} as BlockShape
}

function child(id: string, parentId: TLShape['parentId'], type = 'geo'): TLShape {
	return {
		id: createShapeId(id), typeName: 'shape', type, x: 90, y: 120, rotation: 0, index: 'a2',
		parentId, isLocked: false, opacity: 1, meta: {}, props: {},
	} as TLShape
}

function harness(selected: TLShape, shapes: TLShape[]) {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const editor = {
		getSelectedShapes: () => [selected],
		getShape: (id: TLShape['id']) => byId.get(id),
		markHistoryStoppingPoint: vi.fn(),
		reparentShapes: vi.fn(),
		setSelectedShapes: vi.fn(),
	} as unknown as Editor
	return editor
}

describe('auto-resize membership escape hatch', () => {
	it('finds a direct selected child of an auto-sized Expanded Block', () => {
		const container = autoBlock()
		const member = child('member', container.id)
		const membership = selectedAutoResizeMembership(harness(member, [container, member]))
		expect(membership?.container.id).toBe(container.id)
		expect(membership?.member.id).toBe(member.id)
	})

	it('lifts a nested selection to its direct grouped member', () => {
		const container = autoBlock()
		const group = child('group', container.id, 'group')
		const nested = child('nested', group.id)
		const membership = selectedAutoResizeMembership(harness(nested, [container, group, nested]))
		expect(membership?.member.id).toBe(group.id)
	})

	it('reparents through stock tldraw and retains the selected member', () => {
		const container = autoBlock()
		const member = child('member', container.id)
		const editor = harness(member, [container, member])

		expect(removeSelectedFromAutoResizeContainer(editor)).toBe(true)
		expect(editor.markHistoryStoppingPoint).toHaveBeenCalledWith('remove from container')
		expect(editor.reparentShapes).toHaveBeenCalledWith([member.id], 'page:page')
		expect(editor.setSelectedShapes).toHaveBeenCalledWith([member.id])
	})
})
