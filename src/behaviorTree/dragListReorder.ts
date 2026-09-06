/**
 * Tree view drag-to-reorder on dnd-kit: the pure model behind a live
 * auto-layout drag. Replaces `treeDragReorder.ts`'s hand-rolled
 * depth-band/rail/gap-boundary engine.
 *
 * WHY dnd-kit now, when this file's predecessor argued the opposite: Zach
 * explicitly decided the migration after a dedicated research pass read six
 * real tree-drag implementations from source and found NONE of them use a
 * depth-band+inference model — the standing pattern is per-parent lists
 * (dnd-kit's own canonical multi-container Kanban example) with
 * react-arborist's `walkUpFrom`/`bound()` ancestor-climb for cross-parent
 * moves. Modelled that way, every container sorts along its own local axis,
 * which dissolves the earlier audit's real objection (dnd-kit's collision
 * metrics have no orientation concept for one global tree-wide model — they
 * don't need one per list).
 *
 * WHY `DndContext`/`SortableContext` are NOT mounted: the things being
 * dragged are real tldraw Block shapes translated by tldraw's own
 * `select.translating` tool — the stock-boundary rule (don't build a second
 * drag system beside the engine) and the measured two-writer corruption
 * documented in `installBehaviorTreeRegions.ts` both rule out a parallel
 * pointer-sensor pipeline. tldraw IS the sensor. What dnd-kit contributes is
 * the part that is genuinely its own: `pointerWithin`/`closestCenter` — the
 * same exported, pure collision functions `DndContext` runs internally —
 * composed per its multi-container example (containment first, nearest
 * fallback), fed the virtual per-container slot geometry that
 * `sortableGeometry.ts` derives from the real layout. This fork is recorded
 * in docs/peps/0006-tree-drag-dndkit-pure-collision.md; the later, precisely
 * scoped exception that mounts ONE DndContext as the claimed-gesture sensor
 * (never a sortable DOM mirror of the projection) is
 * docs/peps/0007-conditional-dual-drag-owner.md.
 *
 * THE ONE IDEA kept from the predecessor (and its `labs/railDrag` ancestor):
 * a drop target is resolved against a GHOST layout — the real tree with the
 * dragged node's whole occurrence (and so its whole subtree) already
 * deleted — never against the live drag preview, so slot boundaries hold
 * still while the pointer wanders and cannot oscillate. On top of that, new
 * here: a per-container hysteresis deadband (see
 * `resolveSlotWithHysteresis`), because dnd-kit's rankings are stateless
 * per-frame and re-capture on a sliver of movement. Once a target (parent,
 * index) is chosen, the actual commit is `moveBehaviorTreeNode` — the
 * existing, already-tested structural edit that moves one XML element
 * (children included), refuses a move into its own subtree, and refuses a
 * leaf or a full decorator as a landing spot. That refusal IS the
 * illegal-drop signal this module needs; nothing here re-derives it.
 */
import { closestCenter, pointerWithin, type ClientRect, type DroppableContainer } from '@dnd-kit/core'

import {
	deleteBehaviorTreeNode,
	moveBehaviorTreeNode,
	parseBehaviorTreeXml,
	selectTree,
} from './btcppXml'
import {
	type BtControlFace,
	type BtNodeFace,
	type BtNodeViewOverride,
	type BtOrientation,
	type BtRect,
	type BtScene,
} from './behaviorTreeModel'
import {
	deriveSortableContainers,
	resolveSlotWithHysteresis,
	tileContainerZones,
	type SortableAxis,
	type SortableContainer,
	type SortableItemInput,
	type SortableZone,
} from './sortableGeometry'
import { layoutTree } from './treeLayout'

/** A node's index among its own parent's children: the tail of its path. */
export function localIndexOf(path: string): number {
	const tail = path.slice(path.lastIndexOf('.') + 1)
	return Number.parseInt(tail, 10)
}

/** The path one level up: `''` for the root, which this module never targets. */
export function parentPathOf(path: string): string {
	const cut = path.lastIndexOf('.')
	return cut === -1 ? '' : path.slice(0, cut)
}

