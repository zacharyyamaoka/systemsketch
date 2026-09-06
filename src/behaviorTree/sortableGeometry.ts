/**
 * Phase 2 of the drag-reorder pipeline: derive dnd-kit-facing sortable
 * geometry from a REAL layout's rects.
 *
 * The two-phase rule (Zach's refinement on the dnd-kit migration): the real
 * layout engine (`treeLayout.ts`'s d3-hierarchy for Tree view, one day
 * `processLayout.ts` for Process view) computes where things actually paint,
 * and THEN this module derives the uniform per-container slot geometry that
 * dnd-kit's collision math runs against. The derived geometry only ever
 * drives drag resolution — committed positions always come from the real
 * layout engine, untouched. That order is why this file is deliberately
 * view-agnostic: it takes bare rects + an axis, never a `BtScene`, an
 * orientation, or anything else Tree-shaped, so Process view's own future
 * migration can reuse it against `processLayout.ts` output instead of
 * reimplementing it.
 *
 * One container = one parent's children list, the multi-container Kanban
 * model from dnd-kit's own canonical example: every container sorts along
 * its OWN local axis, which is what answers the earlier audit's objection
 * that dnd-kit's collision metrics have "no orientation concept" for a
 * whole-tree model — no single global metric is ever asked for.
 */

export type SortableAxis = 'x' | 'y'

export interface SortableRect {
	x: number
	y: number
	w: number
	h: number
}

export interface SortableItemInput {
	/** Stable member identity — for the Behavior Tree, the node's base path. */
	id: string
	/** The list this member belongs to — for the Behavior Tree, the parent's base path. */
	containerId: string
	/** Model order within the list (a child index, never a pixel order). */
	order: number
	/** The member's REAL rect, straight from the layout engine. */
	rect: SortableRect
}

export interface SortableItem {
	id: string
	order: number
	rect: SortableRect
	/**
	 * The uniform slot dnd-kit sees: the member's real center, sized to the
	 * container's largest member on both axes. An Expanded node makes its
	 * whole container's slots that wide — "normalized to the container's
	 * Expanded-node width" — so slot thresholds, zone padding, and the climb
	 * threshold all scale with what is actually painted there.
	 */
	virtualRect: SortableRect
}

export interface SortableContainer {
	id: string
	/** Members ordered by `order`. Never empty — an empty list derives no container. */
	items: SortableItem[]
	/** Uniform slot extent along the sort axis: the largest member's extent. */
	slotExtent: number
	/** Typical inner gap between adjacent members (median), 0 for a single member. */
	gap: number
	/** Real bounding rect of the members' real rects. */
	bound: SortableRect
}

/** The cross-axis span a container answers for once its strip is tiled. */
export interface SortableZone {
	start: number
	end: number
}

function startOf(rect: SortableRect, axis: SortableAxis): number {
	return axis === 'x' ? rect.x : rect.y
}
function extentOf(rect: SortableRect, axis: SortableAxis): number {
	return axis === 'x' ? rect.w : rect.h
}
function endOf(rect: SortableRect, axis: SortableAxis): number {
	return startOf(rect, axis) + extentOf(rect, axis)
}
export function centerOf(rect: SortableRect, axis: SortableAxis): number {
	return startOf(rect, axis) + extentOf(rect, axis) / 2
}

function median(values: number[]): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function union(rects: SortableRect[]): SortableRect {
	let x = Number.POSITIVE_INFINITY
	let y = Number.POSITIVE_INFINITY
	let right = Number.NEGATIVE_INFINITY
	let bottom = Number.NEGATIVE_INFINITY
	for (const rect of rects) {
		x = Math.min(x, rect.x)
		y = Math.min(y, rect.y)
		right = Math.max(right, rect.x + rect.w)
		bottom = Math.max(bottom, rect.y + rect.h)
	}
	return { x, y, w: right - x, h: bottom - y }
}

/**
 * Group real-layout rects into per-parent sortable containers with uniform
 * virtual slot geometry. Pure: same input, same output, no view knowledge.
 */
export function deriveSortableContainers(inputs: SortableItemInput[], axis: SortableAxis): Map<string, SortableContainer> {
	const byContainer = new Map<string, SortableItemInput[]>()
	for (const input of inputs) {
		const list = byContainer.get(input.containerId)
		if (list) list.push(input)
		else byContainer.set(input.containerId, [input])
	}
	const containers = new Map<string, SortableContainer>()
	for (const [id, members] of byContainer) {
		const ordered = [...members].sort((a, b) => a.order - b.order)
		const slotExtent = Math.max(...ordered.map((member) => extentOf(member.rect, axis)))
		const offAxis: SortableAxis = axis === 'x' ? 'y' : 'x'
		const offExtent = Math.max(...ordered.map((member) => extentOf(member.rect, offAxis)))
		const gaps: number[] = []
		for (let i = 1; i < ordered.length; i += 1) {
			gaps.push(Math.max(0, startOf(ordered[i].rect, axis) - endOf(ordered[i - 1].rect, axis)))
		}
		const items: SortableItem[] = ordered.map((member) => {
			const cx = member.rect.x + member.rect.w / 2
			const cy = member.rect.y + member.rect.h / 2
			const w = axis === 'x' ? slotExtent : offExtent
			const h = axis === 'x' ? offExtent : slotExtent
			return { id: member.id, order: member.order, rect: member.rect, virtualRect: { x: cx - w / 2, y: cy - h / 2, w, h } }
		})
		containers.set(id, { id, items, slotExtent, gap: median(gaps), bound: union(ordered.map((member) => member.rect)) })
	}
	return containers
}

