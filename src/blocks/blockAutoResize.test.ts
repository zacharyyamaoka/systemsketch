import { createShapeId, Mat, Rectangle2d, type Editor, type TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'
import {
	blockAutoResizePresentation,
	isBlockAutoResizeGestureActive,
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
	it('projects the same padded child box continuously without changing records', () => {
		const container = autoBlock()
		const member = child('member', container.id)
		const editor = {
			inputs: { getIsPointing: () => true },
			isIn: () => true,
			getSortedChildIdsForParent: () => [member.id],
			getShape: (id: TLShape['id']) => id === member.id ? member : container,
			getShapeLocalTransform: (shape: TLShape) => Mat.Translate(shape.x, shape.y),
			getShapeGeometry: () => new Rectangle2d({ width: 100, height: 50, isFilled: true }),
		} as unknown as Editor

		expect(blockAutoResizePresentation(editor, container)).toEqual({
			x: 34,
			y: 64,
			w: 212,
			h: 162,
		})
		expect(member).toMatchObject({ x: 90, y: 120, parentId: container.id })
	})

	it('keeps the projection off outside an active stock geometry gesture', () => {
		const container = autoBlock()
		const editor = {
			inputs: { getIsPointing: () => false },
			isIn: () => false,
		} as unknown as Editor
		expect(blockAutoResizePresentation(editor, container)).toBeNull()
	})

	it.each([
		'select.pointing_shape',
		'select.pointing_selection',
		'select.pointing_resize_handle',
		'select.pointing_rotate_handle',
		'select.pointing_handle',
		'select.translating',
		'select.resizing',
		'select.rotating',
		'select.dragging_handle',
	])('defers stock fit-to-content while tldraw owns %s', (activePath) => {
		const editor = {
			inputs: { getIsPointing: () => false },
			isIn: (path: string) => path === activePath,
		} as unknown as Pick<Editor, 'inputs' | 'isIn'>
		expect(isBlockAutoResizeGestureActive(editor)).toBe(true)
	})

	it('defers the first transform operation while the pointer is held before the path changes', () => {
		const editor = {
			inputs: { getIsPointing: () => true },
			isIn: () => false,
		} as unknown as Pick<Editor, 'inputs' | 'isIn'>
		expect(isBlockAutoResizeGestureActive(editor)).toBe(true)
	})

	it('allows stock fit-to-content once tldraw returns to idle', () => {
		const editor = {
			inputs: { getIsPointing: () => false },
			isIn: () => false,
		} as unknown as Pick<Editor, 'inputs' | 'isIn'>
		expect(isBlockAutoResizeGestureActive(editor)).toBe(false)
	})

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
