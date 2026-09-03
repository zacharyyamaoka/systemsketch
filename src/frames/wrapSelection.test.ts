import { describe, expect, it, vi } from 'vitest'
import type { Editor, TLPageId, TLShape, TLShapeId } from 'tldraw'

import { getDefaultBlockProps } from '../blocks/blockModel'
import { getDefaultBranchProps } from '../branch/branchModel'
import {
	canWrapSelection,
	WRAP_TARGET_DESCRIPTORS,
	WRAP_TARGETS,
	wrapSelectionInto,
	wrappableSelection,
} from './wrapSelection'

const PAGE_ID = 'page:page' as TLPageId
const A = 'shape:a' as TLShapeId
const B = 'shape:b' as TLShapeId
const CABLE = 'shape:cable' as TLShapeId

function shape(
	id: TLShapeId,
	type = 'geo',
	parentId: TLShape['parentId'] = PAGE_ID,
	isLocked = false,
): TLShape {
	return { id, type, parentId, isLocked } as unknown as TLShape
}

function fakeEditor(selected: TLShape[], bounds = { minX: 100, minY: 100, width: 200, height: 80 }) {
	const events: string[] = []
	const created = new Map<TLShapeId, { type: string; props: Record<string, unknown> }>()
	const children = new Map<TLShapeId, TLShapeId[]>()
	const editor = {
		getInstanceState: vi.fn(() => ({ isReadonly: false })),
		getSelectedShapes: vi.fn(() => selected),
		getSelectionPageBounds: vi.fn(() => bounds),
		getCurrentPageId: vi.fn(() => PAGE_ID),
		markHistoryStoppingPoint: vi.fn((label: string) => events.push(`mark:${label}`)),
		run: vi.fn((action: () => void) => action()),
		createShape: vi.fn((partial: Record<string, any>) => {
			// A real editor fills the shape util's defaults before the props it was
			// handed; the branch stamp reads `controls` and `arms`, so a fake that
			// skipped them would pass while the product threw.
			const defaults = partial.type === 'block' ? getDefaultBlockProps() : getDefaultBranchProps()
			created.set(partial.id, { type: partial.type, props: { ...defaults, ...partial.props } })
			events.push(`create:${partial.type}:${partial.x},${partial.y}:${partial.props.w}x${partial.props.h}:${partial.parentId}`)
		}),
		getShape: vi.fn((id: TLShapeId) => {
			const record = created.get(id)
			// Enough shape for the Block/Branch type guards and prop reads.
			return record ? ({ id, type: record.type, props: record.props } as unknown as TLShape) : undefined
		}),
		updateShape: vi.fn((partial: Record<string, any>) => {
			const record = created.get(partial.id)
			if (record) Object.assign(record.props, partial.props)
			events.push(`update:${partial.id}`)
		}),
		reparentShapes: vi.fn((ids: TLShapeId[], parentId: TLShapeId) => {
			children.set(parentId, [...(children.get(parentId) ?? []), ...ids])
			events.push(`reparent:${ids.join(',')}->${parentId}`)
		}),
		// The Branch stamp walks its own children after the reparent, so the
		// fake has to actually record where shapes landed.
		getSortedChildIdsForParent: vi.fn((id: TLShapeId) => children.get(id) ?? []),
		updateShapes: vi.fn((partials: Record<string, any>[]) => {
			events.push(`updateShapes:${partials.length}`)
		}),
		setSelectedShapes: vi.fn((ids: TLShapeId[]) => events.push(`select:${ids.join(',')}`)),
	} as unknown as Editor
	return { editor, events, created }
}

