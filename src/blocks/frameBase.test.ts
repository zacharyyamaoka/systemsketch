import {
	BaseBoxShapeTool,
	BaseFrameLikeShapeUtil,
	createShapeId,
	type Editor,
	type TLDragShapesInInfo,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { BlockShapeUtil } from './BlockShapeUtil'
import { BlockTool } from './BlockTool'
import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'

function blockShape(
	id: string,
	view: BlockShape['props']['view'],
	parentId = 'page:page',
): BlockShape {
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
		props: setBlockViewProps(getDefaultBlockProps(), view),
	}
}

describe('frame-first Block foundation', () => {
	it('derives from tldraw public happy-path bases', () => {
		expect(BlockShapeUtil.prototype).toBeInstanceOf(BaseFrameLikeShapeUtil)
		expect(BlockTool.prototype).toBeInstanceOf(BaseBoxShapeTool)
	})

	it('does not pass an ancestor-proxied Block back to tldraw as its own child', () => {
		const frame = blockShape('frame', 'expanded')
		const child = blockShape('child', 'simple', frame.id)
		const reparentShapes = vi.fn(() => {
			throw new Error('Attempted to reparent a shape to itself!')
		})
		const editor = {
			getShapeAncestors: () => [frame],
			reparentShapes,
		} as unknown as Editor
		const util = new BlockShapeUtil(editor)

		expect(() => {
			util.onDragShapesIn(child, [frame], {} as TLDragShapesInInfo)
		}).not.toThrow()
		expect(reparentShapes).not.toHaveBeenCalled()
	})

	it('keeps children in an auto-fitting Expanded Block during a drag', () => {
		const frame = blockShape('auto-frame', 'expanded')
		const autoFrame = { ...frame, props: { ...frame.props, autoResize: true } }
		const util = new BlockShapeUtil({} as Editor)

		// `BaseFrameLikeShapeUtil` consults this gate before it calls
		// onDragShapesOut. Returning false is the supported tldraw way to avoid a
		// drag-out reparent, while ordinary Expanded Blocks retain stock behavior.
		expect(util.canRemoveChildrenOfType(autoFrame, 'block')).toBe(false)
		expect(util.canRemoveChildrenOfType(frame, 'block')).toBe(true)
	})
})
