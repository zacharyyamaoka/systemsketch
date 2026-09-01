import { createShapeId, type Editor, type TLEventInfo, type TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { installBlockClickToEdit } from './blockClickToEdit'
import { getDefaultBlockProps, type BlockShape } from './blockModel'
import {
	blockInlineFieldAtPoint,
	blockInlineFieldAtPointOrNull,
	getBlockInlineField,
	rememberBlockInlineField,
	type BlockInlineField,
} from './inlineBlockEditing'
import { layoutBlock } from './layoutBlock'

/** The Port view is the face the FR's screenshots show: header plus port rows. */
function portViewProps(): BlockShape['props'] {
	const defaults = getDefaultBlockProps()
	return {
		...defaults,
		...defaults.views.port,
		view: 'port',
		title: 'decode',
		inputs: [{ id: 'in_1', name: 'raw', type: 'bytes', visible: true }],
		outputs: [{ id: 'out_1', name: 'Frame', type: '', visible: true }],
	}
}

function blockShape(props: Partial<BlockShape['props']> = {}): BlockShape {
	return {
		id: createShapeId('block'),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId: 'page:page',
		isLocked: false,
		opacity: 1,
		meta: {},
		props: { ...getDefaultBlockProps(), ...props },
	} as BlockShape
}

const pointer = (
	name: 'pointer_down' | 'pointer_up',
	overrides: Partial<TLEventInfo> = {},
): TLEventInfo => ({
	type: 'pointer',
	name,
	point: { x: 0, y: 0 },
	pointerId: 1,
	button: 0,
	isPen: false,
	target: 'canvas',
	shiftKey: false,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	accelKey: false,
	...overrides,
} as TLEventInfo)

function editorHarness() {
	let selectedShapeId: TLShape['id'] | null = null
	let editingShapeId: TLShape['id'] | null = null
	let isDragging = false
	let readonly = false
	let toolPath = 'select'
	const shapes = new Map<TLShape['id'], TLShape>()
	const handlers = new Map<string, (info: TLEventInfo) => void>()

	const editor = {
		on: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
			handlers.set(name, handler)
		}),
		off: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
			if (handlers.get(name) === handler) handlers.delete(name)
		}),
		inputs: { getIsDragging: () => isDragging },
		isIn: (path: string) => toolPath.startsWith(path),
		getIsReadonly: () => readonly,
		getShape: (id: TLShape['id']) => shapes.get(id),
		getEditingShapeId: () => editingShapeId,
		getOnlySelectedShapeId: () => selectedShapeId,
		canEditShape: () => true,
		setEditingShape: vi.fn((id: TLShape['id']) => {
			editingShapeId = id
			selectedShapeId = id
		}),
	} as unknown as Editor

	return {
		editor,
		add(shape: TLShape) {
			shapes.set(shape.id, shape)
			return shape
		},
		select(id: TLShape['id'] | null) {
			selectedShapeId = id
		},
		setEditing(id: TLShape['id'] | null) {
			editingShapeId = id
		},
		setDragging(value: boolean) {
			isDragging = value
		},
		setReadonly(value: boolean) {
			readonly = value
		},
		setToolPath(path: string) {
			toolPath = path
		},
		click(overrides: Partial<TLEventInfo> = {}) {
			this.press(overrides)
			this.release(overrides)
		},
		press(overrides: Partial<TLEventInfo> = {}) {
			const down = pointer('pointer_down', overrides)
			handlers.get('before-event')?.(down)
			handlers.get('event')?.(down)
		},
		release(overrides: Partial<TLEventInfo> = {}) {
			const up = pointer('pointer_up', overrides)
			handlers.get('before-event')?.(up)
			handlers.get('event')?.(up)
		},
		emit(info: TLEventInfo) {
			handlers.get('before-event')?.(info)
			handlers.get('event')?.(info)
		},
		get setEditingShape() {
			return editor.setEditingShape as ReturnType<typeof vi.fn>
		},
	}
}

function install(
	harness: ReturnType<typeof editorHarness>,
	field: BlockInlineField | null,
) {
	const fieldUnderPointer = vi.fn(() => field)
	const dispose = installBlockClickToEdit(harness.editor, { fieldUnderPointer })
	return { dispose, fieldUnderPointer }
}

