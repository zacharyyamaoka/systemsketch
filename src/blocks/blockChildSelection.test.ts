import { createShapeId, type Editor, type TLEventInfo, type TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { installBlockChildSelection } from './blockChildSelection'
import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'

function block(
	id: string,
	parentId: TLShape['parentId'] = 'page:page' as TLShape['parentId'],
): BlockShape {
	return {
		id: createShapeId(id), typeName: 'shape', type: 'block', x: 0, y: 0,
		rotation: 0, index: 'a1', parentId, isLocked: false, opacity: 1, meta: {},
		props: setBlockViewProps(getDefaultBlockProps(), 'expanded'),
	} as BlockShape
}

function pointer(overrides: Partial<TLEventInfo> = {}): TLEventInfo {
	return {
		type: 'pointer', name: 'pointer_down', point: { x: 100, y: 100 },
		pointerId: 1, button: 0, isPen: false, target: 'canvas',
		shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, accelKey: false,
		...overrides,
	} as TLEventInfo
}

function harness(parent: BlockShape, member: TLShape) {
	let selected: TLShape = parent
	const shapes = new Map([[parent.id, parent], [member.id, member]])
	let eventHandler: ((info: TLEventInfo) => void) | undefined
	const editor = {
		on: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
			if (name === 'event') eventHandler = handler
		}),
		off: vi.fn(),
		isIn: (path: string) => path === 'select.pointing_shape',
		getOnlySelectedShape: () => selected,
		getShape: (id: TLShape['id']) => shapes.get(id),
		isShapeOrAncestorLocked: () => false,
		setSelectedShapes: vi.fn((ids: TLShape['id'][]) => {
			const next = shapes.get(ids[0])
			if (next) selected = next
		}),
	} as unknown as Editor
	return {
		editor,
		emit: (info: TLEventInfo) => eventHandler?.(info),
		get selected() { return selected },
	}
}

describe('Block child first-drag selection handoff', () => {
	it('selects the pressed child after stock routes into pointing_shape', () => {
		const parent = block('parent')
		const member = block('member', parent.id)
		const app = harness(parent, member)
		installBlockChildSelection(app.editor, { memberUnderPointer: () => member })

		app.emit(pointer())

		expect(app.editor.setSelectedShapes).toHaveBeenCalledWith([member.id])
		expect(app.selected.id).toBe(member.id)
	})

	it('leaves a hit outside the selected Block untouched', () => {
		const parent = block('parent')
		const other = block('other')
		const app = harness(parent, other)
		installBlockChildSelection(app.editor, { memberUnderPointer: () => other })

		app.emit(pointer())

		expect(app.editor.setSelectedShapes).not.toHaveBeenCalled()
		expect(app.selected.id).toBe(parent.id)
	})

	it('preserves modifier and non-drag selection semantics', () => {
		const parent = block('parent')
		const member = block('member', parent.id)
		const app = harness(parent, member)
		installBlockChildSelection(app.editor, { memberUnderPointer: () => member })

		app.emit(pointer({ shiftKey: true }))

		expect(app.editor.setSelectedShapes).not.toHaveBeenCalled()
	})

	it('disposes its public editor event seam', () => {
		const parent = block('parent')
		const member = block('member', parent.id)
		const app = harness(parent, member)
		const dispose = installBlockChildSelection(app.editor, { memberUnderPointer: () => member })

		dispose()

		expect(app.editor.off).toHaveBeenCalledWith('event', expect.any(Function))
	})
})
