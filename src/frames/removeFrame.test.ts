import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLPageId, TLShape, TLShapeId } from 'tldraw'

import { getOnlySelectedFrame, removeFrameKeepContents } from './removeFrame'

const PAGE_ID = 'page:page' as TLPageId
const FRAME_ID = 'shape:frame' as TLShapeId
const CHILD_ID = 'shape:child' as TLShapeId
const NESTED_FRAME_ID = 'shape:nested-frame' as TLShapeId

function shape(
	id: TLShapeId,
	type: string,
	parentId: TLShape['parentId'] = PAGE_ID,
	isLocked = false,
): TLShape {
	return { id, type, parentId, isLocked } as unknown as TLShape
}

function fakeEditor(options: {
	frame?: TLShape
	children?: TLShapeId[]
	selected?: TLShape[]
} = {}) {
	const frame = options.frame ?? shape(FRAME_ID, 'frame')
	const events: string[] = []
	const editor = {
		getShape: vi.fn((id: TLShapeId) => id === FRAME_ID ? frame : undefined),
		getSelectedShapes: vi.fn(() => options.selected ?? [frame]),
		getSortedChildIdsForParent: vi.fn(() => options.children ?? [CHILD_ID, NESTED_FRAME_ID]),
		markHistoryStoppingPoint: vi.fn((label: string) => events.push(`mark:${label}`)),
		run: vi.fn((action: () => void) => action()),
		reparentShapes: vi.fn((ids: TLShapeId[], parentId: TLShape['parentId']) => {
			events.push(`reparent:${ids.join(',')}:${parentId}`)
		}),
		deleteShape: vi.fn((id: TLShapeId) => events.push(`delete:${id}`)),
		setSelectedShapes: vi.fn((ids: TLShapeId[]) => events.push(`select:${ids.join(',')}`)),
	} as unknown as Editor
	return { editor, events }
}

describe('remove Frame while keeping its contents', () => {
	it('lifts direct children before deleting the now-empty Frame', () => {
		const { editor, events } = fakeEditor()

		expect(removeFrameKeepContents(editor, FRAME_ID)).toBe(true)
		expect(events).toEqual([
			'mark:remove frame',
			`reparent:${CHILD_ID},${NESTED_FRAME_ID}:${PAGE_ID}`,
			`delete:${FRAME_ID}`,
			`select:${CHILD_ID},${NESTED_FRAME_ID}`,
		])
	})

	it('deletes an empty Frame without attempting a reparent or empty selection', () => {
		const { editor } = fakeEditor({ children: [] })

		expect(removeFrameKeepContents(editor, FRAME_ID)).toBe(true)
		expect(editor.reparentShapes).not.toHaveBeenCalled()
		expect(editor.setSelectedShapes).not.toHaveBeenCalled()
		expect(editor.deleteShape).toHaveBeenCalledWith(FRAME_ID)
	})

	it('refuses non-Frame and locked Frame targets', () => {
		for (const target of [
			shape(FRAME_ID, 'geo'),
			shape(FRAME_ID, 'frame', PAGE_ID, true),
		]) {
			const { editor } = fakeEditor({ frame: target })
			expect(removeFrameKeepContents(editor, FRAME_ID)).toBe(false)
			expect(editor.markHistoryStoppingPoint).not.toHaveBeenCalled()
			expect(editor.deleteShape).not.toHaveBeenCalled()
		}
	})

	it('offers the command only for one unlocked selected Frame', () => {
		const frame = shape(FRAME_ID, 'frame')
		const { editor } = fakeEditor({ frame, selected: [frame] })
		expect(getOnlySelectedFrame(editor)?.id).toBe(FRAME_ID)

		const locked = shape(FRAME_ID, 'frame', PAGE_ID, true)
		const { editor: lockedEditor } = fakeEditor({ frame: locked, selected: [locked] })
		expect(getOnlySelectedFrame(lockedEditor)).toBeNull()

		const { editor: severalEditor } = fakeEditor({ selected: [frame, shape(CHILD_ID, 'geo')] })
		expect(getOnlySelectedFrame(severalEditor)).toBeNull()
	})
})
