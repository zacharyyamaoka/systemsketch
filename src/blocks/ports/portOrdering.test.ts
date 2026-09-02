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
	blockPortRowCount,
	insertBlockPortForInlineEditing,
	insertBlockPortProps,
	moveBlockPortProps,
	moveBlockPortToIndex,
	moveBlockPortToIndexProps,
	moveBlockPortToSection,
	moveBlockPortToSectionProps,
	startBlockPortSectionProps,
} from '../commands/blockCommands'
import { portBranch, portRow } from '../blockModel'

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

	it('preserves port identity within a section, and adopts the row of the port it now follows', () => {
		const marked = blockShape({
			inputs: [port('in_1'), port('in_2', { defaultValue: '5' }), port('in_3', { row: 2 })],
		}).props
		const within = moveBlockPortToIndexProps(marked, 'inputs', 'in_2', 0)
		expect(within.inputs[0]).toBe(marked.inputs[1])
		const across = moveBlockPortToIndexProps(marked, 'inputs', 'in_1', 3)
		expect(ids(across.inputs)).toEqual(['in_2', 'in_3', 'in_1'])
		expect(portRow(across.inputs[2])).toBe(2)
		expect(across.inputs[2].defaultValue).toBe(marked.inputs[0].defaultValue)
	})
})

describe('moveBlockPortToSectionProps', () => {
	const props = blockShape({
		inputs: [port('cond', { row: 0 }), port('in_1'), port('in_2'), port('in_3', { row: 2 })],
		outputs: [port('out_1'), port('out_2', { branch: 1 }), port('out_3', { row: 2 })],
	}).props
	const place = (ports: readonly BlockPort[]) => ports.map((entry) => `${entry.id}@${portRow(entry)}.${portBranch(entry)}`)

	it('lifts an input into the heading, keeping its identity', () => {
		const next = moveBlockPortToSectionProps(props, 'inputs', 'in_2', { row: 0, branch: 0, before: null })
		expect(place(next.inputs)).toEqual(['cond@0.0', 'in_2@0.0', 'in_1@1.0', 'in_3@2.0'])
		expect(next.inputs[1].name).toBe('in_2')
		expect(next.outputs).toBe(props.outputs)
	})

	it('lands before the named neighbour inside the target section', () => {
		const next = moveBlockPortToSectionProps(props, 'inputs', 'in_3', { row: 1, branch: 0, before: 'in_2' })
		expect(place(next.inputs)).toEqual(['cond@0.0', 'in_1@1.0', 'in_3@1.0', 'in_2@1.0'])
	})

	it('moves an output into another arm, and into another row', () => {
		// out_1 was alone in its arm, so joining out_2's arm leaves one arm: the
		// half-line goes, and the two are simply together.
		const arm = moveBlockPortToSectionProps(props, 'outputs', 'out_1', { row: 1, branch: 1, before: null })
		expect(place(arm.outputs)).toEqual(['out_2@1.0', 'out_1@1.0', 'out_3@2.0'])
		const shared = moveBlockPortToSectionProps(
			{ ...props, outputs: [port('out_0'), ...props.outputs] },
			'outputs', 'out_1', { row: 1, branch: 1, before: null },
		)
		expect(place(shared.outputs)).toEqual(['out_0@1.0', 'out_2@1.1', 'out_1@1.1', 'out_3@2.0'])
		const row = moveBlockPortToSectionProps(props, 'outputs', 'out_2', { row: 2, branch: 0, before: 'out_3' })
		expect(place(row.outputs)).toEqual(['out_1@1.0', 'out_2@2.0', 'out_3@2.0'])
	})

	it('never puts an output in the heading, nor an input in an arm', () => {
		const output = moveBlockPortToSectionProps(props, 'outputs', 'out_1', { row: 0, branch: 0, before: null })
		expect(portRow(output.outputs.find((entry) => entry.id === 'out_1')!)).toBe(1)
		const input = moveBlockPortToSectionProps(props, 'inputs', 'in_1', { row: 2, branch: 3, before: null })
		expect(portBranch(input.inputs.find((entry) => entry.id === 'in_1')!)).toBe(0)
	})

	it('compacts a row left empty on both sides, so rows stay dense', () => {
		const next = moveBlockPortToSectionProps(
			moveBlockPortToSectionProps(props, 'inputs', 'in_3', { row: 1, branch: 0, before: null }),
			'outputs', 'out_3', { row: 1, branch: 0, before: null },
		)
		expect(blockPortRowCount(next)).toBe(1)
	})

	it('returns the same props object when the drop changes nothing', () => {
		expect(moveBlockPortToSectionProps(props, 'inputs', 'in_2', { row: 1, branch: 0, before: null })).toBe(props)
		expect(moveBlockPortToSectionProps(props, 'inputs', 'in_1', { row: 1, branch: 0, before: 'in_2' })).toBe(props)
		expect(moveBlockPortToSectionProps(props, 'inputs', 'nope', { row: 0, branch: 0, before: null })).toBe(props)
	})
})

