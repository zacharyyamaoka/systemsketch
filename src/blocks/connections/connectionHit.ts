/**
 * How big the *invisible* target around a cable is — and around a port when you
 * drop one.
 *
 * The numbers are not taste. tldraw resolves a click on an OPEN geometry (our
 * cables are `Edge2d` / `Polyline2d` / `CubicBezier2d`) with exactly one
 * constant:
 *
 *   Editor.getShapeAtPoint → `if (distance < this.getHitTestMargin()) return shape`
 *   getHitTestMargin()     → `options.hitTestMargin (3) / zoom`
 *
 * So the stock corridor is ±3 SCREEN px — a 6 px band under a 2 px stroke, at
 * any zoom. Note that the `margin` a caller passes to `getShapeAtPoint` is
 * ignored on that branch, which is why widening this cannot be done from a call
 * site; it has to be done by padding the geometry.
 *
 * React Flow answers the same question by drawing a second, invisible copy of
 * the edge path: `BaseEdge`'s `interactionWidth = 20`, stroke-opacity 0, under
 * `.react-flow__edge { pointer-events: visibleStroke }`. That is ±10 — but in
 * CANVAS units, inside the viewport transform, so it scales with zoom.
 *
 * Those two facts are the whole design space, and they are the three profiles
 * below. The default is `systemsketch`, whose every number is derived from the
 * port dot's own CSS rather than picked.
 *
 * Pure and editor-free apart from the zoom number, so it unit-tests directly.
 */
import { CubicBezier2d, Edge2d, Geometry2d, Polyline2d, type VecLike } from 'tldraw'

export type HitProfileId = 'kit' | 'flow' | 'systemsketch'

/**
 * The port dot's outer radius, in page units, derived from the CSS that draws
 * it: `width: 12px` with `box-shadow: 0 0 0 2px panel, 0 0 0 3px color`.
 *
 * A box-shadow spread is measured from the border box and is NOT stacked on the
 * shadow before it, so the outer edge is 6 + 3 = 9 — not 6 + 2 + 3 = 11.
 */
export const PORT_DOT_PX = 12
export const PORT_RING_PX = 3
export const PORT_OUTER_RADIUS = PORT_DOT_PX / 2 + PORT_RING_PX
export const PORT_OUTER_DIAMETER = PORT_OUTER_RADIUS * 2

/** A target half-width, in one unit or the other. Exactly one is set. */
export interface HitTarget {
	/** tldraw page units — constant on the board, so it scales on screen. */
	pageUnits?: number
	/** Screen pixels — constant on screen, so it shrinks on the board as you zoom in. */
	screenPx?: number
}

export interface HitProfile {
	id: HitProfileId
	label: string
	/** Half-width of a cable's clickable corridor. */
	cable: HitTarget
	/** How far a dropped cable end reaches for a port. */
	port: HitTarget
	/**
	 * How close the pointer must be to a port that already carries a cable for
	 * that cable to win the press — so pressing a wired port re-routes the wire
	 * that is there instead of starting another one.
	 */
	reconnect: HitTarget
	/** Where the number comes from — so the profile cites itself. */
	source: string
}

export const HIT_PROFILES: Record<HitProfileId, HitProfile> = {
	kit: {
		id: 'kit',
		label: 'Kit (tldraw)',
		cable: { screenPx: 3 },
		port: { pageUnits: 8 },
		reconnect: { screenPx: 0 },
		source: 'tldraw defaultTldrawOptions.hitTestMargin = 3; the kit getPortAtPoint margin = 8',
	},
	flow: {
		id: 'flow',
		label: 'React Flow',
		cable: { pageUnits: 10 },
		port: { pageUnits: 20 },
		reconnect: { pageUnits: 10 },
		source: 'React Flow BaseEdge interactionWidth = 20 (±10), connectionRadius = 20, reconnectRadius = 10',
	},
	systemsketch: {
		id: 'systemsketch',
		label: 'SystemSketch',
		cable: { pageUnits: PORT_OUTER_RADIUS },
		port: { pageUnits: PORT_OUTER_DIAMETER },
		reconnect: { pageUnits: 10 },
		source: "derived from the port: corridor = its outer radius (9u), snap = its diameter (18u); reconnect is React Flow's 10u",
	},
}

export const HIT_PROFILE_IDS: HitProfileId[] = ['kit', 'flow', 'systemsketch']

/**
 * A screen-px target grows without limit as you zoom out. This caps it, so the
 * corridor cannot swallow the board at zoom 0.05 — and, more practically, so one
 * constant can also serve as the bounds pad below.
 */
export const MAX_HIT_TARGET_PAGE = 24

/**
 * How much a cable's geometry bounds are inflated, in page units.
 *
 * A CONSTANT rather than the live target on purpose: `Geometry2d` caches
 * `bounds` on first read and the editor caches page bounds in a computed keyed
 * on the shape record — neither re-runs when the profile or the zoom changes. A
 * constant that is always ≥ the largest live target can never go stale, and it
 * only feeds *broad* phases, so the exact hit decision still comes from the live
 * `distanceToPoint` below.
 */