describe('Block click-to-edit field hit test', () => {
	it('answers null off the text so a miss stays a miss', () => {
		const props = portViewProps()
		const layout = layoutBlock(props)

		// The body of a Port Block is not a field; the header title box is.
		expect(blockInlineFieldAtPointOrNull(props, { x: layout.width / 2, y: layout.footerTop - 2 }))
			.toBe(null)
		expect(blockInlineFieldAtPointOrNull(props, {
			x: layout.headerTitle!.x + 4,
			y: layout.headerHeight / 2,
		})).toEqual({ kind: 'title' })

		// The double-click reading of that same miss still opens the title.
		expect(blockInlineFieldAtPoint(props, { x: layout.width / 2, y: layout.footerTop - 2 }))
			.toEqual({ kind: 'title' })
	})

	it('resolves each painted port label to its own port', () => {
		const props = portViewProps()
		const layout = layoutBlock(props)
		const placed = layout.ports.find((port) => port.label)
		expect(placed).toBeDefined()
		const hit = blockInlineFieldAtPointOrNull(props, {
			x: placed!.label!.x + 2,
			y: placed!.y,
		})
		expect(hit).toEqual({
			kind: placed!.side === 'input' ? 'portName' : 'portType',
			side: placed!.side === 'input' ? 'inputs' : 'outputs',
			portId: placed!.port.id,
		})
	})
})

describe('Block click-to-edit gesture', () => {
	it('leaves the first click on an inactive Block as a plain selection', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		const { fieldUnderPointer } = install(harness, { kind: 'title' })

		harness.click()

		expect(fieldUnderPointer).not.toHaveBeenCalled()
		expect(harness.setEditingShape).not.toHaveBeenCalled()
		expect(harness.editor.getEditingShapeId()).toBe(null)
		expect(shape.id).toBeTruthy()
	})

	it('opens the clicked field on the next click, however slow', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		install(harness, { kind: 'portName', side: 'inputs', portId: 'in_1' })
		harness.select(shape.id)

		harness.click()

		expect(harness.setEditingShape).toHaveBeenCalledWith(shape.id)
		expect(getBlockInlineField(harness.editor, shape.id)).toEqual({
			kind: 'portName',
			side: 'inputs',
			portId: 'in_1',
		})
	})

	it('moves the editor to a second field without restarting the session', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		install(harness, { kind: 'blockType' })
		harness.select(shape.id)
		harness.setEditing(shape.id)
		rememberBlockInlineField(harness.editor, shape.id, { kind: 'title' })

		harness.click()

		expect(harness.setEditingShape).not.toHaveBeenCalled()
		expect(getBlockInlineField(harness.editor, shape.id)).toEqual({ kind: 'blockType' })
	})

	it('does nothing when the click misses every field', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		install(harness, null)
		harness.select(shape.id)

		harness.click()

		expect(harness.setEditingShape).not.toHaveBeenCalled()
	})

	it('lets a drag off an active Block stay a drag', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		install(harness, { kind: 'title' })
		harness.select(shape.id)

		harness.press()
		harness.setDragging(true)
		harness.release()

		expect(harness.setEditingShape).not.toHaveBeenCalled()
	})

	it('keeps modifier, right-button, readonly and non-select clicks stock', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		const { fieldUnderPointer } = install(harness, { kind: 'title' })
		harness.select(shape.id)

		harness.click({ shiftKey: true })
		harness.click({ accelKey: true })
		harness.click({ button: 2 })
		harness.setReadonly(true)
		harness.click()
		harness.setReadonly(false)
		harness.setToolPath('draw')
		harness.click()

		expect(fieldUnderPointer).not.toHaveBeenCalled()
		expect(harness.setEditingShape).not.toHaveBeenCalled()
	})

	it('drops the pending click when the gesture is interrupted', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		install(harness, { kind: 'title' })
		harness.select(shape.id)

		harness.press()
		harness.emit({ type: 'misc', name: 'interrupt' } as TLEventInfo)
		harness.release()

		expect(harness.setEditingShape).not.toHaveBeenCalled()
	})

	it('stops listening once disposed', () => {
		const harness = editorHarness()
		const shape = harness.add(blockShape()) as BlockShape
		const { dispose } = install(harness, { kind: 'title' })
		harness.select(shape.id)

		dispose()
		harness.click()

		expect(harness.setEditingShape).not.toHaveBeenCalled()
	})
})
