import type { Editor, TLFrameShape, TLShapeId } from 'tldraw'

export function getOnlySelectedFrame(editor: Editor): TLFrameShape | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1) return null
	const shape = selected[0]
	return shape.type === 'frame' && !shape.isLocked ? (shape as TLFrameShape) : null
}

/**
 * Remove one stock Frame without deleting the shapes it contains.
 *
 * tldraw preserves page-space geometry while reparenting. Moving the direct
 * children to the Frame's parent therefore lifts every nested subtree intact;
 * deleting the now-empty Frame cannot cascade into any of those survivors.
 */
export function removeFrameKeepContents(editor: Editor, frameId: TLShapeId): boolean {
	const shape = editor.getShape(frameId)
	if (!shape || shape.type !== 'frame' || shape.isLocked) return false

	const childIds = [...editor.getSortedChildIdsForParent(shape.id)]
	editor.markHistoryStoppingPoint('remove frame')
	editor.run(() => {
		if (childIds.length > 0) editor.reparentShapes(childIds, shape.parentId)
		editor.deleteShape(shape.id)
		if (childIds.length > 0) editor.setSelectedShapes(childIds)
	})
	return true
}
