/**
 * Two clicks, one gesture, for a Branch: the first selects it, the next one
 * edits the title you clicked — the band's, an arm's, or a control port's.
 *
 * The same seams as the Block's adapter (`before-event` for the selection as
 * it was, `event` once the stock tool has finished), with a Branch's own field
 * hit test. A press on a chevron, a target or a dot never reaches here: those
 * elements stop propagation before tldraw sees the press.
 */
import type { Editor, TLEventInfo, TLShapeId } from 'tldraw'

import { isBranchShape, type BranchShape } from './branchModel'
import {
	branchInlineFieldAtPointOrNull,
	branchInlineFieldFromClientPoint,
	rememberBranchInlineField,
	type BranchInlineField,
} from './branchInlineEditing'

export function branchClickToEditCandidate(editor: Editor): BranchShape | null {
	if (editor.getIsReadonly()) return null
	if (!editor.isIn('select')) return null
	const shapeId = editor.getEditingShapeId() ?? editor.getOnlySelectedShapeId()
	if (!shapeId) return null
	const shape = editor.getShape(shapeId)
	if (!isBranchShape(shape) || shape.isLocked) return null
	if (!editor.canEditShape(shape)) return null
	return shape
}

function isPlainLeftClick(info: TLEventInfo): boolean {
	return info.type === 'pointer'
		&& info.button === 0
		&& !info.shiftKey
		&& !info.altKey
		&& !info.ctrlKey
		&& !info.accelKey
}

export function branchFieldUnderPointer(editor: Editor, shape: BranchShape): BranchInlineField | null {
	const container = editor.getContainer()
	const containerBounds = container.getBoundingClientRect()
	const screenPoint = editor.inputs.getCurrentScreenPoint()
	const painted = branchInlineFieldFromClientPoint(
		container.ownerDocument,
		{ x: containerBounds.left + screenPoint.x, y: containerBounds.top + screenPoint.y },
		shape.id,
	)
	if (painted) return painted
	return branchInlineFieldAtPointOrNull(
		shape.props,
		editor.getPointInShapeSpace(shape, editor.inputs.getCurrentPagePoint()),
	)
}

interface PendingClick {
	shapeId: TLShapeId
	field: BranchInlineField
}

export function installBranchClickToEdit(
	editor: Editor,
	options: { fieldUnderPointer?: (editor: Editor, shape: BranchShape) => BranchInlineField | null } = {},
): () => void {
	const fieldUnderPointer = options.fieldUnderPointer ?? branchFieldUnderPointer
	let armedShapeId: TLShapeId | null = null
	let pending: PendingClick | null = null

	const onBeforeEvent = (info: TLEventInfo) => {
		if (info.type !== 'pointer') return
		if (info.name === 'pointer_down') {
			armedShapeId = null
			pending = null
			if (!isPlainLeftClick(info)) return
			armedShapeId = branchClickToEditCandidate(editor)?.id ?? null
			return
		}
		if (info.name === 'pointer_up' && editor.inputs.getIsDragging()) pending = null
	}

	const onEvent = (info: TLEventInfo) => {
		switch (info.name) {
			case 'pointer_down': {
				const shapeId = armedShapeId
				armedShapeId = null
				if (!shapeId) return
				const shape = editor.getShape(shapeId)
				if (!isBranchShape(shape)) return
				const field = fieldUnderPointer(editor, shape)
				if (!field) return
				pending = { shapeId, field }
				return
			}
			case 'pointer_up': {
				const click = pending
				pending = null
				if (!click) return
				const shape = editor.getShape(click.shapeId)
				if (!isBranchShape(shape)) return
				const isActive = editor.getEditingShapeId() === shape.id
					|| editor.getOnlySelectedShapeId() === shape.id
				if (!isActive || !editor.canEditShape(shape)) return
				rememberBranchInlineField(editor, shape.id, click.field)
				if (editor.getEditingShapeId() !== shape.id) editor.setEditingShape(shape.id)
				return
			}
			case 'cancel':
			case 'interrupt':
			case 'long_press':
			case 'right_click': {
				armedShapeId = null
				pending = null
				return
			}
		}
	}

	editor.on('before-event', onBeforeEvent)
	editor.on('event', onEvent)
	return () => {
		armedShapeId = null
		pending = null
		editor.off('before-event', onBeforeEvent)
		editor.off('event', onEvent)
	}
}
