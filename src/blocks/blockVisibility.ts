import { isShapeId, type Editor, type TLShape } from 'tldraw'

import { isBlockShape } from './blockModel'

/**
 * A Block is an opaque leaf unless its active view is Expanded.
 *
 * tldraw's visibility callback is recursive: hiding one direct child also
 * hides that child's descendants. Internal Blocks, stock shapes and semantic
 * connections therefore follow the same rule without being deleted,
 * reparented or copied into a second visibility model.
 */
export function getBlockShapeVisibility(
	shape: TLShape,
	editor: Editor,
): 'hidden' | 'inherit' {
	if (!isShapeId(shape.parentId)) return 'inherit'
	const parent = editor.getShape(shape.parentId)
	if (isBlockShape(parent) && parent.props.view !== 'expanded') return 'hidden'
	return 'inherit'
}
