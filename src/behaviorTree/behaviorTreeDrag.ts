/**
 * Dragging a behavior from the panel onto a region, as pure geometry.
 *
 * WHY a custom MIME type rather than reusing the Shapes library's placement:
 * `insertShapeLibraryItem` creates at the viewport centre on CLICK, and
 * `activateShapeLibraryTool` arms a tool — neither is drag-and-drop, so there
 * was nothing to reuse. A behavior is different in kind anyway: it does not
 * land at a point, it lands in a PARENT AT AN INDEX, so the drop has to resolve
 * to one of the region's own insertion targets or be refused. Everything below
 * is that resolution, with no React, tldraw or DOM in it, so both the panel and
 * the region's canvas can share one answer and a test can drive it directly.
 */
import type { BtOrientation, BtPoint, BtRect, BtSceneInsert } from './behaviorTreeModel'
import type { BtInsertTemplate } from './btcppXml'

export const BEHAVIOR_DRAG_MIME = 'application/x-systemsketch-behavior'

/**
 * How near a pointer must come to an insertion target for the drop to be
 * taken, in SCREEN pixels — so the snap feels the same at every zoom, the way
 * a tldraw handle does. Roughly two card gaps: close enough that the intended
 * target is unambiguous, far enough that the 14px "+" is not a dart board.
 */
export const BEHAVIOR_DROP_SNAP_RADIUS = 96

export interface BehaviorDragPayload {
	/** The catalog row's id, so a completed drop can be remembered in recents. */
	itemId: string
	label: string
	template: BtInsertTemplate
}

/** The slice of a projection the drop resolver needs; `BtProjectionResult` satisfies it. */
export interface BehaviorDropProjection {
	scene: { inserts: readonly BtSceneInsert[] }
	/** Where scene (0,0) sits in region-local coordinates. */
	origin: BtPoint
	/** Region-local rectangle of each drawn node, by path. */
	nodeRects: ReadonlyMap<string, BtRect>
}

export interface BehaviorDropCandidate {
	id: string
	parentPath: string | null
	index: number
	kind: BtSceneInsert['kind']
	/** Region-local, for painting inside the region's own layer. */
	region: BtPoint
	/** Screen space, for measuring against the pointer. */
	screen: BtPoint
}

export function encodeBehaviorDrag(payload: BehaviorDragPayload): string {
	return JSON.stringify(payload)
}

/**
 * Tolerant on purpose: a drag can arrive from another window, or from a
 * `dragover` where the browser hides the data entirely. Anything that is not
 * a well-formed payload is simply not a behavior drop.
 */
export function decodeBehaviorDrag(text: string | null | undefined): BehaviorDragPayload | null {
	if (!text) return null
	try {
		const value = JSON.parse(text) as Partial<BehaviorDragPayload>
		if (typeof value?.itemId !== 'string' || typeof value?.label !== 'string') return null
		const template = value.template
		if (!template || typeof template.id !== 'string' || typeof template.kind !== 'string') return null
		return { itemId: value.itemId, label: value.label, template: template as BtInsertTemplate }
	} catch {
		return null
	}
}

/** Every "+" the region is showing, in both region and screen coordinates. */
export function behaviorDropCandidates(
	projection: BehaviorDropProjection,
	toScreen: (regionPoint: BtPoint) => BtPoint,
): BehaviorDropCandidate[] {
	return projection.scene.inserts.map((insert) => {
		const region = { x: insert.at.x + projection.origin.x, y: insert.at.y + projection.origin.y }
		return {
			id: insert.id,
			parentPath: insert.parentPath,
			index: insert.index,
			kind: insert.kind,
			region,
			screen: toScreen(region),
		}
	})
}

function distance(a: BtPoint, b: BtPoint): number {
	return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * The target a drop at `pointer` means, or null when the pointer is nowhere
 * near one. Null is a real answer, not a failure to compute: the caller
 * refuses the drop and says why, rather than guessing a parent.
 */
export function nearestBehaviorDropTarget(
	candidates: readonly BehaviorDropCandidate[],
	pointer: BtPoint,
	radius = BEHAVIOR_DROP_SNAP_RADIUS,
): { candidate: BehaviorDropCandidate; distance: number } | null {
	let best: { candidate: BehaviorDropCandidate; distance: number } | null = null
	for (const candidate of candidates) {
		const gap = distance(candidate.screen, pointer)
		if (gap > radius) continue
		if (!best || gap < best.distance) best = { candidate, distance: gap }
	}
	return best
}

/**
 * Where the parent's card lets go of the new child: the edge the children
 * leave from, which is the bottom in a top-to-bottom tree and the right side
 * in a left-to-right one. A root drop has no parent, so the segment collapses
 * onto the target itself and the guide reads as a dot rather than a line.
 */
export function behaviorParentAnchor(
	projection: BehaviorDropProjection,
	parentPath: string | null,
	orientation: BtOrientation,
): BtPoint | null {
	if (parentPath === null) return null
	const rect = projection.nodeRects.get(parentPath)
	if (!rect) return null
	return orientation === 'down'
		? { x: rect.x + rect.w / 2, y: rect.y + rect.h }
		: { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
}

/** The suggestion line drawn while a behavior hovers a target, region-local. */
export function behaviorDropGuide(
	projection: BehaviorDropProjection,
	candidate: BehaviorDropCandidate,
	orientation: BtOrientation,
): { from: BtPoint; to: BtPoint } {
	const anchor = behaviorParentAnchor(projection, candidate.parentPath, orientation)
	return { from: anchor ?? candidate.region, to: candidate.region }
}

/** What the region says when a behavior is dropped away from every target. */
export function behaviorDropRefusal(label: string): string {
	return `Nothing to attach ${label} to here — drop it on a “+”.`
}
