/**
 * The drag-model debug overlay: the invisible Kanban, made visible.
 *
 * Zach's verification ask (2026-09-06): the auto-layout drag resolves
 * against per-parent sortable containers ("columns"), tiled into
 * adjudication zones, every member padded to a uniform virtual slot, with a
 * hysteresis deadband deciding capture and release — and he wants to see
 * that model live on the canvas, during a drag above all, instead of
 * trusting behavior. Four independently-toggled layers paint, region-local,
 * inside the region's own SVG (`treeDragModelLayers`, driven from the Drag
 * Model Tuner panel; the Dev checkbox is the master):
 *
 *   - CONTAINERS — zone (the full column a container answers for once its
 *     depth strip is tiled) and bound (the members' real union, corner
 *     brackets): parallel siblings' lists read as columns side by side, a
 *     nested list as a column in its own row below;
 *   - SLOTS — each member's uniform virtual rect, dotted: where a card's
 *     drag slot is padded past its painted box (an Expanded sibling widens
 *     the whole list's slots), the padding is directly visible;
 *   - THRESHOLDS — the hysteresis boundaries as cross-axis lines: capture
 *     lines (where the dragged LEADING edge takes a slot) for every member,
 *     and, mid-drag in the active container, the release line (where the
 *     dragged TRAILING edge gives the captured slot back), labeled with its
 *     real px cost — the direct answer to "why does top-down feel less
 *     sensitive than left-right";
 *   - CLIMB — mid-drag, the exit ring around the active container: leave it
 *     by more than this and the ancestor climb re-parents the drag upward.
 *
 * WHY the drawing looks the way it does (Zach, 2026-09-06, on the real
 * PickAndPlace board with all four layers on and no drag running): "not clear
 * exactly what all the spacing are on the columns, there's like all this
 * overlapping, it's very confusing." Four rules came out of that, and each one
 * is load-bearing rather than decorative:
 *
 *   1. ONE HUE PER LAYER, and no two layers share a line signature. The climb
 *      ring used to be amber, 17 degrees of hue from the slot orange; it is
 *      magenta now (`tokens.css`), and the dash patterns are tokens both this
 *      overlay and the Tuner panel's key read, so the key cannot drift.
 *   2. TILED ZONES MUST NOT LOOK LIKE ONE BAND. Zones abut by construction, so
 *      a single shared tint made a strip's columns read as one continuous
 *      lavender band — the "overlapping" he saw was abutment. They alternate
 *      tint now, their shared edges are drawn as explicit seams, and the
 *      strip's outer overhang edges are dashed to say they are reach, not a
 *      handover.
 *   3. THE NUMBERS ARE PRINTED, not implied by two box edges. Every container
 *      carries a plate with its real `gap`, `slotExtent` and column extent,
 *      and a dimension line is drawn inside one actual inter-member gap with
 *      that gap's own px on it.
 *   4. REST IS NOT DRAG. At rest nothing is displaced and nothing is captured,
 *      so capture lines and unpadded slots drop to a structural weight and the
 *      two genuinely drag-only layers (release, climb) declare themselves in
 *      the Tuner's key instead of leaving a checked box painting nothing.
 *
 * Read-only by construction: mid-drag it draws the live session's own
 * `DragListContext` — the exact frozen ghost geometry `resolveDragListDrop`
 * runs against every frame, tuning and hysteresis state included — and at
 * rest it runs the same `deriveDragListGeometry` derivation over the
 * resting layout with the live tuner values. There is no third computation
 * anywhere that could drift from what the drag actually does.
 */
import { useMemo } from 'react'
import { useEditor, useValue } from 'tldraw'

import { type BehaviorTreeShape, type BtRect } from './behaviorTreeModel'
import { projectBehaviorTree, rectToRegion } from './behaviorTreeProjection'
import {
	bandsByDepth,
	deriveDragListGeometry,
	type DragListGeometry,
	type DragListNodeInput,
	type DragListTuning,
} from './dragListReorder'
import { centerOf, type SortableAxis } from './sortableGeometry'
import { activeBtDndDragGeometry } from './treeDndDrag'
import { btDndDragState } from './treeDndDragState'
import { treeDragModelFocus, treeDragModelLayers, treeDragModelOverlay } from './treeDragModelOverlayState'
import { btDragTuning } from './treeDragTuningState'

type BtProjection = ReturnType<typeof projectBehaviorTree>