export interface DepthBand {
	depth: number
	/** Flow-axis extent (page-down: y; page-right: x) of every node at this depth. */
	flowStart: number
	flowEnd: number
}

/** One parent's children list, placed: the sortable container plus where it lives. */
export interface DragListContainer {
	/** The parent node's path in `baseXml`'s own numbering — the reparent target. */
	baseParentPath: string
	depth: number
	container: SortableContainer
}

export interface DragListStrip {
	band: DepthBand
	records: DragListContainer[]
	zones: Map<string, SortableZone>
}

/** Everything a drag needs to answer "where is this pointer asking to land", built once at drag start. */
export interface DragListContext {
	baseXml: string
	treeId: string
	draggedPath: string
	draggedParentPath: string
	draggedLocalIndex: number
	orientation: BtOrientation
	/** Bands from the UNTOUCHED tree, so the dragged node's own row is still a legal target even once the ghost empties it. */
	baseBands: DepthBand[]
	/** Layout of the tree with the dragged occurrence (and its subtree) already removed. */
	ghostScene: BtScene | null
	/** Ghost path → base path, for every surviving node (the deleted subtree has none). */
	ghostToBasePath: Map<string, string>
	/** One sortable container per surviving parent's children list, keyed by the parent's base path. */
	containersByParent: Map<string, DragListContainer>
	/** Containers grouped into their depth strips, zones tiled. */
	strips: Map<number, DragListStrip>
	/**
	 * The hysteresis deadband's one piece of state: the last resolved slot,
	 * per drag, so a captured slot survives sub-threshold wobble. Mutated by
	 * `resolveDragListDrop` — a context is one drag session's, never shared.
	 */
	hysteresis: { containerId: string; slot: number } | null
	/** The tuning this session resolves with, frozen at build like everything else. */
	tuning: DragListTuning
}

function flowOf(rect: BtRect, down: boolean): number {
	return down ? rect.y + rect.h / 2 : rect.x + rect.w / 2
}
function crossCenterOf(rect: BtRect, down: boolean): number {
	return down ? rect.x + rect.w / 2 : rect.y + rect.h / 2
}

export function bandsByDepth(scene: BtScene, down: boolean): DepthBand[] {
	const byDepth = new Map<number, DepthBand>()
	for (const entry of scene.nodes) {
		const depth = entry.node.depth
		const flow = flowOf(entry.rect, down)
		const half = down ? entry.rect.h / 2 : entry.rect.w / 2
		const existing = byDepth.get(depth)
		if (!existing) {
			byDepth.set(depth, { depth, flowStart: flow - half, flowEnd: flow + half })
		} else {
			existing.flowStart = Math.min(existing.flowStart, flow - half)
			existing.flowEnd = Math.max(existing.flowEnd, flow + half)
		}
	}
	return [...byDepth.values()]
}

/**
 * The Drag Model Tuner's resolution-side knobs (claim distance lives with the
 * claim listener). Structurally a subset of `BtDragTuning`; kept as its own
 * interface so this module stays free of editor/atom imports. Every default
 * reproduces the original shipped constants exactly.
 */
export interface DragListTuning {
	capturePaddingPx?: number
	releaseFactor?: number
	releasePaddingPx?: number
	climbSlots?: number
	zoneOverhangSlots?: number
}

export interface DragListOptions {
	orientation: BtOrientation
	nodeFace: BtNodeFace
	controlFace: BtControlFace
	/** Live tuning for thresholds/zones — see `DragListTuning`; omitted = shipped defaults. */
	tuning?: DragListTuning
	/**
	 * An Expanded leaf (item 2's escape hatch from the ordinary Block view
	 * pill) reports its own real, larger box instead of `nodeFace`'s formula —
	 * `treeLayout.ts` already folds this into every row's flow extent and
	 * every sibling's position below it, which is what actually paints. Drag
	 * resolution has to build the SAME layout the pointer is measured
	 * against; building it override-blind silently drifts base/ghost bands
	 * and slots away from the painted rects the instant any leaf in the tree
	 * is Expanded — a live commit, every frame, to the wrong parent/slot.
	 * Path-keyed against `baseXml`'s own numbering, same as the region prop.
	 */
	nodeViewOverrides?: Record<string, BtNodeViewOverride>
	/**
	 * The region's `spacingScale`, for the same reason as `nodeViewOverrides`:
	 * drag resolution must build the SAME layout the pointer is measured
	 * against. A region spaced at 2× whose bands were built at 1× reads every
	 * pointer position as roughly one whole row off.
	 */
	spacing?: number
}