/**
 * Tile a strip's containers along the sort axis so every cross position
 * belongs to exactly one container: adjacent gaps split at their midpoint
 * (which IS the old hand-rolled engine's "whichever edge the pointer sits
 * nearer" adjudication between two parents' groups, expressed as geometry),
 * and each outermost zone extends `overhangSlots` slots past its bound
 * (default one) so a pointer just off the end still reads as that container
 * rather than as nowhere.
 */
export function tileContainerZones(containers: SortableContainer[], axis: SortableAxis, overhangSlots = 1): Map<string, SortableZone> {
	const ordered = [...containers].sort((a, b) => startOf(a.bound, axis) - startOf(b.bound, axis))
	const zones = new Map<string, SortableZone>()
	for (let i = 0; i < ordered.length; i += 1) {
		const container = ordered[i]
		const previous = ordered[i - 1]
		const next = ordered[i + 1]
		const start = previous
			? (endOf(previous.bound, axis) + startOf(container.bound, axis)) / 2
			: startOf(container.bound, axis) - container.slotExtent * overhangSlots
		const end = next
			? (endOf(container.bound, axis) + startOf(next.bound, axis)) / 2
			: endOf(container.bound, axis) + container.slotExtent * overhangSlots
		zones.set(container.id, { start, end })
	}
	return zones
}

/**
 * Resolve the dragged rect to a slot in one container, with a deadband.
 *
 * dnd-kit ships no hysteresis — `closestCenter` is a stateless per-frame
 * ranking — so the deadband is layered on top, in exactly the shape the
 * spacing-control agent's research derivation prescribed: a resolver over
 * ordered item bounds + the dragged rect + the prior slot, with container
 * construction kept strictly outside it. The two conditions are
 * `@hello-pangea/dnd`'s `get-reorder-impact` four-branch predicate collapsed
 * for ghost-layout centers (dragged member removed, gaps closed):
 *
 *   - capture member i (dragged goes before it) when the dragged LEADING
 *     edge crosses the member's ghost center;
 *   - release member i (dragged goes back after it) only when the dragged
 *     TRAILING edge passes the member's ghost center + displacement, where
 *     displacement = the dragged extent + the container's typical gap — the
 *     distance the member actually shifted to make room.
 *
 * Edges, not the pointer point, and the asymmetry between the two thresholds
 * is the deadband: a captured slot does not un-capture from a one-pixel
 * wobble, which is the "fires on a sliver" complaint the hand-rolled
 * engine's stateless count-of-centers rule could not answer. With a
 * degenerate (point) rect and no prior slot this reduces to exactly that old
 * count-of-centers rule, which is what keeps the regression oracle green.
 *
 * `prior` is the last resolved slot in THIS container (`items.length` for a
 * container the drag has not entered — nothing displaced yet, hello-pangea's
 * foreign-list seed; the dragged member's own home index for its own list —
 * their `afterCritical` lift semantics, which is what makes the first
 * capture require real travel).
 *
 * `tuning` reshapes both thresholds without changing their structure (the
 * Drag Model Tuner's knobs; defaults reproduce the original formula exactly):
 * capture needs the leading edge past `center + capturePaddingPx`, and
 * release needs the trailing edge past
 * `center + releaseFactor × (draggedExtent + gap) + releasePaddingPx` —
 * so factor 0 with a padding gives a fixed-px deadband that ignores the
 * dragged member's dimensions entirely (the direct test of Zach's
 * orientation-sensitivity hypothesis; see `treeDragTuningState.ts`).
 */
export interface SlotHysteresisTuning {
	capturePaddingPx?: number
	releaseFactor?: number
	releasePaddingPx?: number
}

export function resolveSlotWithHysteresis(
	container: SortableContainer,
	draggedRect: SortableRect,
	axis: SortableAxis,
	prior: number,
	tuning: SlotHysteresisTuning = {},
): number {
	const capturePaddingPx = tuning.capturePaddingPx ?? 0
	const releaseFactor = tuning.releaseFactor ?? 1
	const releasePaddingPx = tuning.releasePaddingPx ?? 0
	const lead = startOf(draggedRect, axis)
	const trail = endOf(draggedRect, axis)
	const displacement = releaseFactor * (extentOf(draggedRect, axis) + container.gap) + releasePaddingPx
	let slot = 0
	for (let i = 0; i < container.items.length; i += 1) {
		const center = centerOf(container.items[i].virtualRect, axis)
		const displaced = i >= prior
		const before = displaced ? !(trail > center + displacement) : lead < center + capturePaddingPx
		if (!before) slot = i + 1
	}
	return slot
}