interface OverlayZone {
	id: string
	rect: BtRect
	active: boolean
	/** Alternating tint index within the zone's own strip. */
	parity: 0 | 1
}
interface OverlayEdge {
	key: string
	/** `seam` = two zones hand over here; `overhang` = the strip's outer reach. */
	kind: 'seam' | 'overhang'
	cross: number
	flowStart: number
	flowEnd: number
}
interface OverlayBound {
	id: string
	rect: BtRect
	active: boolean
}
interface OverlaySlot {
	id: string
	rect: BtRect
	padded: boolean
	/** How far the virtual slot is padded past the painted card, px. */
	padPx: number
}
interface OverlayLine {
	key: string
	kind: 'capture' | 'release'
	/** Cross-axis position of the boundary, region space. */
	cross: number
	/** Flow-axis span the line is drawn over, region space. */
	flowStart: number
	flowEnd: number
	label?: string
	active: boolean
}
/**
 * One container's numbers, on a plate with room to be read.
 *
 * WHY: the old corner text was the container's path at 9px, jammed inside the
 * band edge — it answered "which list is this" illegibly and answered Zach's
 * actual question ("what are the spacings on the columns") not at all. The
 * three numbers that DRIVE the feel are already derived: `gap` feeds the
 * release displacement, `slotExtent` feeds the climb reach and the zone
 * overhang, and the zone's own extent is the column the pointer adjudicates
 * in. Printing them beats making him measure two box edges by eye.
 */
interface OverlayChip {
	id: string
	path: string
	/**
	 * One number per line, stacked. WHY not one wide line: the plate has to fit
	 * the whitespace OUTSIDE the depth band, and in a left-to-right tree that
	 * whitespace is the ~130px gutter between columns — a single-line plate ran
	 * 210px and was clipped by the previous column's cards, reproducing exactly
	 * the illegibility this pass exists to remove. A narrow stack fits both
	 * axes, so there is one layout rather than an untested per-orientation one.
	 */
	metrics: string[]
	/**
	 * Region-space anchor on the band's outer flow edge. The plate itself is
	 * drawn in SCREEN px inside a counter-scaled group, so `w` is a screen
	 * width and the anchor is the only thing that lives in region space.
	 */
	x: number
	y: number
	w: number
	/**
	 * Place the plate on the far side of the band. The shallowest strip always
	 * has the projection's Start pill immediately outside it, so that one row's
	 * chip would otherwise land on top of it.
	 */
	flipped: boolean
	active: boolean
}
/** A dimension line drawn IN one real inter-member gap, labeled with its px. */
interface OverlayGap {
	key: string
	px: number
	/** Sort-axis span of the whitespace between two adjacent members. */
	from: number
	to: number
	/** Flow-axis position to draw the dimension at. */
	flow: number
	/**
	 * The gap as a REGION, hatched rather than filled.
	 *
	 * WHY hatch: Chrome DevTools never solid-fills a grid gap — it lays 1px
	 * bars over it — and the reason generalizes. A solid fill reads as an
	 * object that is there; a hatch reads as derived space between things that
	 * are, which is exactly what a gap is. It also leaves the content under it
	 * legible, which a fill at any useful alpha does not.
	 */
	rect: BtRect
}

/** Just the shape of a container member this file reads. */
interface SortableItemLike {
	rect: BtRect
}

/** Rough advance width of the chrome font at a given size — plate sizing only. */
function textWidth(text: string, size: number): number {
	return text.length * size * 0.58
}

// Sized against the complaint, not against the ink budget: the old corner text
// was 9px and unreadable, and there is whitespace between depth rows to spend.
const CHIP_PATH_SIZE = 13
const CHIP_METRIC_SIZE = 12
const CHIP_LEAD = 14
const THRESHOLD_OVERSHOOT = 22

/**
 * What each knob actually controls, as one table.
 *
 * WHY a table and not a branch per knob: Chrome DevTools solves the same
 * problem — "hovering `padding` should highlight padding and nothing else" —
 * with a single config builder over a `mode` string, ~13 modes and no separate
 * renderers (`front_end/core/sdk/OverlayModel.ts`). Copying that shape means a
 * new knob is a row here, not a new code path, and the focus view can never
 * drift from what the knob does.
 *
 * `lit` names the marks that stay at full strength; everything else drops to a
 * ghost. `preview` marks the two modes whose geometry only exists once a card
 * is moving — the overlay synthesizes a stand-in drag for those (see
 * `focusPreviewMember`), because a knob you cannot see the effect of is the
 * exact problem this view exists to fix.
 */