/** Re-key a path-keyed presentation dict through a structural edit's remap — same rule `applyEdit` and `restampChildren` already follow for offsets and overrides. */
function remapByPath<T>(dict: Record<string, T> | undefined, remap: Record<string, string>): Record<string, T> {
	const next: Record<string, T> = {}
	if (!dict) return next
	for (const [path, value] of Object.entries(dict)) {
		const to = remap[path]
		if (to !== undefined) next[to] = value
	}
	return next
}

/** One laid-out node handed to `deriveDragListGeometry`. */
export interface DragListNodeInput {
	/** The node's target identity — its base path for a ghost, its own path at rest. */
	id: string
	/** The path whose tail is the node's order among siblings, in the LAYOUT's numbering. */
	orderPath: string
	depth: number
	rect: BtRect
}

/** The invisible Kanban: per-parent containers, grouped into zone-tiled depth strips. */
export interface DragListGeometry {
	containersByParent: Map<string, DragListContainer>
	strips: Map<number, DragListStrip>
}

/**
 * Phase 2 of the drag pipeline, shared verbatim by the live drag
 * (`buildDragListContext`, over the ghost layout) and the drag-model debug
 * overlay (`BehaviorTreeCanvas`, over the resting layout): group laid-out
 * nodes into per-parent sortable containers with uniform virtual slots, then
 * tile each depth strip's containers into adjudication zones. One derivation,
 * two callers — the overlay can never drift from what resolution actually
 * runs against.
 */
export function deriveDragListGeometry(nodes: readonly DragListNodeInput[], bands: DepthBand[], crossAxis: SortableAxis, zoneOverhangSlots = 1): DragListGeometry {
	const inputs: SortableItemInput[] = []
	const depthByContainer = new Map<string, number>()
	for (const node of nodes) {
		const containerId = parentPathOf(node.id)
		inputs.push({ id: node.id, containerId, order: localIndexOf(node.orderPath), rect: node.rect })
		depthByContainer.set(containerId, node.depth)
	}
	const containers = deriveSortableContainers(inputs, crossAxis)
	const containersByParent = new Map<string, DragListContainer>()
	const strips = new Map<number, DragListStrip>()
	for (const [containerId, container] of containers) {
		const depth = depthByContainer.get(containerId) ?? 0
		const record: DragListContainer = { baseParentPath: containerId, depth, container }
		containersByParent.set(containerId, record)
		const band = bands.find((candidate) => candidate.depth === depth)
		if (!band) continue
		let strip = strips.get(depth)
		if (!strip) {
			strip = { band, records: [], zones: new Map() }
			strips.set(depth, strip)
		}
		strip.records.push(record)
	}
	for (const strip of strips.values()) {
		strip.zones = tileContainerZones(strip.records.map((record) => record.container), crossAxis, zoneOverhangSlots)
	}
	return { containersByParent, strips }
}

/**
 * Build the context once, at drag start. Returns null for a node with no
 * parent (the tree's own root, which by definition has no siblings and
 * cannot be reordered) or a path that no longer resolves.
 */
