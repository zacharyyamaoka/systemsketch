/**
 * One hit-test contract for every container on the board.
 *
 * A Block in a container view, a Branch and a Loop all present the same
 * anatomy: a face, some solid chrome bands, and port dots. Each of them used
 * to build that geometry by hand, and each new one rediscovered the same bugs
 * — the Loop shipped with no footer rectangle at all, so the one band Zach
 * reached for could not be clicked.
 *
 * What the shape of this geometry has to satisfy, read out of tldraw 5.3.2
 * (`Editor.getShapeAtPoint`, the `isShapeFrameLike` branch):
 *
 *   1. A child with `isLabel` is solid chrome: the pointer landing in its
 *      BOUNDS returns the container. That is the only way a header, a footer
 *      or a port row is grabbable, because...
 *   2. ...`Group2d.hitTestPoint` excludes labels by default, so the body
 *      rectangle alone decides the second question — whether the pointer is
 *      "inside the frame". Inside a frame, `getShapeAtPoint` STOPS and answers
 *      nothing, which is why nothing painted under a container can be clicked.
 *   3. `getDraggingOverShape` asks `isPointInShape(…, { hitInside: true })`,
 *      which reduces to that same body test. A container whose body stops
 *      answering is a container that can no longer adopt a dropped Block.
 *
 * (2) and (3) are the same predicate, so the swallow cannot be tuned away
 * here: a container that accepts drops necessarily hides whatever is beneath
 * it. Keeping a cable clickable inside a region is therefore a tree problem,
 * not a geometry one — see `cableCompositingParent` in `connections/
 * connectionScope.ts`.
 */
import { Circle2d, Group2d, Rectangle2d, type Geometry2d } from 'tldraw'

/** A chrome band, in shape space. */
export interface ContainerHitRect {
	x?: number
	y?: number
	w: number
	h: number
}

export interface ContainerHitDot {
	/** Centre, not corner — every caller lays ports out by their centre. */
	x: number
	y: number
	radius: number
}

export interface ContainerHitSpec {
	/**
	 * The face. Filled for a solid card, unfilled for a container the board
	 * shows through — but closed either way, or the container stops taking
	 * drops (3).
	 */
	body: Geometry2d
	/** Solid bands: header, footer, port label rows. Empty and null entries drop out. */
	chrome?: readonly (ContainerHitRect | null | undefined)[]
	/** Port dots, which stay grabbable a little outside the face. */
	dots?: readonly ContainerHitDot[]
}

function isPaintable(rect: ContainerHitRect | null | undefined): rect is ContainerHitRect {
	return rect !== null && rect !== undefined && rect.w > 0 && rect.h > 0
}

/**
 * Chrome and dots are kept out of the shape's bounds. The body already spans
 * the container, so this only matters while a drag-create holds a 1x1
 * placeholder: a laid-out header is full width, and letting it into the bounds
 * would snap the new region to its own layout on the first pointer move.
 */
export function containerHitGeometry({ body, chrome = [], dots = [] }: ContainerHitSpec): Group2d {
	return new Group2d({
		children: [
			body,
			...chrome.filter(isPaintable).map((rect) => new Rectangle2d({
				x: rect.x ?? 0,
				y: rect.y ?? 0,
				width: rect.w,
				height: rect.h,
				isFilled: true,
				isLabel: true,
				excludeFromShapeBounds: true,
			})),
			...dots.map((dot) => new Circle2d({
				x: dot.x - dot.radius,
				y: dot.y - dot.radius,
				radius: dot.radius,
				isFilled: true,
				isLabel: true,
				excludeFromShapeBounds: true,
			})),
		],
	})
}
