/**
 * Every write to a Loop region goes through here, in the Branch's idiom: one
 * `updateLoopProps` funnel that marks history unless a live field asks it not
 * to, so a keystroke in the inspector does not become an undo step of its own.
 */
import type { Editor, TLShapeId } from 'tldraw'

import {
	LOOP_ITEM_PORT_ID,
	LOOP_ITERABLE_PORT_ID,
	LOOP_SHAPE_TYPE,
	isLoopShape,
	reconcileLoopProps,
	type LoopShape,
	type LoopShapeProps,
} from './loopModel'

export interface LoopCommandOptions {
	/** `false` while a field is being typed into; a label otherwise. */
	historyLabel?: string | false
}

export type LoopCommandResult = 'changed' | 'unchanged' | 'missing'

export function getOnlySelectedLoop(editor: Editor): LoopShape | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1) return null
	return isLoopShape(selected[0]) ? selected[0] : null
}

function updateLoopProps(
	editor: Editor,
	shapeId: TLShapeId,
	update: (props: LoopShapeProps) => LoopShapeProps,
	options: LoopCommandOptions,
): LoopCommandResult {
	const loop = editor.getShape(shapeId)
	if (!isLoopShape(loop)) return 'missing'
	const next = reconcileLoopProps(update(loop.props))
	if (next === loop.props) return 'unchanged'
	const label = options.historyLabel ?? 'edit loop'
	if (label !== false) editor.markHistoryStoppingPoint(label)
	editor.updateShape({ id: shapeId, type: LOOP_SHAPE_TYPE, props: next })
	return 'changed'
}

export function setLoopTitle(
	editor: Editor,
	shapeId: TLShapeId,
	title: string,
	options: LoopCommandOptions = {},
): LoopCommandResult {
	return updateLoopProps(
		editor,
		shapeId,
		(props) => (props.title === title ? props : { ...props, title }),
		{ historyLabel: options.historyLabel ?? 'rename loop' },
	)
}

export function setLoopTurn(
	editor: Editor,
	shapeId: TLShapeId,
	turn: string,
	options: LoopCommandOptions = {},
): LoopCommandResult {
	return updateLoopProps(
		editor,
		shapeId,
		(props) => (props.turn === turn ? props : { ...props, turn }),
		{ historyLabel: options.historyLabel ?? 'set loop turn' },
	)
}

/**
 * Retype one of the header's two ports.
 *
 * A type and only a type: there is no name to set, because the collection's
 * name lives on whatever produces it and the element has no name until a
 * Block's port gives it one. The port's ID never moves, so every cable already
 * welded to it stays welded.
 */
export function setLoopPortType(
	editor: Editor,
	shapeId: TLShapeId,
	portId: string,
	type: string,
	options: LoopCommandOptions = {},
): LoopCommandResult {
	if (portId !== LOOP_ITERABLE_PORT_ID && portId !== LOOP_ITEM_PORT_ID) return 'unchanged'
	const key = portId === LOOP_ITERABLE_PORT_ID ? 'iterable' : 'item'
	return updateLoopProps(
		editor,
		shapeId,
		(props) => (props[key].type === type
			? props
			: { ...props, [key]: { ...props[key], type } }),
		{ historyLabel: options.historyLabel ?? 'retype loop port' },
	)
}