export type FocusMark = 'zone' | 'overhang' | 'seam' | 'bound' | 'slot' | 'gap' | 'capture' | 'release' | 'climb' | 'claim'
const FOCUS_MARKS: Record<string, readonly FocusMark[]> = {
	claimDistancePx: ['claim'],
	capturePaddingPx: ['capture', 'slot'],
	releaseFactor: ['release', 'gap', 'slot'],
	releasePaddingPx: ['release', 'gap'],
	climbSlots: ['climb', 'bound'],
	zoneOverhangSlots: ['overhang', 'zone', 'seam'],
}
/** Modes whose geometry needs a dragged rect that does not exist at rest. */
const FOCUS_NEEDS_PREVIEW = new Set(['releaseFactor', 'releasePaddingPx', 'climbSlots'])
export function focusMarks(focus: string | null): ReadonlySet<FocusMark> | null {
	if (!focus) return null
	const marks = FOCUS_MARKS[focus]
	return marks ? new Set(marks) : null
}
/** Corner-bracket leg, capped so a small container still reads as brackets. */
function bracketLeg(rect: BtRect): number {
	return Math.max(4, Math.min(14, rect.w / 3, rect.h / 3))
}
function bracketPath(rect: BtRect): string {
	const leg = bracketLeg(rect)
	const { x, y, w, h } = rect
	return [
		`M${x},${y + leg}L${x},${y}L${x + leg},${y}`,
		`M${x + w - leg},${y}L${x + w},${y}L${x + w},${y + leg}`,
		`M${x},${y + h - leg}L${x},${y + h}L${x + leg},${y + h}`,
		`M${x + w - leg},${y + h}L${x + w},${y + h}L${x + w},${y + h - leg}`,
	].join('')
}

function zoneRect(down: boolean, zone: { start: number; end: number }, band: { flowStart: number; flowEnd: number }): BtRect {
	return down
		? { x: zone.start, y: band.flowStart, w: zone.end - zone.start, h: band.flowEnd - band.flowStart }
		: { x: band.flowStart, y: zone.start, w: band.flowEnd - band.flowStart, h: zone.end - zone.start }
}

function shifted(rect: BtRect, origin: { x: number; y: number }): BtRect {
	return { x: rect.x + origin.x, y: rect.y + origin.y, w: rect.w, h: rect.h }
}

interface PaintInput {
	geometry: DragListGeometry
	down: boolean
	origin: { x: number; y: number }
	tuning: DragListTuning
	activeContainerId: string | null
	/** The deadband's currently-held slot in the active container, mid-drag. */
	activeSlot: number | null
	/** The dragged shape's live rect in REGION space, mid-drag only. */
	draggedRect: BtRect | null
	/** The knob under the pointer, for the marks only a focus mode draws. */
	focus: string | null
	/**
	 * Claim distance, passed separately because it is NOT part of
	 * `DragListTuning`: that type is the resolver's, and claim distance is a
	 * pointer-sensor threshold the resolver never sees. Widening the resolver's
	 * tuning to carry it would put a gesture setting inside the collision model.
	 */
	claimDistancePx: number
}

/**
 * Region-local paint data from one geometry, whatever produced it.
 *
 * Destructure every field you use. `focus` was added to `PaintInput` without
 * being added here once, and the identifier silently resolved to the DOM's
 * global `focus()` instead — no type error, no runtime error, the mode just
 * never fired. The browser journey is what caught it.
 */
