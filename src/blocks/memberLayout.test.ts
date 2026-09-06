import { createShapeId, type TLShapeId } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { getDefaultBlockProps, resizeBlockProps, setBlockViewProps, type BlockShape } from './blockModel'
import {
	BLOCK_MEMBER_GAP_PX,
	BLOCK_MEMBER_INSET_PX,
	blockMemberPlacements,
	setBlockMemberLayout,
} from './memberLayout'

const PAGE_ID = 'page:page' as BlockShape['parentId']

function block(id: string, parentId: BlockShape['parentId'], x: number, y: number, w: number, h: number): BlockShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		x,
		y,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: resizeBlockProps(getDefaultBlockProps(), w, h),
	}
}

describe('Block member layout', () => {
	it('lays out the same direct children as separated cards or one continuous stack', () => {
		const parent = resizeBlockProps(setBlockViewProps(getDefaultBlockProps(), 'expanded'), 600, 760)
		const later = block('later', PAGE_ID, 90, 390, 220, 180)
		const earlier = block('earlier', PAGE_ID, 40, 100, 280, 150)
		const inset = blockMemberPlacements(parent, [later, earlier], 'inset')
		const edge = blockMemberPlacements(parent, [later, earlier], 'edge-to-edge')

		expect(inset).toEqual([
			{ id: earlier.id, x: BLOCK_MEMBER_INSET_PX, y: 48 + BLOCK_MEMBER_INSET_PX, w: 600 - BLOCK_MEMBER_INSET_PX * 2, h: 150 },
			{ id: later.id, x: BLOCK_MEMBER_INSET_PX, y: 48 + BLOCK_MEMBER_INSET_PX + 150 + BLOCK_MEMBER_GAP_PX, w: 600 - BLOCK_MEMBER_INSET_PX * 2, h: 180 },
		])
		expect(edge).toEqual([
			{ id: earlier.id, x: 0, y: 48, w: 600, h: 150 },
			{ id: later.id, x: 0, y: 198, w: 600, h: 180 },
		])
	})

	it('updates only immediate Block children in one undoable command', () => {
		const parent = block('parent', PAGE_ID, 200, 120, 560, 700)
		parent.props = setBlockViewProps(parent.props, 'expanded')
		parent.props = resizeBlockProps(parent.props, 560, 700)
		const child = block('child', parent.id, 24, 100, 300, 160)
		const grandchild = block('grandchild', child.id, 8, 60, 120, 80)
		const outsider = block('outsider', PAGE_ID, 20, 20, 120, 80)
		const markHistoryStoppingPoint = vi.fn()
		const updateShapes = vi.fn()
		const editor = {
			getShape: (id: TLShapeId) => [parent, child, grandchild, outsider].find((shape) => shape.id === id),
			getCurrentPageShapes: () => [parent, child, grandchild, outsider],
			markHistoryStoppingPoint,
			updateShapes,
		} as never

		expect(setBlockMemberLayout(editor, parent.id, 'edge-to-edge')).toBe(true)
		expect(markHistoryStoppingPoint).toHaveBeenCalledWith('set member layout edge-to-edge')
		const updates = updateShapes.mock.calls[0]![0] as Array<Record<string, unknown>>
		expect(updates.map((update) => update.id)).toEqual([parent.id, child.id])
		expect(updates[0]).toMatchObject({ props: { memberLayout: 'edge-to-edge' } })
		expect(updates[1]).toMatchObject({ x: 0, y: 48, props: { w: 560, h: 160 } })
	})
})
