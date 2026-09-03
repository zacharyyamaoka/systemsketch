import { BaseFrameLikeShapeUtil, type TLBaseBoxShape, type TLDragShapesInInfo, type TLShape } from 'tldraw'

/**
 * A container that draws a frame without ever changing its mind about it —
 * unlike an Expanded Block, whose `isFrameLike` / `isExportBoundsContainer`
 * answers depend on its collapsed state and whose `onDragShapesIn` proxies
 * through arm-or-Block redirection (`getContainerTarget`), a Branch and a
 * Loop are always frame-like, always take the export bounds they draw, and
 * only ever refuse a drag that is locked or would adopt the region into
 * itself. This was two byte-identical override blocks living in two files
 * before it was one.
 *
 * `isFrameLike` is not re-declared here: `BaseFrameLikeShapeUtil` already
 * answers `true` by default, so a subclass repeating it was a no-op.
 */
export abstract class RegionShapeUtil<Shape extends TLBaseBoxShape> extends BaseFrameLikeShapeUtil<Shape> {
	override isExportBoundsContainer(_shape: Shape): boolean {
		return true
	}

	override onDragShapesIn(shape: Shape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
		if (shape.isLocked) return
		// Never adopt a drag that contains the region itself.
		if (draggingShapes.some((dragging) => dragging.id === shape.id)) return
		super.onDragShapesIn(shape, draggingShapes, info)
	}
}
