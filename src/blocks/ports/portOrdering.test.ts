/**
 * The lane-ordering contract behind every in-window port gesture: the bead,
 * the held drop, and the Add above / Add below / Move up / Move down commands
 * all resolve to one of these two reducers.
 */
import type { Editor, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockPort,
	type BlockShape,
} from '../blockModel'
import { blockPortSlotCount, blockPortViewHeightForSlots, layoutBlock } from '../layoutBlock'
import {
	blockPortIndex,
	insertBlockPortForInlineEditing,
	insertBlockPortProps,
	moveBlockPortToIndex,
	moveBlockPortToIndexProps,
} from '../commands/blockCommands'

function port(id: string, overrides: Partial<BlockPort> = {}): BlockPort {
	return { id, name: id, type: '', visible: true, ...overrides }
}

function blockShape(overrides: Partial<BlockShape['props']> = {}): BlockShape {
	return {
		id: 'shape:block' as TLShapeId,
		typeName: 'shape',
		type: BLOCK_SHAPE_TYPE,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			...setBlockViewProps(getDefaultBlockProps(), 'port'),
			inputs: [port('in_1'), port('in_2')],
			outputs: [port('out_1')],
			...overrides,
		},
	}
}

function mockEditor(shape = blockShape()) {
	let current = shape
	const history: string[] = []
	const editor = {
		getShape: (id: TLShapeId) => (id === current.id ? current : undefined),
		getSelectedShapes: () => [current],
		getCurrentToolId: () => 'select',
		markHistoryStoppingPoint: (label: string) => {
			history.push(label)
			return `mark:${history.length}`
		},
		updateShape: (partial: { props?: Partial<BlockShape['props']> }) => {
			current = { ...current, props: { ...current.props, ...partial.props } }
			return editor
		},
	}
	return { editor: editor as unknown as Editor, current: () => current, history }
}

const ids = (ports: readonly BlockPort[]) => ports.map((entry) => entry.id)

describe('insertBlockPortProps', () => {
	it('places a fresh identity at the requested position', () => {
		const props = blockShape().props
		const inserted = insertBlockPortProps(props, 'inputs', 1)
		expect(inserted.port.id).toBe('in_3')
		expect(ids(inserted.props.inputs)).toEqual(['in_1', 'in_3', 'in_2'])
	})

	it('numbers the new id past the highest in the lane, not by position', () => {
		const props = blockShape({ inputs: [port('in_5'), port('in_2')] }).props
		expect(insertBlockPortProps(props, 'inputs', 0).port.id).toBe('in_6')
	})

	it('clamps past-the-end and negative indexes to append and prepend', () => {
		const props = blockShape().props
		expect(ids(insertBlockPortProps(props, 'inputs', 99).props.inputs))
			.toEqual(['in_1', 'in_2', 'in_3'])
		expect(ids(insertBlockPortProps(props, 'inputs', -4).props.inputs))
			.toEqual(['in_3', 'in_1', 'in_2'])
	})

	it('leaves the other lane untouched', () => {
		const props = blockShape().props
		expect(insertBlockPortProps(props, 'inputs', 0).props.outputs).toBe(props.outputs)
	})
})

describe('moveBlockPortToIndexProps', () => {
	const props = blockShape({ inputs: [port('in_1'), port('in_2'), port('in_3')] }).props

	it('moves a port up to an insertion index above it', () => {
		expect(ids(moveBlockPortToIndexProps(props, 'inputs', 'in_3', 1).inputs))
			.toEqual(['in_1', 'in_3', 'in_2'])
	})

	it('moves a port down, accounting for its own removal from the lane', () => {
		expect(ids(moveBlockPortToIndexProps(props, 'inputs', 'in_1', 2).inputs))
			.toEqual(['in_2', 'in_1', 'in_3'])
	})

	it('sends a port to either end', () => {
		expect(ids(moveBlockPortToIndexProps(props, 'inputs', 'in_3', 0).inputs))
			.toEqual(['in_3', 'in_1', 'in_2'])
		expect(ids(moveBlockPortToIndexProps(props, 'inputs', 'in_1', 3).inputs))
			.toEqual(['in_2', 'in_3', 'in_1'])
	})

	it('returns the same props object for a drop that changes nothing', () => {
		// This is what keeps a released-in-place drag out of the undo stack.
		expect(moveBlockPortToIndexProps(props, 'inputs', 'in_2', 1)).toBe(props)
		expect(moveBlockPortToIndexProps(props, 'inputs', 'in_2', 2)).toBe(props)
		expect(moveBlockPortToIndexProps(props, 'inputs', 'nope', 0)).toBe(props)
	})

	it('preserves port identity and every per-port marker', () => {
		const marked = blockShape({
			inputs: [port('in_1'), port('in_2', { groupStart: true, defaultValue: '5' })],
		}).props
		const moved = moveBlockPortToIndexProps(marked, 'inputs', 'in_2', 0)
		expect(moved.inputs[0]).toBe(marked.inputs[1])
	})
})

describe('blockPortIndex', () => {
	it('locates a port, and reports the end of the lane for one that is gone', () => {
		const props = blockShape().props
		expect(blockPortIndex(props, 'inputs', 'in_2')).toBe(1)
		expect(blockPortIndex(props, 'inputs', 'in_9')).toBe(2)
	})
})

describe('editor-backed in-window port commands', () => {
	it('inserts at an index, grows the box, and marks one history step', () => {
		const fixture = mockEditor()
		const before = fixture.current().props
		expect(layoutBlock(before).pitch).toBe(44)

		const result = insertBlockPortForInlineEditing(fixture.editor, fixture.current().id, 'inputs', 1)
		expect(result.ok).toBe(true)

		const after = fixture.current().props
		expect(ids(after.inputs)).toEqual(['in_1', 'in_3', 'in_2'])
		expect(after.h).toBe(blockPortViewHeightForSlots(after, blockPortSlotCount(after)))
		expect(layoutBlock(after).pitch).toBe(44)
		expect(fixture.history).toEqual(['add block input'])
	})

	it('reveals Port view when a Simple Block is asked for a port', () => {
		const fixture = mockEditor(blockShape({
			...setBlockViewProps(getDefaultBlockProps(), 'simple'),
			inputs: [],
			outputs: [],
		}))
		insertBlockPortForInlineEditing(fixture.editor, fixture.current().id, 'outputs', 0)
		expect(fixture.current().props.view).toBe('port')
		expect(ids(fixture.current().props.outputs)).toEqual(['out_1'])
	})

	it('reorders in one history step and refuses a port that is not there', () => {
		const fixture = mockEditor()
		expect(moveBlockPortToIndex(fixture.editor, fixture.current().id, 'inputs', 'in_2', 0).ok).toBe(true)
		expect(ids(fixture.current().props.inputs)).toEqual(['in_2', 'in_1'])
		expect(fixture.history).toEqual(['reorder block port'])

		expect(moveBlockPortToIndex(fixture.editor, fixture.current().id, 'inputs', 'in_9', 0)).toEqual({
			ok: false,
			reason: 'missing-port',
		})
		expect(fixture.history).toEqual(['reorder block port'])
	})

	it('opens no undo step when a drop lands where the port already was', () => {
		const fixture = mockEditor()
		expect(moveBlockPortToIndex(fixture.editor, fixture.current().id, 'inputs', 'in_1', 0)).toEqual({
			ok: false,
			reason: 'unchanged',
		})
		expect(fixture.history).toEqual([])
	})
})
