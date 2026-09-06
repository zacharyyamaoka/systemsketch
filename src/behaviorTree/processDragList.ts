/**
 * Process view drag-to-reorder: the same drag-model architecture as Tree
 * view (`dragListReorder.ts`), adapted to Flowstate's geometry — Zach's
 * 2026-09-06 direction after reviewing the Tree port live: "I'm confident
 * that you're on the right path to make it work for the process view."
 *
 * WHAT CARRIES OVER UNCHANGED — the parts the tuner tunes and the tests pin:
 *   - one sortable container per parent's children list, uniform virtual
 *     slots derived from the REAL ghost layout (`deriveSortableContainers`);
 *   - resolution against a GHOST scene (the dragged occurrence deleted), so
 *     slot boundaries hold still while cards move;
 *   - the asymmetric hysteresis deadband, with the SAME live tuning knobs
 *     (`resolveSlotWithHysteresis` + `DragListTuning` — the Drag Model
 *     Tuner's sliders govern both views);
 *   - react-arborist's ancestor climb for cross-parent moves, scaled by the
 *     same `climbSlots` knob;
 *   - `moveBehaviorTreeNode` as the one judge of legality.
 *
 * WHAT IS PROCESS-SPECIFIC — and why the Tree module could not be reused
 * verbatim:
 *   - In Tree view every sibling list sorts along ONE global cross axis and
 *     lists group into depth strips. In Process view a list's axis depends
 *     on its parent's grammar: a Sequence stacks its steps ALONG the flow, a
 *     Parallel forks one lane per child ACROSS it, a Fallback keeps arm
 *     heads across the recovery gap. So each container carries its own sort
 *     axis, read off the GHOST GEOMETRY itself (the spread of member
 *     centers) rather than off tag semantics that decorators and branch
 *     sugar would mis-map.
 *   - Depth strips don't exist; Process nests boxes. Container adjudication
 *     is therefore dnd-kit's own canonical composition applied to nested
 *     areas: `pointerWithin` over padded container bounds with the DEEPEST
 *     hit winning, then `closestCenter` over every virtual slot as the
 *     fallback — no strip/zone tiling to re-derive.
 *   - Only LEAVES are cards in a Process scene (`layoutProcess` emits
 *     controls as bars, frames and lanes), so containers exist exactly where
 *     a parent has at least one leaf card. Dragging a whole group has no
 *     grab handle here — inherent to the Flowstate grammar, same as in
 *     Intrinsic's own editor.
 */
import { closestCenter, type ClientRect } from '@dnd-kit/core'

import { type BtRect } from './behaviorTreeModel'
import {
	deleteBehaviorTreeNode,
	moveBehaviorTreeNode,
	parseBehaviorTreeXml,
	selectTree,
} from './btcppXml'
import {
	localIndexOf,
	parentPathOf,
	runCollision,
	toClientRect,
	type DragListTuning,
	type DropResolution,
} from './dragListReorder'
import { layoutProcess, PROCESS_GAP, type ProcessLayoutOptions } from './processLayout'
import {
	deriveSortableContainers,
	resolveSlotWithHysteresis,
	type SortableAxis,
	type SortableContainer,
	type SortableItemInput,
} from './sortableGeometry'

export interface ProcessDragListOptions extends Omit<ProcessLayoutOptions, 'offsets'> {
	tuning?: DragListTuning
}

interface ProcessDragContainer {
	baseParentPath: string
	/** How deep this list nests — the deepest containing hit wins adjudication. */
	depth: number
	/** The axis THIS list actually sorts along, read off the BASE geometry. */
	axis: SortableAxis
	/** Slot geometry from the GHOST (dragged occurrence removed) — what resolution runs against. */
	container: SortableContainer
	/**
	 * The list's REAL card union from the BASE scene (dragged card INCLUDED).
	 * Same principle as Tree view's base-scene bands: the pointer moves in
	 * the space the person actually sees, so adjudication must be anchored
	 * there — a ghost-anchored bound sits shifted by the removed card's
	 * extent and swallows presses from the wrong list (a measured failure in
	 * this module's first cut, not a hypothetical).
	 */
	realBound: BtRect
	/** `realBound` padded by the zone-overhang knob — the list's outer claim. */
	adjudicationBound: BtRect
	/** The dragged member's position AMONG THIS LIST'S CARDS in the base scene, or null. */
	draggedCardPosition: number | null
}