function paintFrom({ geometry, down, origin, tuning, activeContainerId, activeSlot, draggedRect, focus, claimDistancePx }: PaintInput) {
	const crossAxis: SortableAxis = down ? 'x' : 'y'
	const flowAxis: SortableAxis = down ? 'y' : 'x'
	const originCross = down ? origin.x : origin.y
	const originFlow = down ? origin.y : origin.x
	const zones: OverlayZone[] = []
	const edges: OverlayEdge[] = []
	const bounds: OverlayBound[] = []
	const slots: OverlaySlot[] = []
	const lines: OverlayLine[] = []
	const chips: OverlayChip[] = []
	const gaps: OverlayGap[] = []
	let climb: BtRect | null = null
	/**
	 * The claim radius, drawn ONLY while its own knob is focused.
	 *
	 * WHY it is not a standing layer: claim distance is a POINTER-travel
	 * threshold in screen px — how far the finger moves before dnd-kit takes
	 * the press from tldraw — not tree geometry. It has no business competing
	 * with the four layers that describe the layout, and equally it has to be
	 * visible while you are learning that knob: without it, hovering that row
	 * ghosted the entire overlay and lit nothing, which the focus journey
	 * caught on the first pass.
	 */
	let claim: { x: number; y: number; px: number } | null = null
	// Zones are TILED — adjacent columns share an edge — so a strip has to be
	// walked in cross-axis order to know which edges are handovers between two
	// containers and which are the strip's outer overhang, and to alternate
	// the tint that makes an abutment read as two columns rather than one band.
	const shallowestDepth = Math.min(...[...geometry.strips.keys()], Number.POSITIVE_INFINITY)
	for (const strip of geometry.strips.values()) {
		const placed = strip.records
			.map((record) => ({ record, zone: strip.zones.get(record.baseParentPath) }))
			.filter((entry): entry is { record: typeof entry.record; zone: NonNullable<typeof entry.zone> } => entry.zone !== undefined)
			.sort((a, b) => a.zone.start - b.zone.start)
		for (const [index, entry] of placed.entries()) {
			zones.push({
				id: entry.record.baseParentPath,
				rect: shifted(zoneRect(down, entry.zone, strip.band), origin),
				active: entry.record.baseParentPath === activeContainerId,
				parity: (index % 2) as 0 | 1,
			})
			const flowStart = strip.band.flowStart + originFlow
			const flowEnd = strip.band.flowEnd + originFlow
			// The far edge: a seam when another zone starts there, overhang at
			// the strip's end. The near edge is only drawn for the first zone —
			// every other one is the previous zone's far edge already.
			edges.push({
				key: `edge:${entry.record.baseParentPath}:end`,
				kind: index === placed.length - 1 ? 'overhang' : 'seam',
				cross: entry.zone.end + originCross,
				flowStart,
				flowEnd,
			})
			if (index === 0) {
				edges.push({
					key: `edge:${entry.record.baseParentPath}:start`,
					kind: 'overhang',
					cross: entry.zone.start + originCross,
					flowStart,
					flowEnd,
				})
			}
		}
	}
	for (const record of geometry.containersByParent.values()) {
		const active = record.baseParentPath === activeContainerId
		bounds.push({ id: record.baseParentPath, rect: shifted(record.container.bound, origin), active })
		const bound = record.container.bound
		// A threshold line runs the container's flow extent plus a real
		// overshoot at each end. WHY the overshoot matters: the cards are DOM
		// siblings painted over this SVG, so the middle of every line is hidden
		// behind them — the part that sticks out past the band is the only part
		// anyone can actually read the position off. Six px was not enough.
		const flowStart = (down ? bound.y : bound.x) + originFlow - THRESHOLD_OVERSHOOT
		const flowEnd = (down ? bound.y + bound.h : bound.x + bound.w) + originFlow + THRESHOLD_OVERSHOOT
		// The gap dimension goes on the adjacent pair nearest the container's
		// own median, and is labeled with THAT pair's exact measurement — the
		// median stays on the chip, marked `~` when the gaps are not uniform,
		// so no drawn number claims to measure a span it does not span.
		const inner: Array<{ index: number; px: number; from: number; to: number; flow: number }> = []
		for (let i = 1; i < record.container.items.length; i += 1) {
			const before = record.container.items[i - 1].rect
			const after = record.container.items[i].rect
			const from = (crossAxis === 'x' ? before.x + before.w : before.y + before.h)
			const to = crossAxis === 'x' ? after.x : after.y
			const flow = flowAxis === 'y'
				? (Math.max(before.y, after.y) + Math.min(before.y + before.h, after.y + after.h)) / 2
				: (Math.max(before.x, after.x) + Math.min(before.x + before.w, after.x + after.w)) / 2
			inner.push({ index: i, px: Math.max(0, to - from), from, to, flow })
		}
		if (inner.length > 0) {
			const nearest = inner.reduce((best, entry) =>
				Math.abs(entry.px - record.container.gap) < Math.abs(best.px - record.container.gap) ? entry : best)
			const band = shifted(record.container.bound, origin)
			gaps.push({
				key: `gap:${record.baseParentPath}`,
				px: Math.round(nearest.px),
				from: nearest.from + originCross,
				to: nearest.to + originCross,
				flow: nearest.flow + originFlow,
				rect: down
					? { x: nearest.from + originCross, y: band.y, w: Math.max(0, nearest.to - nearest.from), h: band.h }
					: { x: band.x, y: nearest.from + originCross, w: band.w, h: Math.max(0, nearest.to - nearest.from) },
			})
		}
		// The chip is anchored to the BOUND, not the zone: a zone reaches
		// `zoneOverhangSlots` past its members and can start outside the region
		// entirely, which silently pushed a container's numbers off-canvas. The
		// members are always inside. It is seated in the whitespace outside the
		// depth band, along the FLOW axis, so it never lands on a card.
		const zoneRow = zones.find((entry) => entry.id === record.baseParentPath)
		if (zoneRow) {
			const uniform = inner.every((entry) => Math.abs(entry.px - record.container.gap) < 0.5)
			const columnPx = Math.round(down ? zoneRow.rect.w : zoneRow.rect.h)
			const path = record.baseParentPath === '' ? 'root' : record.baseParentPath
			// A one-member list has no inner gap to report. `0` would read as a
			// measured zero — the members are touching — which is a different
			// claim entirely, so say there is nothing to measure.
			const gapText = record.container.items.length < 2
				? 'gap —'
				: `gap ${uniform ? '' : '~'}${Math.round(record.container.gap)}`
			const metrics = [gapText, `slot ${Math.round(record.container.slotExtent)}`, `col ${columnPx}`]
			const w = Math.max(
				textWidth(path, CHIP_PATH_SIZE),
				...metrics.map((line) => textWidth(line, CHIP_METRIC_SIZE)),
			) + 14
			const boundRect = shifted(record.container.bound, origin)
			const flipped = record.depth === shallowestDepth
			chips.push({
				id: record.baseParentPath,
				path,
				metrics,
				// Just outside the depth band along the FLOW axis: the inter-row
				// whitespace the control arrows run through, never a card. The
				// layer sets `overflow: visible`, so a chip is free to hang past
				// the region's edge.
				x: down ? boundRect.x : (flipped ? zoneRow.rect.x + zoneRow.rect.w + 5 : zoneRow.rect.x - 5),
				y: down ? (flipped ? zoneRow.rect.y + zoneRow.rect.h + 5 : zoneRow.rect.y - 5) : boundRect.y,
				w,
				flipped,
				active,
			})
		}
		for (const [index, item] of record.container.items.entries()) {
			const padWidth = item.virtualRect.w - item.rect.w
			const padHeight = item.virtualRect.h - item.rect.h
			const padded = Math.abs(padWidth) > 0.5 || Math.abs(padHeight) > 0.5
			slots.push({
				id: item.id,
				rect: shifted(item.virtualRect, origin),
				padded,
				padPx: Math.round(Math.max(padWidth, padHeight)),
			})
			const center = centerOf(item.virtualRect, crossAxis)
			lines.push({
				key: `capture:${record.baseParentPath}:${item.id}`,
				kind: 'capture',
				cross: center + (tuning.capturePaddingPx ?? 0) + originCross,
				flowStart,
				flowEnd,
				active,
			})
			// The release boundary needs a dragged extent, and applies only to
			// the members the held slot has DISPLACED (index >= slot) — the
			// ones that shifted to make room and must be re-passed to give the
			// slot back. Mid-drag, active container only.
			if (active && draggedRect && activeSlot !== null && index >= activeSlot) {
				const draggedExtent = down ? draggedRect.w : draggedRect.h
				const displacement =
					(tuning.releaseFactor ?? 1) * (draggedExtent + record.container.gap) + (tuning.releasePaddingPx ?? 0)
				lines.push({
					key: `release:${record.baseParentPath}:${item.id}`,
					kind: 'release',
					cross: center + displacement + originCross,
					flowStart,
					flowEnd,
					label: `release ${Math.round(displacement)}px`,
					active,
				})
			}
		}
		if (active && draggedRect) {
			const reach = record.container.slotExtent * (tuning.climbSlots ?? 1)
			const grown = down
				? { x: bound.x - reach, y: bound.y - 10, w: bound.w + reach * 2, h: bound.h + 20 }
				: { x: bound.x - 10, y: bound.y - reach, w: bound.w + 20, h: bound.h + reach * 2 }
			climb = shifted(grown, origin)
		}
	}
	if (focus === 'claimDistancePx') {
		// Anchored on the first member of the fullest container: a real card,
		// so the radius reads against something the pointer would actually
		// press, rather than floating in the region's corner.
		let fullest: { members: SortableItemLike[]; count: number } | null = null
		for (const record of geometry.containersByParent.values()) {
			const count = record.container.items.length
			if (!fullest || count > fullest.count) fullest = { members: record.container.items, count }
		}
		const member = fullest?.members[0]
		if (member) {
			claim = {
				x: member.rect.x + member.rect.w / 2 + origin.x,
				y: member.rect.y + member.rect.h / 2 + origin.y,
				px: claimDistancePx,
			}
		}
	}
	return { zones, edges, bounds, slots, lines, chips, gaps, climb, claim }
}