describe('moveBlockPortProps steps visually', () => {
	const props = blockShape({
		inputs: [port('cond', { row: 0 }), port('in_1'), port('in_2'), port('in_3', { row: 2 })],
		outputs: [port('out_1'), port('out_2', { branch: 1 })],
	}).props

	it('swaps neighbours within a section', () => {
		expect(ids(moveBlockPortProps(props, 'inputs', 'in_2', -1).inputs)).toEqual(['cond', 'in_2', 'in_1', 'in_3'])
	})

	it('steps across a line into the neighbouring section', () => {
		const up = moveBlockPortProps(props, 'inputs', 'in_3', -1)
		expect(ids(up.inputs)).toEqual(['cond', 'in_1', 'in_2', 'in_3'])
		expect(portRow(up.inputs[3])).toBe(1)
		const down = moveBlockPortProps(props, 'inputs', 'in_2', 1)
		expect(ids(down.inputs)).toEqual(['cond', 'in_1', 'in_2', 'in_3'])
		expect(portRow(down.inputs[2])).toBe(2)
		// Stepping down across the half-line joins the arm below at its top; the
		// arm it left is empty, so the line goes and the order reads unchanged.
		const arm = moveBlockPortProps(props, 'outputs', 'out_1', 1)
		expect(ids(arm.outputs)).toEqual(['out_1', 'out_2'])
		expect(arm.outputs.map(portBranch)).toEqual([0, 0])
	})

	it('lifts the first body input into the heading, and stops at the lane ends otherwise', () => {
		const lifted = moveBlockPortProps(props, 'inputs', 'in_1', -1)
		expect(ids(lifted.inputs)).toEqual(['cond', 'in_1', 'in_2', 'in_3'])
		expect(portRow(lifted.inputs[1])).toBe(0)
		expect(moveBlockPortProps(props, 'inputs', 'cond', -1)).toBe(props)
		expect(moveBlockPortProps(props, 'inputs', 'in_3', 1)).toBe(props)
		expect(moveBlockPortProps(props, 'outputs', 'out_2', 1)).toBe(props)
	})
})

describe('startBlockPortSectionProps', () => {
	const props = blockShape({
		inputs: [port('in_1'), port('in_2', { row: 2 })],
		outputs: [port('out_1'), port('out_2', { row: 2 })],
	}).props

	it('opens a new row under the port\'s own, shifting later rows on both sides', () => {
		const next = startBlockPortSectionProps(props, 'inputs', 'in_1', 'row')
		expect(next.inputs.map((entry) => [entry.id, portRow(entry)])).toEqual([['in_1', 2], ['in_2', 3]])
		expect(next.outputs.map((entry) => [entry.id, portRow(entry)])).toEqual([['out_1', 1], ['out_2', 3]])
		expect(blockPortRowCount(next)).toBe(3)
	})

	it('opens a new arm under an output\'s own, inside its row', () => {
		const next = startBlockPortSectionProps(props, 'outputs', 'out_1', 'branch')
		expect(portBranch(next.outputs[0])).toBe(0)
		expect(next.outputs[0].id).toBe('out_1')
		// out_1 was alone in arm 0, so arm 0 is now empty and compacts away.
		expect(blockPortRowCount(next)).toBe(2)
		const shared = startBlockPortSectionProps(
			{ ...props, outputs: [port('out_1'), port('out_9'), port('out_2', { row: 2 })] },
			'outputs', 'out_1', 'branch',
		)
		expect(shared.outputs.map((entry) => [entry.id, portBranch(entry)])).toEqual([['out_9', 0], ['out_1', 1], ['out_2', 0]])
	})

	it('refuses an arm for an input', () => {
		expect(startBlockPortSectionProps(props, 'inputs', 'in_1', 'branch')).toBe(props)
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

	it('moves a port to the heading in one labelled history step', () => {
		const fixture = mockEditor()
		const result = moveBlockPortToSection(fixture.editor, fixture.current().id, 'inputs', 'in_2', {
			row: 0, branch: 0, before: null,
		})
		expect(result.ok).toBe(true)
		expect(fixture.current().props.inputs.map((entry) => [entry.id, portRow(entry)]))
			.toEqual([['in_2', 0], ['in_1', 1]])
		expect(fixture.history).toEqual(['move block port to header'])
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
