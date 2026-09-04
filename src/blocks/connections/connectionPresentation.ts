/**
 * How a delayed cable is drawn, and the one live presentation switch.
 *
 * A cable marked `delayed` is a loop's back edge: its value is read one
 * iteration late. Two marks say so — the line is dotted (weaker, in the
 * background, as Zach put it) and a z⁻¹ pill rides the cable, centred by
 * default and draggable along it, optionally naming the initial value with
 * the same `= value` grammar the port default chips use. Solid stays the plain
 * data cable. Async uses a mostly-continuous carrier punctuated by small packet
 * dashes. The alternate delayed treatment makes the value before z⁻¹ solid
 * and the next value after it dotted.
 *
 * Everything geometric here is editor-free so it unit-tests directly: arc
 * length along a polyline, the point at a fraction of it, the fraction nearest
 * a dragged point, and the dash arrays that split one path at the pill.
 */
import { atom, type VecLike } from 'tldraw'

import { clampPillPosition } from './connectionModel'

/* ------------------------------ live switch ------------------------------ */

export const CABLE_PRESENTATION_KEY = 'systemsketch.cable-presentation.v1'

export interface CablePresentation {
	/** Draw the value before z⁻¹ solid and the value after it dotted. */
	solidBeforePill: boolean
}

export const DEFAULT_CABLE_PRESENTATION: CablePresentation = { solidBeforePill: false }

export function readCablePresentation(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): CablePresentation {
	if (!storage) return { ...DEFAULT_CABLE_PRESENTATION }
	try {
		const parsed = JSON.parse(storage.getItem(CABLE_PRESENTATION_KEY) ?? '{}')
		return {
			solidBeforePill: typeof parsed?.solidBeforePill === 'boolean'
				? parsed.solidBeforePill
				// Keep an enabled V1 alternative enabled while correcting what it paints.
				: typeof parsed?.dashAfterPill === 'boolean'
					? parsed.dashAfterPill
					: DEFAULT_CABLE_PRESENTATION.solidBeforePill,
		}
	} catch {
		return { ...DEFAULT_CABLE_PRESENTATION }
	}
}

export function writeCablePresentation(
	next: CablePresentation,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(CABLE_PRESENTATION_KEY, JSON.stringify(next))
	} catch {
		// A presentation preference is a convenience; a full store must not block drawing.
	}
}

/** The live value every delayed cable reads; changing it repaints them all. */
export const cablePresentation = atom<CablePresentation>('cable presentation', readCablePresentation())

export function setSolidBeforePill(solidBeforePill: boolean): CablePresentation {
	const next = { ...cablePresentation.get(), solidBeforePill }
	cablePresentation.set(next)
	writeCablePresentation(next)
	return next
}

/* ------------------------------- geometry -------------------------------- */

export function polylineLength(points: readonly VecLike[]): number {
	let length = 0
	for (let index = 1; index < points.length; index += 1) {
		length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
	}
	return length
}

/** The point a fraction `t` of the arc length along the polyline. */
export function pointAtFraction(points: readonly VecLike[], t: number): { x: number; y: number } {
	if (points.length === 0) return { x: 0, y: 0 }
	if (points.length === 1) return { x: points[0].x, y: points[0].y }
	const total = polylineLength(points)
	let target = Math.min(1, Math.max(0, t)) * total
	for (let index = 1; index < points.length; index += 1) {
		const a = points[index - 1]
		const b = points[index]
		const segment = Math.hypot(b.x - a.x, b.y - a.y)
		if (target <= segment || index === points.length - 1) {
			const u = segment === 0 ? 0 : Math.min(1, target / segment)
			return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
		}
		target -= segment
	}
	const last = points[points.length - 1]
	return { x: last.x, y: last.y }
}

/**
 * The arc-length fraction of the polyline point nearest `p`: where a dragged
 * pill lands. Projects onto every segment and keeps the closest.
 */
export function fractionNearest(points: readonly VecLike[], p: VecLike): number {
	if (points.length < 2) return 0.5
	const total = polylineLength(points)
	if (total === 0) return 0.5
	let best = { distance: Number.POSITIVE_INFINITY, length: 0 }
	let walked = 0
	for (let index = 1; index < points.length; index += 1) {
		const a = points[index - 1]
		const b = points[index]
		const dx = b.x - a.x
		const dy = b.y - a.y
		const segment = Math.hypot(dx, dy)
		const u = segment === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segment * segment)))
		const qx = a.x + dx * u
		const qy = a.y + dy * u
		const distance = Math.hypot(p.x - qx, p.y - qy)
		if (distance < best.distance) best = { distance, length: walked + segment * u }
		walked += segment
	}
	return best.length / total
}

/* ------------------------------ dash arrays ------------------------------ */

/**
 * Async V1: equal rests between small packet marks. SVG alternates paint and
 * gaps, so this reads as a 56-unit carrier, 4-unit micro-gap, 10-unit packet,
 * then another 4-unit micro-gap before the cadence repeats. Butt caps keep the
 * tiny gaps legible instead of visually closing them with round end caps.
 */