describe('what a wrap is allowed to adopt', () => {
	it('needs two or more shapes, the way FigJam gates its own wrap control', () => {
		expect(canWrapSelection(fakeEditor([shape(A)]).editor)).toBe(false)
		expect(canWrapSelection(fakeEditor([shape(A), shape(B)]).editor)).toBe(true)
	})

	it('never adopts a connection, because a cable follows its endpoints', () => {
		const { editor } = fakeEditor([shape(A), shape(B), shape(CABLE, 'connection')])
		expect(wrappableSelection(editor).map((s) => s.id)).toEqual([A, B])
	})

	it('ignores locked shapes, so a locked backdrop cannot be swallowed', () => {
		const { editor } = fakeEditor([shape(A), shape(B, 'geo', PAGE_ID, true)])
		expect(canWrapSelection(editor)).toBe(false)
	})

	it('refuses in a readonly editor', () => {
		const { editor } = fakeEditor([shape(A), shape(B)])
		vi.mocked(editor.getInstanceState).mockReturnValue({ isReadonly: true } as never)
		expect(canWrapSelection(editor)).toBe(false)
	})

	it('returns null rather than creating an orphan container', () => {
		const { editor, events } = fakeEditor([shape(A)])
		expect(wrapSelectionInto(editor, 'block')).toBeNull()
		expect(events).toEqual([])
	})
})

describe('the wrap itself', () => {
	it('draws the container around where the shapes already are', () => {
		const { editor, events } = fakeEditor([shape(A), shape(B)])
		const result = wrapSelectionInto(editor, 'block')
		expect(result?.adopted).toBe(2)
		// side inset 16, block heading band 48, bottom 16.
		expect(events).toContain(`create:block:84,52:232x144:${PAGE_ID}`)
	})

	it('gives a Branch room for its band and its first arm header', () => {
		const { editor, events } = fakeEditor([shape(A), shape(B)])
		wrapSelectionInto(editor, 'branch')
		// 40 band + 32 arm header = 72 above; 10 + 8 below.
		expect(events).toContain(`create:branch:84,28:232x170:${PAGE_ID}`)
	})

	it('reparents the children and leaves the container selected', () => {
		const { editor, events } = fakeEditor([shape(A), shape(B)])
		const result = wrapSelectionInto(editor, 'block')
		const reparent = events.findIndex((event) => event.startsWith('reparent:'))
		expect(events[reparent]).toBe(`reparent:${A},${B}->${result?.containerId}`)
		expect(events.at(-1)).toBe(`select:${result?.containerId}`)
		// Reparenting must happen after creation, or there is nothing to adopt into.
		expect(reparent).toBeGreaterThan(events.findIndex((e) => e.startsWith('create:')))
	})

	it('switches a wrapping Block to Expanded — the only view that holds children', () => {
		const { editor, created } = fakeEditor([shape(A), shape(B)])
		const result = wrapSelectionInto(editor, 'block')
		expect(created.get(result!.containerId)?.props.view).toBe('expanded')
	})

	it('keeps the container beside its children when they share one parent', () => {
		const inside = 'shape:parent' as TLShapeId
		const { editor, events } = fakeEditor([shape(A, 'geo', inside), shape(B, 'geo', inside)])
		wrapSelectionInto(editor, 'block')
		expect(events.find((e) => e.startsWith('create:'))).toContain(`:${inside}`)
	})

	it('falls back to the page when the selection spans parents', () => {
		const { editor, events } = fakeEditor([
			shape(A, 'geo', 'shape:one' as TLShapeId),
			shape(B, 'geo', 'shape:two' as TLShapeId),
		])
		wrapSelectionInto(editor, 'block')
		expect(events.find((e) => e.startsWith('create:'))).toContain(`:${PAGE_ID}`)
	})

	it('records one undo step for the whole wrap', () => {
		const { editor, events } = fakeEditor([shape(A), shape(B)])
		wrapSelectionInto(editor, 'branch')
		expect(events.filter((e) => e.startsWith('mark:'))).toEqual(['mark:wrap selection in branch'])
	})
})

describe('the target list the two surfaces share', () => {
	it('offers every target exactly once, in menu order', () => {
		expect(WRAP_TARGET_DESCRIPTORS.map((d) => d.target)).toEqual([...WRAP_TARGETS])
	})

	it('routes frame and group to stock actions rather than reimplementing them', () => {
		const stock = WRAP_TARGET_DESCRIPTORS.filter((d) => d.stockActionId)
		expect(stock.map((d) => d.stockActionId)).toEqual(['frame-selection', 'group'])
	})

	it('owns only the containers tldraw does not have', () => {
		const owned = WRAP_TARGET_DESCRIPTORS.filter((d) => !d.stockActionId)
		expect(owned.map((d) => d.target)).toEqual(['block', 'branch'])
	})
})
