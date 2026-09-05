import { isShapeId, type Editor, type TLEventInfo, type TLShape } from 'tldraw'

import { isBlockShape } from './blockModel'

function isPlainLeftPointerDown(info: TLEventInfo): boolean {
	return info.type === 'pointer'
		&& info.name === 'pointer_down'
		&& info.button === 0
		&& !info.shiftKey
		&& !info.altKey
		&& !info.ctrlKey
		&& !info.accelKey
}

function shapeIsInside(editor: Editor, shape: TLShape, ancestor: TLShape): boolean {
	let current: TLShape | undefined = shape
	while (current && isShapeId(current.parentId)) {
		if (current.parentId === ancestor.id) return true
		current = editor.getShape(current.parentId)
	}
	return false
}

/**
 * Resolve the same painted shape that tldraw just routed into
 * `select.pointing_shape`. Pointer events from HTML shapes arrive as canvas
 * events, so the event target alone is not enough; after-event runs after the
 * input manager has updated the current page point.
 */
export function blockMemberUnderPointer(editor: Editor, info: TLEventInfo): TLShape | null {
	if (info.type !== 'pointer') return null
	if (info.target === 'shape') return info.shape
	if (info.target !== 'canvas') return null

	return editor.getShapeAtPoint(editor.inputs.getCurrentPagePoint(), {
		hitInside: false,
		hitLocked: editor.options.selectLockedShapes,
		margin: editor.getHitTestMargin(),
		renderingOnly: true,
	}) ?? editor.getHoveredShape() ?? null
}

interface BlockChildSelectionOptions {
	/** A deterministic seam for unit tests without a spatial index. */
	memberUnderPointer?: (editor: Editor, info: TLEventInfo) => TLShape | null
}

/**
 * Let a direct press-and-drag on a Block member move that member immediately,
 * even when its containing Block was selected a moment earlier.
 *
 * tldraw intentionally preserves a selected ancestor during
 * `PointingShape.onEnter`. We wait until that stock routing has completed,
 * replace only the selection, and leave `select.translating` to tldraw. No
 * pointer samples, coordinates, or reparenting are implemented here.
 */
export function installBlockChildSelection(
	editor: Editor,
	options: BlockChildSelectionOptions = {},
): () => void {
	const memberUnderPointer = options.memberUnderPointer ?? blockMemberUnderPointer
	const onEvent = (info: TLEventInfo) => {
		if (!isPlainLeftPointerDown(info) || !editor.isIn('select.pointing_shape')) return
		const selected = editor.getOnlySelectedShape()
		if (!isBlockShape(selected) || selected.isLocked) return

		const hit = memberUnderPointer(editor, info)
		if (!hit || hit.id === selected.id || hit.isLocked || !shapeIsInside(editor, hit, selected)) return
		if (editor.isShapeOrAncestorLocked(hit)) return

		// WHY: stock tldraw defers drilling through a selected ancestor until
		// pointer-up; a drag has already snapshotted the ancestor by then. Changing
		// only the selection here preserves every stock translation primitive while
		// making the visible child the first-drag target.
		editor.setSelectedShapes([hit.id])
	}

	editor.on('event', onEvent)
	return () => editor.off('event', onEvent)
}