export function buildDragListContext(baseXml: string, treeId: string, draggedPath: string, options: DragListOptions): DragListContext | null {
	const draggedParentPath = parentPathOf(draggedPath)
	if (draggedParentPath === '') return null
	const draggedLocalIndex = localIndexOf(draggedPath)
	const down = options.orientation === 'down'
	const crossAxis: SortableAxis = down ? 'x' : 'y'
	const layoutOptions = { orientation: options.orientation, nodeFace: options.nodeFace, controlFace: options.controlFace, edgeStyle: 'straight' as const, spacing: options.spacing }

	const tree = selectTree(parseBehaviorTreeXml(baseXml), treeId)
	if (!tree?.root) return null
	if (!tree.nodes.some((node) => node.path === draggedPath)) return null
	const baseScene = layoutTree(tree, { ...layoutOptions, nodeViewOverrides: options.nodeViewOverrides })
	const baseBands = bandsByDepth(baseScene, down)

	const deleted = deleteBehaviorTreeNode(baseXml, treeId, draggedPath)
	if (!deleted.ok) return null
	const ghostTree = selectTree(parseBehaviorTreeXml(deleted.xml), treeId)
	// The ghost is a hypothetical structural edit too: its paths are
	// `deleted.remap`'s OUTPUT numbering, not `baseXml`'s, so a leaf's
	// override has to travel through the same remap or it silently stops
	// applying to that leaf's ghost row (and the row's flow extent shrinks
	// back to the un-Expanded formula right when resolution needs it most).
	const ghostOverrides = remapByPath(options.nodeViewOverrides, deleted.remap)
	const ghostScene = ghostTree?.root ? layoutTree(ghostTree, { ...layoutOptions, nodeViewOverrides: ghostOverrides }) : null
	const ghostToBasePath = new Map<string, string>()
	for (const [basePath, ghostPath] of Object.entries(deleted.remap)) ghostToBasePath.set(ghostPath, basePath)

	// Phase 1 done (the real d3-hierarchy layout above); phase 2: derive the
	// per-parent sortable containers dnd-kit's collision math will run
	// against. Members carry their BASE identity (`ghostToBasePath`) so a
	// resolved slot folds straight into `moveBehaviorTreeNode` with no second
	// mapping step. The root itself gets a (single-member) container too, on
	// purpose: a pointer on the root's row then resolves to parent `''` and
	// is refused by the judge with a real reason, exactly as the old engine
	// behaved, instead of being misread as an empty row.
	const ghostNodes: DragListNodeInput[] = []
	for (const entry of ghostScene?.nodes ?? []) {
		const baseId = ghostToBasePath.get(entry.path)
		if (baseId === undefined) continue
		ghostNodes.push({ id: baseId, orderPath: entry.path, depth: entry.node.depth, rect: entry.rect })
	}
	const tuning = options.tuning ?? {}
	const { containersByParent, strips } = deriveDragListGeometry(ghostNodes, baseBands, crossAxis, tuning.zoneOverhangSlots ?? 1)

	return {
		baseXml,
		treeId,
		draggedPath,
		draggedParentPath,
		draggedLocalIndex,
		orientation: options.orientation,
		baseBands,
		ghostScene,
		ghostToBasePath,
		containersByParent,
		strips,
		hysteresis: null,
		tuning,
	}
}

export type DropResolution =
	| { ok: true; targetParentPath: string; index: number; xml: string; remap: Record<string, string> }
	| { ok: false; reason: string }

export function toClientRect(rect: { x: number; y: number; w: number; h: number }): ClientRect {
	return { top: rect.y, left: rect.x, right: rect.x + rect.w, bottom: rect.y + rect.h, width: rect.w, height: rect.h }
}

/**
 * dnd-kit's collision functions read only `.id` off a droppable (rects come
 * from the map passed beside them) — the rest of `DroppableContainer` is
 * React ref plumbing a mounted `DndContext` would fill in. Constructing the
 * minimal honest shape here is the price of using the real functions without
 * the React tree they normally live in.
 */
export function droppableStub(id: string): DroppableContainer {
	return { id, key: id, disabled: false, data: { current: {} }, node: { current: null }, rect: { current: null } } as unknown as DroppableContainer
}

export function runCollision(
	detector: typeof pointerWithin,
	ids: string[],
	rects: Map<string, ClientRect>,
	collisionRect: ClientRect,
	pointer: { x: number; y: number } | null,
): string | null {
	const droppableRects = rects as unknown as Parameters<typeof detector>[0]['droppableRects']
	const collisions = detector({
		active: null as never,
		collisionRect,
		droppableRects,
		droppableContainers: ids.map(droppableStub),
		pointerCoordinates: pointer,
	})
	return collisions.length > 0 ? String(collisions[0].id) : null
}