export const ASYNC_CARRIER_PX = 56
export const ASYNC_PACKET_GAP_PX = 4
export const ASYNC_PACKET_PX = 10
export const ASYNC_PACKET_DASHARRAY = `${ASYNC_CARRIER_PX} ${ASYNC_PACKET_GAP_PX} ${ASYNC_PACKET_PX} ${ASYNC_PACKET_GAP_PX}`
export const ASYNC_CADENCE_PX = ASYNC_CARRIER_PX + ASYNC_PACKET_GAP_PX * 2 + ASYNC_PACKET_PX

/**
 * Normal and long cables start V1 at phase zero. Below one full cadence there
 * is not enough path to reach both micro-gaps, so phase just that short run to
 * centre one complete gap–packet–gap mark. The cadence itself never changes.
 */
export function asyncDashOffsetForLength(lengthPx: number): number {
	if (!Number.isFinite(lengthPx) || lengthPx >= ASYNC_CADENCE_PX) return 0
	const packetMark = ASYNC_PACKET_GAP_PX * 2 + ASYNC_PACKET_PX
	const markStart = Math.max(0, (Math.max(0, lengthPx) - packetMark) / 2)
	return ASYNC_CARRIER_PX - markStart
}

/** The dot: a zero-length dash with a round cap paints a disc of the stroke width. */
export const DELAY_DOT_PX = 0.1
export const DELAY_DOT_GAP_PX = 6

/** `pathLength` the split paths are normalised to, so dashes are set in path units. */
export const PATH_LENGTH_UNITS = 1000

export interface SplitDashArrays {
	/** Solid up to the pill, then a gap that outlasts the path. */
	before: string
	/** A gap up to the pill, then dotted to the end, then a gap that outlasts the path. */
	after: string
}

/**
 * Two dash arrays that, drawn on the same path with `pathLength=1000`, paint
 * solid before the pill and dots after it. Each pattern ends with a gap of a
 * full path so SVG's repeating never spills one style into the other's run.
 */
export function splitDashArrays(lengthPx: number, t: number): SplitDashArrays {
	const fraction = clampPillPosition(t)
	const unit = lengthPx > 0 ? PATH_LENGTH_UNITS / lengthPx : 1
	const dot = DELAY_DOT_PX * unit
	const dotGap = DELAY_DOT_GAP_PX * unit
	const pillAt = fraction * PATH_LENGTH_UNITS

	const before: number[] = [pillAt, PATH_LENGTH_UNITS]

	const after: number[] = [0, pillAt]
	let covered = pillAt
	while (covered < PATH_LENGTH_UNITS) {
		after.push(dot, dotGap)
		covered += dot + dotGap
	}
	after.push(0, PATH_LENGTH_UNITS)

	const round = (value: number) => Number(value.toFixed(3))
	return {
		before: before.map(round).join(' '),
		after: after.map(round).join(' '),
	}
}

/* --------------------------------- pill ---------------------------------- */

/**
 * A cable carries at most one pill, and it is always the same object: it spawns
 * part-way along the cable, it can be dragged along it, and it can be put back
 * to the middle. Only the text inside differs.
 *
 * `z⁻¹` says the value is read one iteration late. `mut` says it exists only
 * because a call wrote its argument in place. A cable can be both — a mutation
 * read next time round — and then the pill says both, in the order you would
 * read them: what it is, then when.
 */
export const DELAY_PILL_GLYPH = 'z⁻¹'
export const EFFECT_PILL_GLYPH = 'mut'
export const DELAY_PILL_HEIGHT = 18
/** Approximate advance of the pill's 12px monospace glyphs. */
const PILL_GLYPH_ADVANCE = 7.4
const PILL_PADDING = 16

export interface CablePillFacts {
	/** `data`, the intermittent `async` rail, or one-iteration-late `delayed`. */
	temporal: string
	/** The initial value a delayed cable names, `= value`; empty for none. */
	delayValue?: string
	/** Whether the cable leaves an effect port. */
	effect?: boolean
}

/**
 * What this cable's pill should say, or `null` when it carries none.
 *
 * One function so the renderer, the SVG export and the handle all agree on
 * whether a pill exists — the handle used to be gated on `delayed` alone, which
 * is how `mut` ended up visible but not draggable.
 */
export function cablePillLabel(facts: CablePillFacts): string | null {
	const parts: string[] = []
	if (facts.effect) parts.push(EFFECT_PILL_GLYPH)
	if (facts.temporal === 'delayed') {
		const value = (facts.delayValue ?? '').trim()
		parts.push(value ? `${DELAY_PILL_GLYPH} = ${value}` : DELAY_PILL_GLYPH)
	}
	return parts.length ? parts.join(' ') : null
}

/** `z⁻¹`, or `z⁻¹ = 1.0` when the cable names its initial value. */
export function delayPillLabel(delayValue: string): string {
	const value = delayValue.trim()
	return value ? `${DELAY_PILL_GLYPH} = ${value}` : DELAY_PILL_GLYPH
}

export function delayPillWidth(label: string): number {
	// The superscript pair reads as one advance; count code points, not UTF-16 units.
	const glyphs = Array.from(label).length
	return Math.round(PILL_PADDING + glyphs * PILL_GLYPH_ADVANCE)
}
