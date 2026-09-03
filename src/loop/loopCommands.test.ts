/**
 * The Loop's writes.
 *
 * The load-bearing one is `setLoopPortType`: retyping a header port must not
 * disturb the port's ID, because every cable welded to it is welded by ID. If a
 * retype moved the ID, renaming `Iterable` to `Poses` would silently drop the
 * cable feeding the region.
 */
import { describe, expect, it } from 'vitest'

import {
	getOnlySelectedLoop,
	setLoopPortType,
	setLoopTitle,
	setLoopTurn,
} from './loopCommands'
import { LOOP_ITEM_PORT_ID, LOOP_ITERABLE_PORT_ID, getDefaultLoopProps } from './loopModel'

function editorWith(props = getDefaultLoopProps(), selected = true) {
	const shape = { id: 'shape:loop', type: 'loop', props }
	const marks: string[] = []
	const editor = {
		marks,
		getShape: (id: string) => (id === shape.id ? shape : undefined),
		getSelectedShapes: () => (selected ? [shape] : []),
		markHistoryStoppingPoint: (label: string) => void marks.push(label),
		updateShape: (next: { props: typeof props }) => {
			shape.props = { ...shape.props, ...next.props }
		},
	}
	return { editor: editor as never, shape, marks }
}

describe('loop commands', () => {
	it('reports the selection only when it is exactly one Loop', () => {
		expect(getOnlySelectedLoop(editorWith().editor)?.type).toBe('loop')
		expect(getOnlySelectedLoop(editorWith(getDefaultLoopProps(), false).editor)).toBeNull()
	})

	it('retypes a header port without moving its ID', () => {
		const { editor, shape } = editorWith()
		expect(setLoopPortType(editor, 'shape:loop' as never, LOOP_ITERABLE_PORT_ID, 'Poses'))
			.toBe('changed')
		expect(shape.props.iterable).toEqual({ id: LOOP_ITERABLE_PORT_ID, type: 'Poses' })
		expect(setLoopPortType(editor, 'shape:loop' as never, LOOP_ITEM_PORT_ID, 'Pose'))
			.toBe('changed')
		expect(shape.props.item).toEqual({ id: LOOP_ITEM_PORT_ID, type: 'Pose' })
	})

	it('refuses a port ID the header does not have', () => {
		const { editor, shape } = editorWith()
		expect(setLoopPortType(editor, 'shape:loop' as never, 'nope', 'Pose')).toBe('unchanged')
		expect(shape.props.iterable.type).toBe('Iterable')
	})

	it('writes the title and the turn, and says when nothing changed', () => {
		const { editor, shape } = editorWith()
		expect(setLoopTitle(editor, 'shape:loop' as never, 'For each pose')).toBe('changed')
		expect(shape.props.title).toBe('For each pose')
		expect(setLoopTitle(editor, 'shape:loop' as never, 'For each pose')).toBe('unchanged')
		expect(setLoopTurn(editor, 'shape:loop' as never, 'iteration 3 of 7')).toBe('changed')
		expect(shape.props.turn).toBe('iteration 3 of 7')
	})

	it('marks history once per edit, and never while a field is being typed into', () => {
		const { editor, marks } = editorWith()
		setLoopTitle(editor, 'shape:loop' as never, 'a')
		expect(marks).toEqual(['rename loop'])
		setLoopTitle(editor, 'shape:loop' as never, 'ab', { historyLabel: false })
		setLoopTitle(editor, 'shape:loop' as never, 'abc', { historyLabel: false })
		expect(marks).toEqual(['rename loop'])
	})

	it('says `missing` rather than throwing when the shape is gone', () => {
		const { editor } = editorWith()
		expect(setLoopTitle(editor, 'shape:ghost' as never, 'x')).toBe('missing')
	})
})
