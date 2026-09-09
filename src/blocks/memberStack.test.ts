import { createShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import {
	BLOCK_MEMBER_PRESET_PX,
	blockMemberSpacing,
	blockMemberSpacingPreset,
	getDefaultBlockProps,
	resizeBlockProps,
	setBlockViewProps,
	type BlockShape,
} from './blockModel'
import { BLOCK_HEADER_HEIGHT_PX, NODE_FOOTER_HEIGHT_PX } from './layoutBlock'
import { blockMemberDropTarget, stackMemberFillsWidth, stackMemberPlacements, type StackMember } from './memberLayout'
import { blockStackMembers, isStackMemberShape, layoutBlockStack } from './memberStack'
import { moveBlockMember, stepBlockMember } from './commands/memberCommands'

const PAGE_ID = 'page:page' as BlockShape['parentId']

function block(
	id: string,
	parentId: BlockShape['parentId'],
	x: number,
	y: number,
	w: number,
	h: number,
	index = 'a1',
	view: 'port' | 'expanded' | 'simple' = 'port',
): BlockShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		x,
		y,
		rotation: 0,
		index: index as BlockShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: resizeBlockProps(setBlockViewProps(getDefaultBlockProps(), view), w, h),
	}
}

/** The smallest editor a settle pass needs: shapes by id, children by index, and a write log. */
function fakeEditor(shapes: TLShape[]) {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const updateShapes = vi.fn((updates: Array<Partial<TLShape> & { id: TLShapeId }>) => {
		for (const update of updates) {
			const current = byId.get(update.id)!
			byId.set(update.id, {
				...current,
				...update,
				props: { ...current.props, ...(update.props ?? {}) },
			} as TLShape)
		}
	})
	const children = (parentId: string) => [...byId.values()]
		.filter((shape) => shape.parentId === parentId)
		.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
		.map((shape) => shape.id)
	const editor = {
		getShape: (id: TLShapeId) => byId.get(id),
		getSortedChildIdsForParent: children,
		updateShapes,
		markHistoryStoppingPoint: vi.fn(),
		run: (work: () => void) => work(),
	} as unknown as Editor
	return { editor, byId, children, updateShapes }
}

