/**
 * Two clicks, one gesture: the first activates the Block, the next one edits
 * the field you clicked.
 *
 * tldraw already does this for a rectangle. `PointingShape.onPointerUp` opens
 * the text editor when a click lands on the label of the shape that is already
 * selected — but only when `getTextLabels(geometry)` finds *exactly one* label.
 * A Block's geometry is a `Group2d` carrying its header plus one circle per
 * visible port, all flagged `isLabel`, so that count is never one and the whole
 * branch is skipped. The second click fell through to a plain re-select and
 * looked like nothing happened; only the rapid double-click, which travels the
 * separate `util.onDoubleClick` path, ever opened a field.
 *
 * The fix restores the rectangle's feel without pretending a Block has one
 * label. It rides tldraw's own event seams — `before-event` to read the
 * selection as it was *before* the click, `event` to act once the stock tool
 * has finished selecting — and then hands the decision straight back:
 * `setEditingShape` drives tldraw's default side effect into
 * `select.editing_shape` exactly as a double-click would. What this module adds
 * is only *which* of the Block's several fields that lifecycle should expose.
 *
 * Because it keys off "was this Block already active", the same rule covers the
 * two-rapid-clicks case, the slow second click, and clicking a second field
 * while the first is still open.
 */
import type { Editor, TLEventInfo, TLShapeId } from 'tldraw'

import { isBlockShape, type BlockShape } from './blockModel'
import {
	blockInlineFieldAtPointOrNull,
	blockInlineFieldFromClientPoint,
	rememberBlockInlineField,
	type BlockInlineField,
} from './inlineBlockEditing'

/**
 * The Block a click can escalate from "activate" to "edit": the one already
 * being edited, otherwise the one and only selected shape. Anything else — a
 * fresh Block, a multi-selection, a modifier chord — is still just a selection.
 */
export function blockClickToEditCandidate(editor: Editor): BlockShape | null {
	if (editor.getIsReadonly()) return null
	if (!editor.isIn('select')) return null
	const shapeId = editor.getEditingShapeId() ?? editor.getOnlySelectedShapeId()
	if (!shapeId) return null
	const shape = editor.getShape(shapeId)
	if (!isBlockShape(shape) || shape.isLocked) return null
	if (!editor.canEditShape(shape)) return null
	return shape
}

/** A plain left click with no modifiers. Everything else keeps stock meaning. */
function isPlainLeftClick(info: TLEventInfo): boolean {
	return info.type === 'pointer'
		&& info.button === 0
		&& !info.shiftKey
		&& !info.altKey
		&& !info.ctrlKey
		&& !info.accelKey
}

/** DOM first for the narrow painted spans, layout boxes for the space around them. */
export function blockFieldUnderPointer(editor: Editor, shape: BlockShape): BlockInlineField | null {
	const container = editor.getContainer()
	const containerBounds = container.getBoundingClientRect()
	const screenPoint = editor.inputs.getCurrentScreenPoint()
	const painted = blockInlineFieldFromClientPoint(
		container.ownerDocument,
		{ x: containerBounds.left + screenPoint.x, y: containerBounds.top + screenPoint.y },
		shape.id,
	)
	if (painted) return painted
	return blockInlineFieldAtPointOrNull(
		shape.props,
		editor.getPointInShapeSpace(shape, editor.inputs.getCurrentPagePoint()),
	)
}

interface BlockClickToEditOptions {
	/** Seam for tests, which have no laid-out document to hit-test against. */
	fieldUnderPointer?: (editor: Editor, shape: BlockShape) => BlockInlineField | null
}

interface PendingClick {
	shapeId: TLShapeId
	field: BlockInlineField
}

/**
 * Open a Block's inline field when a click lands on it while that Block is
 * already active. Returns the disposer.
 */
export function installBlockClickToEdit(
	editor: Editor,
	options: BlockClickToEditOptions = {},
): () => void {
	const fieldUnderPointer = options.fieldUnderPointer ?? blockFieldUnderPointer

	let armedShapeId: TLShapeId | null = null
	let pending: PendingClick | null = null

	const onBeforeEvent = (info: TLEventInfo) => {
		if (info.type !== 'pointer') return

		// `before-event` runs ahead of the state chart, so this reads the
		// selection the user actually saw when they pressed.
		if (info.name === 'pointer_down') {
			armedShapeId = null
			pending = null
			if (!isPlainLeftClick(info)) return
			armedShapeId = blockClickToEditCandidate(editor)?.id ?? null
			return
		}

		// Also ahead of the state chart, which clears `isDragging` on pointer up
		// before any handler can ask whether the gesture was a drag.
		if (info.name === 'pointer_up' && editor.inputs.getIsDragging()) {
			pending = null
		}
	}

	const onEvent = (info: TLEventInfo) => {
		switch (info.name) {
			// Resolve the field after tldraw has updated its inputs from the event
			// but while the face is still painted the way the user aimed at it.
			case 'pointer_down': {
				const shapeId = armedShapeId
				armedShapeId = null
				if (!shapeId) return
				const shape = editor.getShape(shapeId)
				if (!isBlockShape(shape)) return
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
				if (!isBlockShape(shape)) return

				// A frame-like Block ends its own editing session on pointer down,
				// so accept the Block that is still merely selected as well.
				const isActive = editor.getEditingShapeId() === shape.id
					|| editor.getOnlySelectedShapeId() === shape.id
				if (!isActive || !editor.canEditShape(shape)) return

				rememberBlockInlineField(editor, shape.id, click.field)
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