export const HIT_BOUNDS_PAD = MAX_HIT_TARGET_PAGE

/**
 * The active profile. A plain variable, not an atom: the geometry below reads it
 * inside `distanceToPoint`, which tldraw may call from within a computed — a
 * signal read there would create a dependency we do not want.
 */
let activeProfileId: HitProfileId = 'systemsketch'

export function getHitProfileId(): HitProfileId {
	return activeProfileId
}

export function setHitProfileId(id: string | null | undefined): HitProfileId {
	activeProfileId = HIT_PROFILE_IDS.includes(id as HitProfileId) ? (id as HitProfileId) : 'systemsketch'
	return activeProfileId
}

/** Resolve a target to page units at a given zoom, capped. */
export function targetPageUnits(target: HitTarget, zoom: number): number {
	const safeZoom = zoom > 0 ? zoom : 1
	const raw = target.pageUnits ?? (target.screenPx ?? 0) / safeZoom
	return Math.min(raw, MAX_HIT_TARGET_PAGE)
}

export function cableHitTargetPageUnits(zoom: number, id = activeProfileId): number {
	return targetPageUnits(HIT_PROFILES[id].cable, zoom)
}

export function portSnapPageUnits(zoom: number, id = activeProfileId): number {
	return targetPageUnits(HIT_PROFILES[id].port, zoom)
}

export function reconnectPageUnits(zoom: number, id = activeProfileId): number {
	return targetPageUnits(HIT_PROFILES[id].reconnect, zoom)
}

/**
 * The extra distance to hide from tldraw, so the corridor ends up exactly the
 * profile's target and not the target *plus* the engine's own margin.
 *
 * `getShapeAtPoint` hits an open geometry when `distanceToPoint(p) < engine`,
 * where `engine = hitTestMargin / zoom`. Returning `trueDistance - pad` makes
 * that `trueDistance < engine + pad`, so `pad = target - engine` lands the
 * boundary on the target. At the kit profile the target IS the engine margin, so
 * the pad is 0 and the behaviour is bit-for-bit stock.
 */
export function cableHitPadPageUnits(zoom: number, engineMarginPageUnits: number): number {
	return Math.max(0, cableHitTargetPageUnits(zoom) - engineMarginPageUnits)
}

/**
 * Wrap a geometry class so its hit test is padded by a live, caller-supplied
 * amount.
 *
 * Only three methods change, and every other method — `getVertices`,
 * `nearestPoint`, `overlapsPolygon`, the intersections — is inherited untouched.
 * That is deliberate: the marquee, the eraser, the indicator and the elbow
 * router all keep reading the true curve. Only "is the pointer close enough"
 * moves.
 */
export type HitPaddedGeometry = Geometry2d & { hitPad: () => number }

function hitPadded<C>(Base: new (config: C) => Geometry2d): new (config: C) => HitPaddedGeometry {
	// `any` because a mixin over an abstract-rooted class cannot keep its
	// concrete identity in TypeScript; the cast on the way out restores it.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const AnyBase = Base as any
	return class extends AnyBase {
		/** Page units to add to the corridor. Assigned after construction. */
		hitPad: () => number = () => 0

		getBounds() {
			return super.getBounds().expandBy(HIT_BOUNDS_PAD)
		}

		distanceToPoint(point: VecLike, hitInside?: boolean, filters?: unknown) {
			return super.distanceToPoint(point, hitInside, filters) - this.hitPad()
		}

		hitTestPoint(point: VecLike, margin = 0, hitInside = false, filters?: unknown) {
			return super.hitTestPoint(point, margin + this.hitPad(), hitInside, filters)
		}
	} as unknown as new (config: C) => HitPaddedGeometry
}

export const HitPaddedEdge2d = hitPadded(Edge2d)
export const HitPaddedPolyline2d = hitPadded(Polyline2d)
export const HitPaddedCubicBezier2d = hitPadded(CubicBezier2d)

/** Give a freshly built cable geometry its live pad and hand it back. */
export function withCableHitPad<T extends HitPaddedGeometry>(geometry: T, pad: () => number): T {
	geometry.hitPad = pad
	return geometry
}

/**
 * How far from a cable the pointer counts as "near", for Figma's rule that a
 * selected edge shows its control points only while you are close to it.
 *
 * A multiple of the click corridor rather than its own number: the points must
 * appear before you are precisely on the line, or you would have to hit the
 * 2px stroke to discover that the cable is editable at all.
 */
export const CONTROL_POINT_PROXIMITY_MULTIPLE = 4

export function controlPointProximityPageUnits(zoom: number, id = activeProfileId): number {
	return cableHitTargetPageUnits(zoom, id) * CONTROL_POINT_PROXIMITY_MULTIPLE
}