describe('stack member placements', () => {
	it('reads the preset numbers and lights the matching preset', () => {
		const props = getDefaultBlockProps()
		expect(blockMemberSpacing(props)).toEqual({ gap: BLOCK_MEMBER_PRESET_PX, gutter: BLOCK_MEMBER_PRESET_PX })
		expect(blockMemberSpacingPreset(props)).toBe('inset')
		expect(blockMemberSpacingPreset({ ...props, memberLayout: 'edge-to-edge' })).toBe('edge-to-edge')
		expect(blockMemberSpacing({ ...props, memberLayout: 'edge-to-edge', memberGap: 4 })).toEqual({ gap: 4, gutter: 0 })
		expect(blockMemberSpacingPreset({ ...props, memberGap: 4, memberGutter: 24 })).toBeNull()
		expect(blockMemberSpacing({ ...props, memberGap: -3.7 }).gap).toBe(0)
	})

	it('stacks in the given order from one gap below the header, filling the inner width', () => {
		const parent = resizeBlockProps(setBlockViewProps(getDefaultBlockProps(), 'expanded'), 380, 600)
		const members: StackMember[] = [
			{ id: createShapeId('a'), type: 'block', x: 0, y: 0, w: 300, h: 120, view: 'port' },
			{ id: createShapeId('b'), type: 'code', x: 0, y: 0, w: 340, h: 150 },
			{ id: createShapeId('c'), type: 'block', x: 0, y: 0, w: 260, h: 110, view: 'expanded' },
		]
		const { placements, bodyBottom } = stackMemberPlacements(parent, members, { gap: 12, gutter: 12 }, 'fill')
		expect(placements.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
			[12, BLOCK_HEADER_HEIGHT_PX + 12, 356, 120],
			[12, BLOCK_HEADER_HEIGHT_PX + 12 + 120 + 12, 340, 150], // a Code member keeps its own width in V1
			[12, BLOCK_HEADER_HEIGHT_PX + 12 + 120 + 12 + 150 + 12, 260, 110], // an Expanded member is always Own (rule 4)
		])
		expect(bodyBottom).toBe(BLOCK_HEADER_HEIGHT_PX + 12 + 120 + 12 + 150 + 12 + 110 + 12)
		const own = stackMemberPlacements(parent, members, { gap: 0, gutter: 0 }, 'own')
		expect(own.placements.map((p) => [p.x, p.y, p.w])).toEqual([
			[0, BLOCK_HEADER_HEIGHT_PX, 300],
			[0, BLOCK_HEADER_HEIGHT_PX + 120, 340],
			[0, BLOCK_HEADER_HEIGHT_PX + 270, 260],
		])
	})

	it('only a Port or Simple Block takes the parent width', () => {
		expect(stackMemberFillsWidth({ type: 'block', view: 'port' }, 'fill')).toBe(true)
		expect(stackMemberFillsWidth({ type: 'block', view: 'simple' }, 'fill')).toBe(true)
		expect(stackMemberFillsWidth({ type: 'block', view: 'expanded' }, 'fill')).toBe(false)
		expect(stackMemberFillsWidth({ type: 'code' }, 'fill')).toBe(false)
		expect(stackMemberFillsWidth({ type: 'block', view: 'port' }, 'own')).toBe(false)
	})

	it('names the slot from the landing height, halfway between neighbours', () => {
		const a = createShapeId('a')
		const b = createShapeId('b')
		const placements = [
			{ id: a, x: 0, y: 60, w: 100, h: 100 },
			{ id: b, x: 0, y: 172, w: 100, h: 100 },
		]
		expect(blockMemberDropTarget(placements, 40)).toEqual({ before: a })
		expect(blockMemberDropTarget(placements, 111)).toEqual({ before: b })
		expect(blockMemberDropTarget(placements, 300)).toEqual({ before: null })
		expect(blockMemberDropTarget(placements, 40, a)).toEqual({ before: b })
	})
})