export interface BtLiveDragTick {
	path: string
	rect: BtRect
}

/**
 * One region's marks, in that region's own coordinates.
 *
 * Mounted by `BtDragModelSurface`, never by the region's canvas: the projected
 * node cards are real shapes and would paint over anything drawn inside the
 * region's SVG. See that file's header for the whole z-order story.
 */
export function BtDragModelRegion({ shape, projection, liveDragTick }: {
	shape: BehaviorTreeShape
	projection: BtProjection
	/**
	 * The surface's per-frame live-drag value ({path, rect} | null), passed so
	 * the memo below re-reads the session's hysteresis and dragged rect each
	 * drag frame — the geometry itself is frozen per session and never
	 * recomputed from it.
	 */
	liveDragTick: BtLiveDragTick | null
}) {
	const editor = useEditor()
	// Read on its own, deliberately OUTSIDE the geometry memo: `useValue` fires
	// only when the value changes, so panning costs nothing and a zoom step
	// re-renders the labels without re-deriving a single container.
	const zoom = useValue('bt drag model zoom', () => editor.getZoomLevel(), [editor])
	// The off-gate first, reactively: with the Dev toggle off (the default)
	// this returns null, nothing below computes, and the overlay renders
	// nothing — zero effect on production behavior. Layer flags and tuner
	// values are read here too, so slider moves repaint immediately.
	const state = useValue('bt drag model overlay state', () => {
		if (!treeDragModelOverlay.get()) return null
		if (shape.props.projection !== 'tree' || shape.props.arrangement !== 'tidy') return null
		const signal = btDndDragState.get(editor)
		return {
			dragging: signal !== null && signal.regionId === shape.id,
			layers: treeDragModelLayers.get(),
			tuning: btDragTuning.get(),
			focus: treeDragModelFocus.get(),
		}
	}, [editor, shape.id, shape.props.projection, shape.props.arrangement])

	const paint = useMemo(() => {
		if (!state) return null
		if (state.dragging) {
			// Mid-drag: the session's OWN resolution geometry — the frozen
			// ghost the collision math actually runs against, with the
			// hysteresis deadband's current container highlighted and the
			// session's frozen tuning. It holds still while cards move: that
			// stillness IS the model.
			const live = activeBtDndDragGeometry(editor)
			if (live && live.regionId === shape.id) {
				const down = live.ctx.orientation === 'down'
				const draggedRect = liveDragTick
					? { x: liveDragTick.rect.x - live.origin.x, y: liveDragTick.rect.y - live.origin.y, w: liveDragTick.rect.w, h: liveDragTick.rect.h }
					: null
				return {
					layers: state.layers,
					down,
					phase: 'drag' as const,
					preview: false,
					...paintFrom({
						geometry: { containersByParent: live.ctx.containersByParent, strips: live.ctx.strips },
						down,
						origin: live.origin,
						tuning: live.ctx.tuning,
						activeContainerId: live.ctx.hysteresis?.containerId ?? null,
						activeSlot: live.ctx.hysteresis?.slot ?? null,
						focus: state.focus,
						claimDistancePx: state.tuning.claimDistancePx,
						draggedRect,
					}),
				}
			}
		}
		// At rest (and during a native glide): the same derivation, over the
		// resting layout, each node its own identity, with the LIVE tuner
		// values so slider moves show their boundaries immediately.
		const scene = projection.scene
		const down = shape.props.orientation === 'down'
		const crossAxis: SortableAxis = down ? 'x' : 'y'
		const nodes: DragListNodeInput[] = scene.nodes.map((entry) => ({
			id: entry.path,
			orderPath: entry.path,
			depth: entry.node.depth,
			rect: entry.rect,
		}))
		const geometry = deriveDragListGeometry(nodes, bandsByDepth(scene, down), crossAxis, state.tuning.zoneOverhangSlots ?? 1)
		// Scene rects are layout-space; `rectToRegion` is the projection's own
		// mapping, so read the offset off a probe rect rather than assuming
		// the origin's shape.
		const probe = rectToRegion(projection, { x: 0, y: 0, w: 0, h: 0 })
		// FOCUS PREVIEW. Deadband and climb have no geometry until a card is
		// moving, so hovering their knobs would light up nothing — the exact
		// failure this view exists to fix. When one of those modes is focused
		// at rest, stand in the fullest container's second member as the
		// dragged card and mark the paint as a preview, so the boundary the
		// knob moves is drawable and the label can say what it assumed.
		// Anything else would be a made-up number; this one is a real member's
		// real rect run through the real formula.
		let previewContainer: string | null = null
		let previewSlot: number | null = null
		let previewRect: BtRect | null = null
		if (state.focus && FOCUS_NEEDS_PREVIEW.has(state.focus)) {
			let fullest: { id: string; items: number } | null = null
			for (const record of geometry.containersByParent.values()) {
				if (!fullest || record.container.items.length > fullest.items) {
					fullest = { id: record.baseParentPath, items: record.container.items.length }
				}
			}
			const record = fullest ? geometry.containersByParent.get(fullest.id) : null
			if (record && record.container.items.length >= 2) {
				previewContainer = record.baseParentPath
				previewSlot = 1
				previewRect = record.container.items[1].rect
			}
		}
		return {
			layers: state.layers,
			down,
			phase: 'rest' as const,
			preview: previewRect !== null,
			...paintFrom({
				geometry,
				down,
				origin: { x: probe.x, y: probe.y },
				tuning: state.tuning,
				activeContainerId: previewContainer,
				activeSlot: previewSlot,
				focus: state.focus,
				claimDistancePx: state.tuning.claimDistancePx,
				draggedRect: previewRect,
			}),
		}
	}, [state, editor, shape.id, shape.props.orientation, projection, liveDragTick])

	if (!paint) return null
	const { layers, down, phase } = paint
	// FOCUS. `lit` is the set of marks the hovered knob actually controls;
	// everything else keeps drawing (the structure still has to be readable)
	// but drops to a ghost weight in CSS. One data attribute per mark, one
	// rule per state — no second renderer, the DevTools shape.
	const lit = focusMarks(state?.focus ?? null)
	const on = (mark: FocusMark) => (lit ? String(lit.has(mark)) : 'none')
	// Every LABEL is drawn inside a counter-scaled group so it keeps a constant
	// SCREEN size. WHY: the overlay paints in region space, so the old text was
	// 9px × the canvas zoom — 5px at the zoom a whole tree is framed at, which
	// is most of why Zach could not read it. Only the labels counter-scale; the
	// geometry they annotate stays in region space where it belongs.
	const inv = 1 / Math.max(zoom, 0.05)
	const label = (x: number, y: number) => `translate(${x} ${y}) scale(${inv})`
	// Painted back to front, weakest ink first: tints, then structure, then
	// the two things that carry numbers (gap dimensions, chips) on top, so a
	// readable value is never buried under a rule it shares a pixel with.
	return (
		<g className="BehaviorTree-dragModel" data-testid="bt-drag-model-overlay" data-phase={phase} data-preview={paint.preview} data-focus={state?.focus ?? 'none'} aria-hidden="true">
			{layers.containers ? paint.zones.map((zone) => (
				<g key={`zone:${zone.id}`} className="BehaviorTree-dragModelZone" data-active={zone.active} data-parity={zone.parity} data-lit={on('zone')}>
					<rect x={zone.rect.x} y={zone.rect.y} width={zone.rect.w} height={zone.rect.h} />
				</g>
			)) : null}
			{layers.containers ? paint.edges.map((edge) => (
				<line
					key={edge.key}
					className="BehaviorTree-dragModelEdge"
					data-kind={edge.kind}
					data-lit={on(edge.kind === 'overhang' ? 'overhang' : 'seam')}
					x1={down ? edge.cross : edge.flowStart}
					y1={down ? edge.flowStart : edge.cross}
					x2={down ? edge.cross : edge.flowEnd}
					y2={down ? edge.flowEnd : edge.cross}
				/>
			)) : null}
			{layers.slots ? paint.slots.map((slot) => (
				<g key={`slot:${slot.id}`} className="BehaviorTree-dragModelSlot" data-padded={slot.padded} data-lit={on('slot')}>
					<rect x={slot.rect.x} y={slot.rect.y} width={slot.rect.w} height={slot.rect.h} rx={6} />
					{/* Only a PADDED slot says anything the card outline does not
					    already say, so only a padded slot gets a number. */}
					{slot.padded ? (
						// Below the slot's trailing corner. WHY not inside it:
						// the node cards are DOM siblings painted OVER this SVG
						// layer, so any label that lands on a card is silently
						// clipped to whatever sticks out past its edge — which
						// is what happened to the first two placements tried.
						<g transform={label(slot.rect.x + slot.rect.w, slot.rect.y + slot.rect.h)}>
							<text x={0} y={13} textAnchor="end">+{slot.padPx}px</text>
						</g>
					) : null}
				</g>
			)) : null}
			{layers.thresholds ? paint.lines.map((line) => (
				<g key={line.key} className="BehaviorTree-dragModelThreshold" data-kind={line.kind} data-active={line.active} data-lit={on(line.kind)}>
					<line
						x1={down ? line.cross : line.flowStart}
						y1={down ? line.flowStart : line.cross}
						x2={down ? line.cross : line.flowEnd}
						y2={down ? line.flowEnd : line.cross}
					/>
					{line.label ? (
						<g transform={label(down ? line.cross : line.flowEnd, down ? line.flowStart : line.cross)}>
							<text x={4} y={down ? 12 : -5}>{line.label}</text>
						</g>
					) : null}
				</g>
			)) : null}
			{layers.climb && paint.climb ? (
				<rect
					className="BehaviorTree-dragModelClimb"
					data-testid="bt-drag-model-climb"
					data-lit={on('climb')}
					x={paint.climb.x}
					y={paint.climb.y}
					width={paint.climb.w}
					height={paint.climb.h}
					rx={8}
				/>
			) : null}
			{layers.containers ? paint.bounds.map((bound) => (
				<path
					key={`bound:${bound.id}`}
					className="BehaviorTree-dragModelBound"
					data-active={bound.active}
					data-lit={on('bound')}
					d={bracketPath(bound.rect)}
				/>
			)) : null}
			{/* The gap dimension: an arrowed span drawn INSIDE the real
			    whitespace between two members, with that span's own px on it.
			    This is the literal answer to "what are the spacings". */}
			{layers.containers ? paint.gaps.map((gap) => {
				const mid = (gap.from + gap.to) / 2
				// Explicit end ticks rather than an SVG <marker>: several Tree
				// regions can paint at once and a shared marker id would collide
				// across them.
				const tick = (at: number, key: string) => (
					<line
						key={key}
						data-role="tick"
						x1={down ? at : gap.flow - 5}
						y1={down ? gap.flow - 5 : at}
						x2={down ? at : gap.flow + 5}
						y2={down ? gap.flow + 5 : at}
					/>
				)
				return (
					<g key={gap.key} className="BehaviorTree-dragModelGap" data-testid="bt-drag-model-gap" data-lit={on('gap')}>
						{/* The gap as hatched space, not a filled object. */}
						<rect
							data-role="hatch"
							x={gap.rect.x}
							y={gap.rect.y}
							width={gap.rect.w}
							height={gap.rect.h}
						/>
						<line
							data-role="span"
							x1={down ? gap.from : gap.flow}
							y1={down ? gap.flow : gap.from}
							x2={down ? gap.to : gap.flow}
							y2={down ? gap.flow : gap.to}
						/>
						{tick(gap.from, `${gap.key}:a`)}
						{tick(gap.to, `${gap.key}:b`)}
						<g transform={label(down ? mid : gap.flow + 7, down ? gap.flow - 7 : mid)}>
							<text x={0} y={0} textAnchor={down ? 'middle' : 'start'}>{gap.px}px</text>
						</g>
					</g>
				)
			}) : null}
			{/* Screen-px, so it is drawn counter-scaled: the threshold really is
			    a distance the POINTER travels, not a distance on the board. */}
			{paint.claim ? (
				<g className="BehaviorTree-dragModelClaim" data-testid="bt-drag-model-claim" data-lit="true">
					<g transform={label(paint.claim.x, paint.claim.y)}>
						<circle cx={0} cy={0} r={paint.claim.px} />
						<circle cx={0} cy={0} r={1.5} data-role="origin" />
						<text x={paint.claim.px + 6} y={4}>claim {paint.claim.px}px</text>
					</g>
				</g>
			) : null}
			{layers.containers ? paint.chips.map((chip) => (
				<g
					key={`chip:${chip.id}`}
					className="BehaviorTree-dragModelChip"
					data-active={chip.active}
					data-testid="bt-drag-model-chip"
					transform={label(chip.x, chip.y)}
				>
					{/* The anchor is a band edge, so the plate always grows AWAY
					    from the cards: up for a top-down tree, left for a
					    left-right one — mirrored on the flipped row. */}
					{(() => {
						const height = CHIP_LEAD * (chip.metrics.length + 1) + 8
						const x = down ? 0 : (chip.flipped ? 0 : -chip.w)
						const y = down ? (chip.flipped ? 0 : -height) : 0
						return (
							<>
								<rect x={x} y={y} width={chip.w} height={height} rx={4} />
								<text data-role="path" x={x + 7} y={y + CHIP_LEAD}>{chip.path}</text>
								{chip.metrics.map((line, index) => (
									<text key={line} data-role="metrics" x={x + 7} y={y + CHIP_LEAD * (index + 2)}>{line}</text>
								))}
							</>
						)
					})()}
				</g>
			)) : null}
		</g>
	)
}
