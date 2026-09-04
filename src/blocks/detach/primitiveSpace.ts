/**
 * Coordinate and containment helpers shared by primitive lowerers.
 *
 * A detached composition must not remain below a frame-like ancestor: stock
 * Frames clip descendants, which makes otherwise valid stock geo / line
 * records disappear at the region wall. These helpers lift a replacement to
 * the nearest ordinary parent while retaining its page-space pose.
 */
import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'

/** Convert a page point to the coordinate space used by children of parentId. */
export function pointInPrimitiveParentSpace(
	editor: Editor,
	parentId: TLShape['parentId'],
	point: { x: number; y: number },
): { x: number; y: number } {
	const parent = editor.getShape(parentId)
	return parent ? editor.getPointInShapeSpace(parent, point) : point
}

/**
 * Return the closest normal parent outside every frame-like ancestor.
 *
 * Groups are retained unless they themselves live under a clipping container:
 * a detached object can still be a useful member of an ordinary stock group.
 */
export function unframedPrimitiveParentId(
	editor: Editor,
	parentId: TLShape['parentId'],
): TLShape['parentId'] {
	let result = parentId
	let parent = editor.getShape(parentId)
	while (parent) {
		if (editor.isShapeFrameLike(parent)) result = parent.parentId
		parent = editor.getShape(parent.parentId)
	}
	return result
}

/**
 * Express a shape's page-space origin and x-axis as a pose below parentId.
 *
 * A semantic Branch / Loop may itself live in a rotated Frame. Copying only
 * its local rotation after lifting it would visibly straighten the region, so
 * derive the replacement angle from its transformed local x-axis instead.
 */
export function shapePoseInPrimitiveParent(
	editor: Editor,
	shape: TLShape,
	parentId: TLShape['parentId'],
): { x: number; y: number; rotation: number } {
	const transform = editor.getShapePageTransform(shape)
	const origin = pointInPrimitiveParentSpace(editor, parentId, transform.applyToPoint({ x: 0, y: 0 }))
	const xAxis = pointInPrimitiveParentSpace(editor, parentId, transform.applyToPoint({ x: 1, y: 0 }))
	return {
		x: origin.x,
		y: origin.y,
		rotation: Math.atan2(xAxis.y - origin.y, xAxis.x - origin.x),
	}
}

/**
 * Lift a container-local stock primitive into the ordinary parent while
 * retaining its exact page pose. `groupShapes` then creates the stock Group
 * around this top-level material, avoiding tldraw's cleanup of empty groups.
 */
export function liftContainerPartial<T extends TLShapePartial>(
	partial: T,
	parentId: TLShape['parentId'],
	pose: { x: number; y: number; rotation: number },
): T {
	const localX = partial.x ?? 0
	const localY = partial.y ?? 0
	const cos = Math.cos(pose.rotation)
	const sin = Math.sin(pose.rotation)
	return {
		...partial,
		parentId,
		x: pose.x + localX * cos - localY * sin,
		y: pose.y + localX * sin + localY * cos,
		rotation: (partial.rotation ?? 0) + pose.rotation,
	}
}

export function directChildren(editor: Editor, parentId: TLShapeId): TLShape[] {
	return editor.getSortedChildIdsForParent(parentId)
		.map((childId) => editor.getShape(childId))
		.filter((shape): shape is TLShape => shape !== undefined)
}