describe('the live stack pass', () => {
	it('excludes annotations and cables from membership', () => {
		const parent = block('parent', PAGE_ID, 0, 0, 380, 600, 'a1', 'expanded')
		const member = block('m', parent.id, 0, 0, 200, 100, 'a2')
		const sticky = { ...block('s', parent.id, 0, 0, 100, 100, 'a3'), type: 'note' } as unknown as TLShape
		const cable = { ...block('c', parent.id, 0, 0, 100, 100, 'a0'), type: 'connection' } as unknown as TLShape
		const { editor } = fakeEditor([parent, member, sticky, cable])
		expect(isStackMemberShape(sticky)).toBe(false)
		expect(isStackMemberShape(cable)).toBe(false)
		expect(blockStackMembers(editor, parent.id).map((shape) => shape.id)).toEqual([member.id])
	})

	it('re-takes the order from where a member landed, then lays the stack out and hugs the parent', () => {
		const parent = block('parent', PAGE_ID, 0, 0, 380, 600, 'a1', 'expanded')
		parent.props = { ...parent.props, bodyLayout: 'stack', autoResize: true }
		// Authored order first, second — but `first` was just dragged below `second`.
		const first = block('first', parent.id, 12, 400, 300, 120, 'a1')
		const second = block('second', parent.id, 12, 60, 340, 150, 'a2')
		const { editor, byId, children } = fakeEditor([parent, first, second])

		expect(layoutBlockStack(editor, parent.id)).toBe(true)

		expect(children(parent.id)).toEqual([second.id, first.id])
		const laidSecond = byId.get(second.id) as BlockShape
		const laidFirst = byId.get(first.id) as BlockShape
		expect([laidSecond.x, laidSecond.y, laidSecond.props.w]).toEqual([12, BLOCK_HEADER_HEIGHT_PX + 12, 356])
		expect([laidFirst.x, laidFirst.y, laidFirst.props.w]).toEqual([12, BLOCK_HEADER_HEIGHT_PX + 12 + 150 + 12, 356])
		// Both members filled, so nothing feeds the width; only the height hugs.
		const hugged = byId.get(parent.id) as BlockShape
		expect(hugged.props.w).toBe(380)
		expect(hugged.props.h).toBe(BLOCK_HEADER_HEIGHT_PX + 12 + 150 + 12 + 120 + 12 + NODE_FOOTER_HEIGHT_PX)
		// A Port member's remembered box moved with it; nothing shared changed.
		expect(laidFirst.props.views.port.w).toBe(356)
		expect(laidFirst.props.views.expanded).toEqual(first.props.views.expanded)
	})

	it('never writes a member Expanded box, and an Own stack hugs the widest member', () => {
		const parent = block('parent', PAGE_ID, 0, 0, 380, 600, 'a1', 'expanded')
		parent.props = { ...parent.props, bodyLayout: 'stack', autoResize: true, memberWidth: 'own', memberGutter: 16, memberGap: 8 }
		const nested = block('nested', parent.id, 0, 60, 520, 340, 'a1', 'expanded')
		const leaf = block('leaf', parent.id, 0, 500, 200, 100, 'a2')
		const { editor, byId } = fakeEditor([parent, nested, leaf])
		layoutBlockStack(editor, parent.id)
		const laidNested = byId.get(nested.id) as BlockShape
		expect(laidNested.props.w).toBe(520)
		expect(laidNested.props.views.expanded).toEqual({ w: 520, h: 340 })
		expect((byId.get(parent.id) as BlockShape).props.w).toBe(520 + 32)
		expect(layoutBlockStack(editor, parent.id)).toBe(false) // settled: a second pass writes nothing
	})

	it('does nothing for a free Block', () => {
		const parent = block('parent', PAGE_ID, 0, 0, 380, 600, 'a1', 'expanded')
		const member = block('m', parent.id, 90, 300, 200, 100, 'a2')
		const { editor, updateShapes } = fakeEditor([parent, member])
		expect(layoutBlockStack(editor, parent.id)).toBe(false)
		expect(updateShapes).not.toHaveBeenCalled()
	})
})

describe('member order commands', () => {
	function stack() {
		const parent = block('parent', PAGE_ID, 0, 0, 380, 600, 'a1', 'expanded')
		parent.props = { ...parent.props, bodyLayout: 'stack' }
		const a = block('a', parent.id, 12, 60, 300, 100, 'a1')
		const b = block('b', parent.id, 12, 172, 300, 100, 'a2')
		const c = block('c', parent.id, 12, 284, 300, 100, 'a3')
		const fake = fakeEditor([parent, a, b, c])
		return { ...fake, parent, a, b, c }
	}

	it('moves a member before a neighbour by permuting the existing indexes', () => {
		const { editor, byId, children, parent, a, b, c } = stack()
		expect(moveBlockMember(editor, parent.id, c.id, a.id)).toBe(true)
		expect(children(parent.id)).toEqual([c.id, a.id, b.id])
		expect([c, a, b].map((m) => byId.get(m.id)!.index)).toEqual(['a1', 'a2', 'a3'])
		expect((byId.get(c.id) as BlockShape).y).toBe(BLOCK_HEADER_HEIGHT_PX + 12)
	})

	it('moves to the end with a null neighbour, and steps one slot with the arrows', () => {
		const { editor, byId, children, parent, a, b, c } = stack()
		expect(moveBlockMember(editor, parent.id, a.id, null)).toBe(true)
		expect(children(parent.id)).toEqual([b.id, c.id, a.id])
		expect(stepBlockMember(editor, parent.id, a.id, -1)).toBe(true)
		expect(children(parent.id)).toEqual([b.id, a.id, c.id])
		expect(stepBlockMember(editor, parent.id, b.id, -1)).toBe(false)
		expect(moveBlockMember(editor, parent.id, b.id, a.id)).toBe(false) // already there
	})
})