export interface ProcessDragListContext {
	baseXml: string
	treeId: string
	draggedPath: string
	draggedParentPath: string
	draggedLocalIndex: number
	containersByParent: Map<string, ProcessDragContainer>
	/** Same one-drag deadband state as the Tree context, per container. */
	hysteresis: { containerId: string; slot: number } | null
	tuning: DragListTuning
}

/**
 * The list's sort axis, from its own placed members: whichever dimension
 * spreads the member centers further is the axis the parent packs along. A
 * single-member list falls back to the flow axis — the only slot question a
 * one-member list can be asked ("before or after it") reads most naturally
 * along the flow, and the deadband math is symmetric either way.
 */
function axisOfMembers(members: readonly SortableItemInput[], flowAxis: SortableAxis): SortableAxis {
	if (members.length < 2) return flowAxis
	let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY
	for (const member of members) {
		const cx = member.rect.x + member.rect.w / 2
		const cy = member.rect.y + member.rect.h / 2
		minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
		minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
	}
	return maxX - minX >= maxY - minY ? 'x' : 'y'
}

function unionRect(a: BtRect, b: BtRect): BtRect {
	const x = Math.min(a.x, b.x)
	const y = Math.min(a.y, b.y)
	return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

function pad(rect: BtRect, axis: SortableAxis, amount: number): BtRect {
	return axis === 'x'
		? { x: rect.x - amount, y: rect.y - amount / 2, w: rect.w + amount * 2, h: rect.h + amount }
		: { x: rect.x - amount / 2, y: rect.y - amount, w: rect.w + amount, h: rect.h + amount * 2 }
}

/**
 * Build once at drag start, exactly like the Tree context: parse, delete the
 * dragged occurrence, lay the ghost out with the REAL process engine, group
 * surviving leaf cards into per-parent containers keyed by BASE paths.
 */
export function buildProcessDragListContext(
	baseXml: string,
	treeId: string,
	draggedPath: string,
	options: ProcessDragListOptions,
): ProcessDragListContext | null {
	const draggedParentPath = parentPathOf(draggedPath)
	if (draggedParentPath === '') return null
	const tuning = options.tuning ?? {}
	const flowAxis: SortableAxis = options.orientation === 'down' ? 'y' : 'x'

	const tree = selectTree(parseBehaviorTreeXml(baseXml), treeId)
	if (!tree?.root) return null
	if (!tree.nodes.some((node) => node.path === draggedPath)) return null
	const layoutOptions = {
		orientation: options.orientation,
		nodeFace: options.nodeFace,
		controlFace: options.controlFace,
		spacing: options.spacing,
	}
	const baseScene = layoutProcess(tree, { ...layoutOptions, nodeViewOverrides: options.nodeViewOverrides })
	const deleted = deleteBehaviorTreeNode(baseXml, treeId, draggedPath)
	if (!deleted.ok) return null
	const ghostTree = selectTree(parseBehaviorTreeXml(deleted.xml), treeId)
	if (!ghostTree?.root) return null
	const ghostScene = layoutProcess(ghostTree, {
		...layoutOptions,
		nodeViewOverrides: remapByPath(options.nodeViewOverrides, deleted.remap),
	})
	const ghostToBasePath = new Map<string, string>()
	for (const [basePath, ghostPath] of Object.entries(deleted.remap)) ghostToBasePath.set(ghostPath, basePath)

	// BASE members per parent, the dragged card included: axes and claim
	// areas live in the space the pointer actually moves in.
	const baseMembersByParent = new Map<string, SortableItemInput[]>()
	for (const entry of baseScene.nodes) {
		const containerId = parentPathOf(entry.path)
		const input: SortableItemInput = { id: entry.path, containerId, order: localIndexOf(entry.path), rect: entry.rect }
		const list = baseMembersByParent.get(containerId)
		if (list) list.push(input)
		else baseMembersByParent.set(containerId, [input])
	}
	// GHOST members per parent, base-keyed: the slot geometry.
	const ghostInputsByParent = new Map<string, SortableItemInput[]>()
	for (const entry of ghostScene.nodes) {
		const baseId = ghostToBasePath.get(entry.path)
		if (baseId === undefined) continue
		const containerId = parentPathOf(baseId)
		const input: SortableItemInput = { id: baseId, containerId, order: localIndexOf(entry.path), rect: entry.rect }
		const list = ghostInputsByParent.get(containerId)
		if (list) list.push(input)
		else ghostInputsByParent.set(containerId, [input])
	}
	const containersByParent = new Map<string, ProcessDragContainer>()
	for (const [containerId, ghostMembers] of ghostInputsByParent) {
		const baseMembers = baseMembersByParent.get(containerId) ?? []
		const axis = axisOfMembers(baseMembers.length >= 2 ? baseMembers : ghostMembers, flowAxis)
		const container = deriveSortableContainers(ghostMembers, axis).get(containerId)
		if (!container) continue
		const baseBoundSource = baseMembers.length > 0 ? baseMembers : ghostMembers
		let bound: BtRect | null = null
		for (const member of baseBoundSource) {
			bound = bound === null ? { ...member.rect } : unionRect(bound, member.rect)
		}
		// The dragged member's position among this list's CARDS (controls have
		// no card in Process view, so a raw child index over-counts — the
		// hysteresis seed needs the card position, not the XML position).
		const sortedBase = [...baseMembers].sort((a, b) => a.order - b.order)
		const cardPosition = sortedBase.findIndex((member) => member.id === draggedPath)
		// WHY the gap override: `deriveSortableContainers` takes the MEDIAN
		// inter-card gap, which is right for Tree view (every sibling has a
		// card) and wrong here — a card-less section (a Fallback's lanes, a
		// Parallel's fork) leaves a hole hundreds of px wide between its
		// neighbouring cards, and a median poisoned by holes inflates the
		// deadband displacement several-fold (measured: 516px to swap two
		// adjacent rail steps — Zach's sensitivity complaint reborn). The
		// truthful "distance a member shifts to make room" in Process is the
		// layout's own rhythm unit, PROCESS_GAP × spacing — the exact gap the
		// engine closes when the list compacts.
		const rhythmGap = PROCESS_GAP * (options.spacing ?? 1)
		const realBound = bound ?? container.bound
		containersByParent.set(containerId, {
			baseParentPath: containerId,
			depth: containerId === '' ? 0 : containerId.split('.').length,
			axis,
			container: { ...container, gap: rhythmGap },
			realBound,
			adjudicationBound: pad(realBound, axis, container.slotExtent * (tuning.zoneOverhangSlots ?? 1)),
			draggedCardPosition: cardPosition === -1 ? null : cardPosition,
		})
	}
	return {
		baseXml,
		treeId,
		draggedPath,
		draggedParentPath,
		draggedLocalIndex: localIndexOf(draggedPath),
		containersByParent,
		hysteresis: null,
		tuning,
	}
}

function remapByPath<T>(dict: Record<string, T> | undefined, remap: Record<string, string>): Record<string, T> {
	const next: Record<string, T> = {}
	if (!dict) return next
	for (const [path, value] of Object.entries(dict)) {
		const to = remap[path]
		if (to !== undefined) next[to] = value
	}
	return next
}

function containsPoint(rect: BtRect, point: { x: number; y: number }): boolean {
	return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

function distanceToRect(rect: BtRect, point: { x: number; y: number }): number {
	const dx = point.x < rect.x ? rect.x - point.x : point.x > rect.x + rect.w ? point.x - (rect.x + rect.w) : 0
	const dy = point.y < rect.y ? rect.y - point.y : point.y > rect.y + rect.h ? point.y - (rect.y + rect.h) : 0
	return Math.hypot(dx, dy)
}

function crossDistanceBeyond(record: ProcessDragContainer, point: { x: number; y: number }): number {
	const bound = record.adjudicationBound
	const start = record.axis === 'x' ? bound.y : bound.x
	const end = record.axis === 'x' ? bound.y + bound.h : bound.x + bound.w
	const position = record.axis === 'x' ? point.y : point.x
	return position < start ? start - position : position > end ? position - end : 0
}

/**
 * Resolve one pointer frame, Process grammar: containment over nested padded
 * bounds (deepest wins), `closestCenter` fallback, the same ancestor climb,
 * the same tuned hysteresis, the same judge.
 */
export function resolveProcessDragDrop(ctx: ProcessDragListContext, pointerRect: BtRect): DropResolution {
	const pointer = { x: pointerRect.x + pointerRect.w / 2, y: pointerRect.y + pointerRect.h / 2 }

	// 1. Container adjudication, base-anchored (see
	// `ProcessDragContainer.realBound`): a REAL card-union hit wins outright,
	// deepest first; a pointer only inside padded claims goes to the claim
	// whose real bound is NEAREST — which splits a contested gap between two
	// lists at its midpoint, the 2D reading of Tree view's zone tiling.
	const realHits: ProcessDragContainer[] = []
	const paddedHits: Array<{ record: ProcessDragContainer; distance: number }> = []
	for (const record of ctx.containersByParent.values()) {
		if (containsPoint(record.realBound, pointer)) {
			realHits.push(record)
		} else if (containsPoint(record.adjudicationBound, pointer)) {
			paddedHits.push({ record, distance: distanceToRect(record.realBound, pointer) })
		}
	}
	let record: ProcessDragContainer | null = null
	if (realHits.length > 0) {
		realHits.sort((a, b) => b.depth - a.depth)
		record = realHits[0]
	} else if (paddedHits.length > 0) {
		paddedHits.sort((a, b) => a.distance - b.distance || b.record.depth - a.record.depth)
		record = paddedHits[0].record
	} else {
		// 2. Nowhere inside: nearest virtual slot anywhere (the multi-container
		// example's own fallback), via dnd-kit's real collision function.
		const memberRects = new Map<string, ClientRect>()
		const memberContainer = new Map<string, ProcessDragContainer>()
		for (const candidate of ctx.containersByParent.values()) {
			for (const item of candidate.container.items) {
				memberRects.set(item.id, toClientRect(item.virtualRect))
				memberContainer.set(item.id, candidate)
			}
		}
		const hit = runCollision(closestCenter, [...memberRects.keys()], memberRects, toClientRect(pointerRect), pointer)
		record = hit !== null ? (memberContainer.get(hit) ?? null) : null
	}
	if (record) {
		// 3. Ancestor climb, cross-axis, same knob as Tree: a pointer that has
		// left its picked list's padded bound crosswise by more than
		// `climbSlots` slots is asking about an ancestor list.
		for (let guard = 0; guard < 32 && record; guard += 1) {
			const beyond = crossDistanceBeyond(record, pointer)
			if (beyond <= record.container.slotExtent * (ctx.tuning.climbSlots ?? 1)) break
			let climbed: ProcessDragContainer | null = null
			for (let key = parentPathOf(record.baseParentPath); ; key = parentPathOf(key)) {
				const ancestor = ctx.containersByParent.get(key)
				if (ancestor) {
					const bound = ancestor.adjudicationBound
					if (pointer.x >= bound.x && pointer.x <= bound.x + bound.w && pointer.y >= bound.y && pointer.y <= bound.y + bound.h) {
						climbed = ancestor
						break
					}
				}
				if (key === '') break
			}
			if (!climbed) break
			record = climbed
		}
	}

	let targetParentPath: string
	let index: number
	if (!record) {
		// Only reachable when the ghost has no cards at all near the pointer —
		// hovering the dragged card's own emptied lane. Put it back.
		targetParentPath = ctx.draggedParentPath
		index = ctx.draggedLocalIndex
	} else {
		const items = record.container.items
		const isHome = record.baseParentPath === ctx.draggedParentPath
		// The home seed is the dragged member's position among the list's
		// CARDS, not its raw child index — Process controls have no card, so
		// the two diverge the moment a Fallback or Parallel sits beside a leaf.
		const seed = isHome
			? Math.min(record.draggedCardPosition ?? ctx.draggedLocalIndex, items.length)
			: items.length
		const prior = ctx.hysteresis && ctx.hysteresis.containerId === record.baseParentPath ? ctx.hysteresis.slot : seed
		const slot = resolveSlotWithHysteresis(record.container, pointerRect, record.axis, prior, ctx.tuning)
		ctx.hysteresis = { containerId: record.baseParentPath, slot }
		targetParentPath = record.baseParentPath
		index = slot < items.length ? localIndexOf(items[slot].id) : localIndexOf(items[items.length - 1].id) + 1
	}

	const moved = moveBehaviorTreeNode(ctx.baseXml, ctx.treeId, ctx.draggedPath, targetParentPath, index)
	if (!moved.ok) return { ok: false, reason: moved.reason }
	return { ok: true, targetParentPath, index, xml: moved.xml, remap: moved.remap }
}
