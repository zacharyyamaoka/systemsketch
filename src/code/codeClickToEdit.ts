import type { Editor, TLEventInfo, TLShapeId } from 'tldraw'
import { isCodeShape, type CodeShape } from './codeModel'

function isPlainLeftClick(info: TLEventInfo): boolean {
	return info.type === 'pointer'
		&& info.button === 0
		&& !info.shiftKey
		&& !info.altKey
		&& !info.ctrlKey
		&& !info.accelKey
}

function codeClickToEditCandidate(editor: Editor): CodeShape | null {
	if (editor.getIsReadonly() || !editor.isIn('select')) return null
	const shapeId = editor.getEditingShapeId() ?? editor.getOnlySelectedShapeId()
	if (!shapeId) return null
	const shape = editor.getShape(shapeId)
	if (!isCodeShape(shape) || shape.isLocked || !editor.canEditShape(shape)) return null
	return shape
}

/**
 * The second click is an editing transaction, not a fresh text insertion.
 *
 * WHY: tldraw's Select tool normally interprets a double-click on an empty
 * custom HTML surface as “place a Text shape.” CodeMirror owns that surface
 * once selected, so the same two-click rhythm must enter the existing code
 * document before stock text placement receives the pointer-up.
 */
export function installCodeClickToEdit(editor: Editor): () => void {
	let armedShapeId: TLShapeId | null = null
	let pendingShapeId: TLShapeId | null = null

	const onBeforeEvent = (info: TLEventInfo) => {
		if (info.type !== 'pointer') return
		if (info.name === 'pointer_down') {
			armedShapeId = isPlainLeftClick(info) ? codeClickToEditCandidate(editor)?.id ?? null : null
			pendingShapeId = null
		}
		if (info.name === 'pointer_up' && editor.inputs.getIsDragging()) pendingShapeId = null
	}

	const onEvent = (info: TLEventInfo) => {
		if (info.name === 'pointer_down') {
			pendingShapeId = armedShapeId
			armedShapeId = null
			return
		}
		if (info.name === 'pointer_up') {
			const shapeId = pendingShapeId
			pendingShapeId = null
			if (!shapeId) return
			const shape = editor.getShape(shapeId)
			const stillActive = editor.getEditingShapeId() === shapeId || editor.getOnlySelectedShapeId() === shapeId
			if (isCodeShape(shape) && stillActive && editor.canEditShape(shape)) editor.setEditingShape(shapeId)
			return
		}
		if (['cancel', 'interrupt', 'long_press', 'right_click'].includes(info.name)) {
			armedShapeId = null
			pendingShapeId = null
		}
	}

	editor.on('before-event', onBeforeEvent)
	editor.on('event', onEvent)
	return () => {
		editor.off('before-event', onBeforeEvent)
		editor.off('event', onEvent)
	}
}