/**
 * Resolve one pointer position (the dragged shape's own live rect, in the
 * region's local space — the same space every child's `x`/`y` already live
 * in) to a drop, and fold it straight into `moveBehaviorTreeNode` so illegal
 * lands (a leaf, a full decorator, the node's own subtree) come back as one
 * `ok: false` with the real reason instead of a second, parallel judgment.
 *
 * Three picks, in order:
 *   1. strip — which depth row, `pointerWithin` over the base bands
 *      (cross-normalized so only flow distance can matter), nearest-band
 *      fallback for a pointer between rows or past the last one;
 *   2. container — which parent's list, `pointerWithin` over the strip's
 *      tiled zones (the midpoint tiling IS the old two-parent gap
 *      adjudication), `closestCenter` over the strip's uniform virtual
 *      slots when the pointer is off past the strip's ends; then the
 *      react-arborist ancestor-climb: a pointer that has exited its picked
 *      container's bound by more than one slot walks up the parent chain to
 *      the first ancestor list whose zone contains it — hovering the empty
 *      space where a dragged subtree used to hang now lands beside its old
 *      parent instead of teleporting into an unrelated deep list;
 *   3. slot — `resolveSlotWithHysteresis` within the one picked container.
 */
export function resolveDragListDrop(ctx: DragListContext, pointerRect: BtRect): DropResolution {
	const down = ctx.orientation === 'down'
	const crossAxis: SortableAxis = down ? 'x' : 'y'
	const pointerFlow = flowOf(pointerRect, down)
	const pointerCross = crossCenterOf(pointerRect, down)

	// 1. Strip pick. Bands are abstract flow intervals; normalizing the cross
	// axis to one shared span before handing them to dnd-kit is what makes
	// its 2D containment test answer the 1D question being asked.
	const bandRects = new Map<string, ClientRect>()
	for (const band of ctx.baseBands) {
		bandRects.set(String(band.depth), { top: band.flowStart, bottom: band.flowEnd, left: 0, right: 1, width: 1, height: band.flowEnd - band.flowStart })
	}
	const bandIds = ctx.baseBands.map((band) => String(band.depth))
	const bandPointer = { x: 0.5, y: pointerFlow }
	const bandHit = runCollision(pointerWithin, bandIds, bandRects, { top: pointerFlow, bottom: pointerFlow, left: 0.5, right: 0.5, width: 0, height: 0 }, bandPointer)
	let targetDepth: number
	if (bandHit !== null) {
		targetDepth = Number(bandHit)
	} else {
		// Between rows or past the last one: nearest band by flow distance to
		// the interval — the predecessor's exact fallback, kept because bands
		// of different heights (an Expanded row) make centre distance the
		// wrong metric for "which row is this beside".
		targetDepth = ctx.baseBands[0]?.depth ?? 0
		let bestDistance = Number.POSITIVE_INFINITY
		for (const band of ctx.baseBands) {
			const distance = Math.min(Math.abs(pointerFlow - band.flowStart), Math.abs(pointerFlow - band.flowEnd))
			if (distance < bestDistance) {
				bestDistance = distance
				targetDepth = band.depth
			}
		}
	}

	const strip = ctx.strips.get(targetDepth)
	let record: DragListContainer | null = null
	if (strip && strip.records.length > 0) {
		// 2. Container pick within the strip.
		const zoneRects = new Map<string, ClientRect>()
		for (const candidate of strip.records) {
			const zone = strip.zones.get(candidate.baseParentPath)
			if (!zone) continue
			zoneRects.set(
				candidate.baseParentPath,
				down
					? { left: zone.start, right: zone.end, top: strip.band.flowStart, bottom: strip.band.flowEnd, width: zone.end - zone.start, height: strip.band.flowEnd - strip.band.flowStart }
					: { top: zone.start, bottom: zone.end, left: strip.band.flowStart, right: strip.band.flowEnd, height: zone.end - zone.start, width: strip.band.flowEnd - strip.band.flowStart },
			)
		}
		const realPointer = { x: pointerRect.x + pointerRect.w / 2, y: pointerRect.y + pointerRect.h / 2 }
		const zoneHit = runCollision(pointerWithin, [...zoneRects.keys()], zoneRects, toClientRect(pointerRect), realPointer)
		if (zoneHit !== null) {
			record = ctx.containersByParent.get(zoneHit) ?? null
		} else {
			// Past the strip's outer ends: nearest uniform slot wins, which is
			// the multi-container example's own fallback composition
			// (containment first, then closest).
			const memberRects = new Map<string, ClientRect>()
			const memberContainer = new Map<string, DragListContainer>()
			for (const candidate of strip.records) {
				for (const item of candidate.container.items) {
					memberRects.set(item.id, toClientRect(item.virtualRect))
					memberContainer.set(item.id, candidate)
				}
			}
			const memberHit = runCollision(closestCenter, [...memberRects.keys()], memberRects, toClientRect(pointerRect), realPointer)
			record = memberHit !== null ? (memberContainer.get(memberHit) ?? null) : null
		}
	}

	if (record) {
		// Ancestor-climb (react-arborist's `walkUpFrom`/`bound()`): only a
		// pointer that has left its picked container's REAL bound by more
		// than one slot is asking about an ancestor at all.
		for (let guard = 0; guard < 32 && record; guard += 1) {
			const bound = record.container.bound
			const start = crossAxis === 'x' ? bound.x : bound.y
			const end = crossAxis === 'x' ? bound.x + bound.w : bound.y + bound.h
			const beyond = pointerCross < start ? start - pointerCross : pointerCross > end ? pointerCross - end : 0
			if (beyond <= record.container.slotExtent * (ctx.tuning.climbSlots ?? 1)) break
			let climbed: DragListContainer | null = null
			for (let key = parentPathOf(record.baseParentPath); key !== ''; key = parentPathOf(key)) {
				const ancestor = ctx.containersByParent.get(key)
				if (!ancestor) continue
				const zone = ctx.strips.get(ancestor.depth)?.zones.get(key)
				if (zone && pointerCross >= zone.start && pointerCross <= zone.end) {
					climbed = ancestor
					break
				}
			}
			if (!climbed) break
			record = climbed
		}
	}

	let targetParentPath: string
	let index: number
	if (!record) {
		// Only reachable when the chosen row is empty in the ghost — the
		// dragged node (or its subtree) was that row's sole occupant, so
		// removing it emptied the row entirely. The one legal answer is "put
		// it back", so a pointer hovering its own now-empty row resolves to
		// its own parent and slot rather than refusing outright.
		targetParentPath = ctx.draggedParentPath
		index = ctx.draggedLocalIndex
	} else {
		// 3. Slot pick, with the deadband. The prior slot only carries over
		// while the drag stays in the same container; entering a fresh one
		// reseeds — its own home index for the dragged node's own list (the
		// first capture must cost real travel), the list's end for a foreign
		// one (nothing displaced yet).
		const items = record.container.items
		const isHome = record.baseParentPath === ctx.draggedParentPath
		const seed = isHome ? Math.min(ctx.draggedLocalIndex, items.length) : items.length
		const prior = ctx.hysteresis && ctx.hysteresis.containerId === record.baseParentPath ? ctx.hysteresis.slot : seed
		const slot = resolveSlotWithHysteresis(record.container, pointerRect, crossAxis, prior, ctx.tuning)
		ctx.hysteresis = { containerId: record.baseParentPath, slot }
		targetParentPath = record.baseParentPath
		index = slot < items.length ? localIndexOf(items[slot].id) : localIndexOf(items[items.length - 1].id) + 1
	}

	const moved = moveBehaviorTreeNode(ctx.baseXml, ctx.treeId, ctx.draggedPath, targetParentPath, index)
	if (!moved.ok) return { ok: false, reason: moved.reason }
	return { ok: true, targetParentPath, index, xml: moved.xml, remap: moved.remap }
}
