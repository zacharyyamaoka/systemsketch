/**
 * Keep every Behavior Tree region's children equal to its projection, and
 * compile the ordinary things a person does to those children back into the
 * XML: a typed title becomes a `name`, an edited port value becomes an
 * attribute, Delete removes the occurrence, a drag records a free offset.
 *
 * The same shape as `installBranchRegions`: side-effect handlers queue a
 * region, one operation-complete pass repairs it. Commands repair
 * synchronously inside their own transaction; this installer is for loads,
 * remote changes, undo, and gestures that never went through a command.
 */
import {
	createShapeId,
	isShapeId,
	react,
	type Editor,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockShape } from '../blocks'
import { createOrUpdateConnectionBinding, getConnectionBindings } from '../blocks/connections/ConnectionBindingUtil'
import { CONNECTION_SHAPE_TYPE } from '../blocks/connections/connectionModel'
import {
	BEHAVIOR_TREE_SHAPE_TYPE,
	BT_CONTROL_SHAPE_TYPE,
	BT_META_PATH,
	BT_META_REGION,
	btChildMeta,
	isBehaviorTreeShape,
	readBtChildMeta,
	type BehaviorTreeShape,
	type BtControlShape,
} from './behaviorTreeModel'
import { BT_IN_PORT, projectBehaviorTree, type BtDesiredChild } from './behaviorTreeProjection'
import { installBtRunStore } from './runtime/runStore'
import { deleteBehaviorTreeNode, setBehaviorTreeNodeAttribute } from './btcppXml'
import { btDndDragState } from './treeDndDragState'

/** True while a projection is writing children, so its writes are not read as gestures. */
const projecting = new WeakMap<Editor, number>()

function isProjecting(editor: Editor): boolean {
	return (projecting.get(editor) ?? 0) > 0
}

/**
 * True only for a shape tldraw's own select tool is natively translating
 * right now. In tidy Tree view that can only be a gesture the dnd drag lane
 * (`treeDndDrag.tsx`) deliberately left native — a multi-select drag or an
 * alt-clone — because its claim protocol cancels every sole-node translate
 * before or at `select.translating` entry. Those native glides are tracked
 * so the repair pass never writes the same shapes tldraw is writing.
 */
function isNativelyTranslatingThisShape(editor: Editor, shapeId: TLShapeId): boolean {
	return editor.isIn('select.translating') && editor.getSelectedShapeIds().includes(shapeId)
}

/**
 * Run `body` with this installer deaf to the store.
 *
 * WHY: dismantling a region is not a gesture *on* a region. Detach deletes the
 * projected children on purpose, and the after-delete handler below reads a
 * deleted node as "the person removed this occurrence" — it would compile an
 * XML delete per child and then repair the region back into existence around
 * the primitives that just replaced it. The same counter the projection itself
 * uses is the honest way to say "these writes are mine".
 */
export function withoutBehaviorTreeRepair<T>(editor: Editor, body: () => T): T {
	projecting.set(editor, (projecting.get(editor) ?? 0) + 1)
	try {
		return body()
	} finally {
		projecting.set(editor, (projecting.get(editor) ?? 1) - 1)
	}
}

export interface BtRepairReport {
	created: number
	updated: number
	removed: number
	cables: number
	/** Cables the projection wanted but the connection layer refused, with why. */
	refused: string[]
}

function sameProps(current: Record<string, unknown>, wanted: Record<string, unknown>): boolean {
	for (const key of Object.keys(wanted)) {
		if (JSON.stringify(current[key]) !== JSON.stringify(wanted[key])) return false
	}
	return true
}

/**
 * Make the store agree with the projection. Idempotent: a second call with
 * nothing changed writes nothing.
 */
export interface BtReconcileOptions {
	/**
	 * WHY: a live Tree view drag commits a fresh candidate XML on every
	 * pointer frame, and this is the repair that follows any XML write —
	 * including that one. Repositioning EVERY child to match, the dragged one
	 * included, sounds right ("auto layout" means a rect is always exactly
	 * what the layout says) but is not: whichever system owns the gesture —
	 * dnd-kit's sensor for a claimed reorder drag (`treeDndDrag.tsx`),
	 * tldraw's own translate for a native multi-select glide — is issuing its
	 * OWN `x`/`y` for those same shapes from the raw pointer on the very next
	 * frame, and it does not read this call's answer back. Two writers on one
	 * shape corrupts the drag (a real regression caught by
	 * `test:tree-drag-reorder` when the observer-based ancestor of this code
	 * reconciled the dragged shape mid-gesture, not a hypothetical). The
	 * gesture owner's shapes are skipped while the gesture lasts and settled
	 * like everything else the instant it ends.
	 */
	skipShapeIds?: readonly TLShapeId[]
}

export function reconcileBehaviorTree(editor: Editor, regionId: TLShapeId, options: BtReconcileOptions = {}): BtRepairReport {
	const report: BtRepairReport = { created: 0, updated: 0, removed: 0, cables: 0, refused: [] }
	const region = editor.getShape(regionId)
	if (!isBehaviorTreeShape(region)) return report
	const projection = projectBehaviorTree(region.props)
	projecting.set(editor, (projecting.get(editor) ?? 0) + 1)
	try {
		editor.run(() => {
			const existing = new Map<string, TLShape>()
			const cables = new Map<string, TLShape>()
			const stray: TLShapeId[] = []
			for (const id of editor.getSortedChildIdsForParent(region.id)) {
				const shape = editor.getShape(id)
				if (!shape) continue
				const meta = readBtChildMeta(shape)
				if (!meta || meta.btRole === 'cable') continue
				const key = `${meta.btRole}:${meta[BT_META_PATH]}`
				if (existing.has(key)) stray.push(shape.id)
				else existing.set(key, shape)
			}
			// A cable is parented by the connection layer into the scope its two
			// Blocks share, which is the page, not the region — so it is found by
			// its meta wherever it lives.
			for (const cable of regionCables(editor, region.id)) {
				const path = readBtChildMeta(cable)![BT_META_PATH]
				if (cables.has(path)) stray.push(cable.id)
				else cables.set(path, cable)
			}

			const wantedKeys = new Set<string>()
			const idByPath = new Map<string, TLShapeId>()
			for (const child of projection.children) {
				const key = `${child.role}:${child.path}`
				wantedKeys.add(key)
				const current = existing.get(key)
				if (current && current.type === child.type) {
					idByPath.set(child.path, current.id)
					const wanted = desiredRecordProps(child, current)
					const skip = options.skipShapeIds?.includes(current.id) ?? false
					// The region owns its children's opacity: the disabled dim is a
					// projection fact, so a hand-set opacity is repaired like a drag.
					const wantedOpacity = child.opacity ?? 1
					if (!skip && (Math.abs(current.x - child.x) > 0.01 || Math.abs(current.y - child.y) > 0.01 || current.opacity !== wantedOpacity || !sameProps(current.props as Record<string, unknown>, wanted))) {
						editor.updateShape({ id: current.id, type: current.type, x: child.x, y: child.y, opacity: wantedOpacity, props: wanted } as never)
						report.updated += 1
					}
					// A copied child arrives naming the region it was copied from.
					// Containment already decided it belongs here; make the stamp
					// agree so nothing downstream — a later delete above all — reads
					// the stale name and edits the wrong tree's XML.
					if (current.meta[BT_META_REGION] !== region.id) {
						editor.updateShape({ id: current.id, type: current.type, meta: btChildMeta(region.id, child.path, child.role) } as never)
						report.updated += 1
					}
					continue
				}
				if (current) stray.push(current.id)
				const id = createShapeId()
				idByPath.set(child.path, id)
				editor.createShape({
					id,
					type: child.type === 'block' ? BLOCK_SHAPE_TYPE : BT_CONTROL_SHAPE_TYPE,
					parentId: region.id,
					x: child.x,
					y: child.y,
					opacity: child.opacity ?? 1,
					props: child.props,
					meta: btChildMeta(region.id, child.path, child.role),
				} as never)
				report.created += 1
			}
			for (const [key, shape] of existing) {
				if (!wantedKeys.has(key)) stray.push(shape.id)
			}

			const wantedCables = new Set<string>()
			for (const cable of projection.cables) {
				wantedCables.add(cable.path)
				if (cables.has(cable.path)) continue
				const fromId = idByPath.get(cable.fromPath)
				const toId = idByPath.get(cable.toPath)
				if (!fromId || !toId) {
					report.refused.push(`${cable.path}: ${!fromId ? 'no source shape' : 'no target shape'}`)
					continue
				}
				const cableId = createShapeId()
				editor.createShape({
					id: cableId,
					type: CONNECTION_SHAPE_TYPE,
					parentId: region.id,
					x: 0,
					y: 0,
					props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
					meta: btChildMeta(region.id, cable.path, 'cable'),
				} as never)
				const startOk = createOrUpdateConnectionBinding(editor, cableId, fromId, { portId: cable.fromPort, face: 'outer', terminal: 'start' })
				const endOk = startOk && createOrUpdateConnectionBinding(editor, cableId, toId, { portId: cable.toPort, face: 'outer', terminal: 'end' })
				if (!endOk) {
					report.refused.push(`${cable.path}: ${startOk ? 'target port' : 'source port'} not bindable`)
					editor.deleteShape(cableId)
				} else {
					report.cables += 1
				}
			}
			for (const [path, shape] of cables) {
				if (!wantedCables.has(path)) stray.push(shape.id)
			}
			if (stray.length > 0) {
				editor.deleteShapes(stray)
				report.removed += stray.length
			}
			if (region.props.w !== projection.size.w || region.props.h !== projection.size.h) {
				editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, w: projection.size.w, h: projection.size.h } })
			}
		})
	} finally {
		projecting.set(editor, (projecting.get(editor) ?? 1) - 1)
	}
	return report
}

/** The Behavior Tree region a shape sits inside, if any. */
export function behaviorTreeRegionAncestor(editor: Editor, shape: TLShape): BehaviorTreeShape | null {
	let parent = editor.getShape(shape.parentId as TLShapeId)
	while (parent) {
		if (isBehaviorTreeShape(parent)) return parent
		parent = editor.getShape(parent.parentId as TLShapeId)
	}
	return null
}

/**
 * The region a projected child belongs to.
 *
 * WHY: containment decides, not the id stamped in `meta`. tldraw re-mints
 * every shape id on duplicate and paste but copies `meta` verbatim, so a
 * copied child still names the ORIGINAL region — and every rule that trusted
 * that name then acted on the original: it reparented the copy into it,
 * recorded the paste distance as one of the original's free offsets (which is
 * why the original's layout scrambled and Tidy, which clears offsets, "fixed"
 * it), and deleted the original's own children as duplicate strays. A child's
 * parent is the one fact copy and paste get right. The stored id survives only
 * as the fallback for the case containment cannot answer — a child dragged
 * clean out of every region, which the drag rule below then pulls back.
 *
 * The stamp is kept and repaired rather than deleted, and that redundancy is
 * deliberate — see docs/peps/0004-projected-child-ownership-by-containment.md
 */
export function behaviorTreeRegionFor(editor: Editor, shape: TLShape): BehaviorTreeShape | null {
	const meta = readBtChildMeta(shape)
	if (!meta) return null
	if (meta.btRole === 'cable') return cableRegion(editor, shape)
	const ancestor = behaviorTreeRegionAncestor(editor, shape)
	if (ancestor) return ancestor
	const stored = meta[BT_META_REGION]
	const region = isShapeId(stored) ? editor.getShape(stored as TLShapeId) : undefined
	return isBehaviorTreeShape(region) ? region : null
}

/**
 * A cable is parented into the scope its two Blocks share — the page, not the
 * region — so containment cannot answer for it. Its bound Blocks can: they are
 * the occurrences it was projected between, and paste rebinds a copied cable
 * to the copied Blocks.
 */
function cableRegion(editor: Editor, cable: TLShape): BehaviorTreeShape | null {
	const bindings = getConnectionBindings(editor, cable.id)
	for (const binding of [bindings.start, bindings.end]) {
		const bound = binding ? editor.getShape(binding.toId) : undefined
		if (!bound) continue
		const region = behaviorTreeRegionAncestor(editor, bound)
		if (region) return region
	}
	const stored = readBtChildMeta(cable)?.[BT_META_REGION]
	const region = isShapeId(stored) ? editor.getShape(stored as TLShapeId) : undefined
	return isBehaviorTreeShape(region) ? region : null
}

/** Every Dataflow cable this region projected, wherever the connection layer parented it. */
export function regionCables(editor: Editor, regionId: TLShapeId): TLShape[] {
	return editor.getCurrentPageShapes().filter((shape) => {
		const meta = readBtChildMeta(shape)
		if (meta === null || meta.btRole !== 'cable') return false
		return cableRegion(editor, shape)?.id === regionId
	})
}

/**
 * The props a repair writes onto an existing child. A leaf Block keeps the
 * things a person may have styled on it (view sizes, notes); everything the
 * XML owns — title, type, icon, ports, face, size — follows the projection.
 */
function desiredRecordProps(child: BtDesiredChild, current: TLShape): Record<string, unknown> {
	if (child.type === 'behaviorTreeControl') return child.props as BtControlShape['props']
	const wanted = child.props as BlockShape['props']
	const currentProps = current.props as BlockShape['props']
	return {
		...currentProps,
		...wanted,
		notes: currentProps.notes ?? wanted.notes,
	}
}

/* -------------------------------- installer -------------------------------- */

type RepairSource = 'user' | 'remote'

export function installBehaviorTreeRegions(editor: Editor): () => void {
	let pending = new Map<TLShapeId, RepairSource>()
	let repairQueued = false
	let disposed = false

	const queue = (id: TLShapeId, source: RepairSource) => {
		if (pending.get(id) === 'user') return
		pending.set(id, source)
	}
	const regionIdFor = (shape: TLShape): TLShapeId | null => {
		if (isBehaviorTreeShape(shape)) return shape.id
		return behaviorTreeRegionFor(editor, shape)?.id ?? null
	}

	// WHY: a shape that has just been created is not a shape someone is
	// dragging. Duplicate and paste land a whole projection at an offset, and
	// the position handlers below would read each arrival as a free drag —
	// writing the paste distance into a region's `offsets`. One operation's
	// arrivals are remembered until the repair that follows it.
	const arrived = new Set<TLShapeId>()

	// WHY: undo/redo replays a whole operation's diff atomically — store.put
	// (every added/updated record, region included) runs before store.remove
	// (every deleted record) — so a region's own xml/offsets are already back
	// to their pre-edit value by the time a *child's* revert fires its own
	// side effect. `stopDelete` below relies on this ordering: once a region
	// has already been rewritten earlier in the same operation, a child
	// vanishing afterward is that rewrite's own bookkeeping catching up, not a
	// fresh gesture, so it must not be compiled into a second, independent
	// edit. Reset once per completed operation — see `stopComplete`.
	const regionRewrittenThisOperation = new Set<TLShapeId>()

	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (isProjecting(editor)) return
		arrived.add(shape.id)
		const id = regionIdFor(shape)
		if (id) queue(id, source === 'remote' ? 'remote' : 'user')
	})

	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		if (isProjecting(editor)) return
		const repairSource: RepairSource = source === 'remote' ? 'remote' : 'user'
		if (isBehaviorTreeShape(after)) {
			if (before.props !== after.props && (before as BehaviorTreeShape).props.xml === after.props.xml
				&& JSON.stringify({ ...(before as BehaviorTreeShape).props, w: 0, h: 0 }) === JSON.stringify({ ...after.props, w: 0, h: 0 })) return
			if (before.props !== after.props) {
				queue(after.id, repairSource)
				regionRewrittenThisOperation.add(after.id)
			}
			return
		}
		const meta = readBtChildMeta(after)
		if (!meta) return
		const region = behaviorTreeRegionFor(editor, after)
		if (!isBehaviorTreeShape(region)) return
		const regionId = region.id
		if (meta.btRole === 'cable') return
		// A child dragged out of its region comes straight back: the region owns it.
		if (after.parentId !== regionId) {
			queue(regionId, repairSource)
			editor.reparentShapes([after.id], regionId)
			return
		}
		const dragged = !arrived.has(after.id)
		if (dragged && meta.btRole === 'node' && (before.x !== after.x || before.y !== after.y)) {
			// WHY: "auto layout" (item 6, the promoted Tidy toggle,
			// `arrangement === 'tidy'`) means position is never a person's to set
			// by hand — a drag is a request to reorder the model, not a pixel
			// offset. Since the 2026-09-06 Process port this contract covers
			// BOTH diagram views. The reorder gesture itself no longer lives
			// here: dnd-kit owns it end to end (`treeDndDrag.tsx` — Zach's
			// scoped exception to the stock-boundary rule), its claim protocol
			// cancels tldraw's select tool before `select.translating` can
			// engage for a sole tidy node, and its writes arrive under
			// `withoutBehaviorTreeRepair` so this handler never sees them. What
			// CAN still reach this branch natively in tidy is a gesture the dnd
			// lane deliberately leaves to tldraw — a multi-select drag, an
			// alt-clone — and the contract for those is glide-and-settle:
			// remember which region is being glided so the repair pass skips
			// tldraw's shapes while the gesture lasts (two writers on one shape
			// corrupts — the measured `test:tree-drag-reorder` regression) and
			// snaps everything back to the layout on release. The toggle OFF
			// (`'free'`) keeps the exact free-offset behaviour both views always
			// had, with zero dnd-kit involvement.
			if (region.props.arrangement === 'tidy' && isNativelyTranslatingThisShape(editor, after.id)) {
				nativeGlidesFor(editor).set(after.id, regionId)
			} else if (region.props.arrangement !== 'tidy') {
				recordOffset(editor, region, meta[BT_META_PATH], after)
			}
		}
		if (dragged && meta.btRole === 'node' && isBlockShape(after) && isBlockShape(before) && source !== 'remote') {
			compileBlockEdit(editor, region, meta[BT_META_PATH], before, after)
			recordNodeViewOverride(editor, region, meta[BT_META_PATH], after)
		}
		queue(regionId, repairSource)
	})

	const stopDelete = editor.sideEffects.registerAfterDeleteHandler('shape', (shape, source) => {
		if (isProjecting(editor)) return
		if (isBehaviorTreeShape(shape)) {
			// The region's page-level cables go with it.
			const orphans = regionCables(editor, shape.id).map((cable) => cable.id)
			if (orphans.length > 0) editor.deleteShapes(orphans)
			return
		}
		const meta = readBtChildMeta(shape)
		if (!meta || meta.btRole !== 'node') return
		const region = behaviorTreeRegionFor(editor, shape)
		if (!isBehaviorTreeShape(region)) return
		const regionId = region.id
		// WHY: an undo that unwinds an earlier insert removes the shape that
		// insert created — the same store event a real Delete key produces.
		// But by now the region's xml has already been reverted (put runs
		// before remove; see `regionRewrittenThisOperation` above), so this
		// shape's `btPath` is stale: that slot in the *current* xml may
		// already, legitimately, belong to a different, already-restored
		// occurrence. Compiling "delete `path`" here would delete THAT node
		// instead — confirmed live: inserting a sibling mid-tree then undoing
		// once silently dropped an unrelated, already-existing node. Once the
		// region has already been rewritten this operation, trust that
		// rewrite; a reconcile pass (queued below) is enough to catch up any
		// shape bookkeeping that still needs it.
		if (regionRewrittenThisOperation.has(regionId)) {
			queue(regionId, source === 'remote' ? 'remote' : 'user')
			return
		}
		// Delete on a projected node is a semantic delete of that occurrence.
		const result = deleteBehaviorTreeNode(region.props.xml, region.props.treeId, meta[BT_META_PATH])
		if (result.ok) {
			restampChildren(editor, region, result.remap)
			editor.updateShape<BehaviorTreeShape>({
				id: region.id,
				type: BEHAVIOR_TREE_SHAPE_TYPE,
				props: {
					...region.props,
					xml: result.xml,
					offsets: remapByPath(region.props.offsets, result.remap),
					nodeViewOverrides: remapByPath(region.props.nodeViewOverrides, result.remap),
				},
			})
		}
		queue(regionId, source === 'remote' ? 'remote' : 'user')
	})

	const repairPending = () => {
		repairQueued = false
		arrived.clear()
		// A live drag's own writer already reconciled this frame inline with
		// its shapes skipped — dnd-kit's move handler for a claimed reorder
		// (`treeDndDrag.tsx`), nobody for a native glide (which commits no
		// XML). The generic queue below still schedules its OWN follow-up
		// repair for the same region on every frame (the same path the
		// free-offset drag relies on to keep cables in sync), and that one
		// does not know to skip anything. Left alone it re-fights the
		// gesture's writer a moment later on almost every frame — a real
		// corruption `test:tree-drag-reorder` caught, not a hypothetical.
		const stillTranslating = editor.isIn('select.translating')
		const glides = nativeGlidesFor(editor)
		const skipShapeIdsByRegion = new Map<TLShapeId, TLShapeId[]>()
		const dndDrag = btDndDragState.get(editor)
		if (dndDrag) {
			skipShapeIdsByRegion.set(dndDrag.regionId, [dndDrag.shapeId])
		}
		if (stillTranslating) {
			for (const [shapeId, regionId] of glides) {
				const list = skipShapeIdsByRegion.get(regionId)
				if (list) list.push(shapeId)
				else skipShapeIdsByRegion.set(regionId, [shapeId])
			}
		} else if (glides.size > 0) {
			// The glide just ended: snap every natively-translated tidy node
			// back onto the layout the XML dictates, the same settle a claimed
			// drag's drop performs for its own shape in `treeDndDrag.tsx`.
			for (const regionId of new Set(glides.values())) {
				if (isBehaviorTreeShape(editor.getShape(regionId))) {
					editor.run(() => reconcileBehaviorTree(editor, regionId), { history: 'ignore' })
				}
			}
			glides.clear()
		}
		if (disposed) return
		let pass = 0
		while (pending.size > 0 && pass < 3) {
			pass += 1
			const entries = pending
			pending = new Map()
			for (const [id, source] of entries) {
				const skipShapeIds = skipShapeIdsByRegion.get(id)
				const repair = () => {
					if (isBehaviorTreeShape(editor.getShape(id))) reconcileBehaviorTree(editor, id, { skipShapeIds })
				}
				if (source === 'remote') editor.store.mergeRemoteChanges(repair)
				else editor.run(repair, { history: 'ignore' })
			}
		}
	}
	const scheduleRepair = () => {
		if (repairQueued || disposed) return
		repairQueued = true
		queueMicrotask(repairPending)
	}
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
		regionRewrittenThisOperation.clear()
		if (pending.size > 0) scheduleRepair()
		else arrived.clear()
	})

	// WHY: the settle branch in `repairPending` (the `!stillTranslating` path
	// that snaps a natively-glided node back onto its tidy slot and clears
	// the glide records) only runs when a repair runs — and the
	// operation-complete handler above only schedules one when `pending` is
	// non-empty. A clean mouseup writes no BT shape change (the last pointer
	// MOVE did), so the release itself queues nothing and the settle starves:
	// the glided card sat at the raw pointer position, its wires snapped to
	// the tidy anchor without it, until any later BT store activity happened
	// to run a repair (`wire.settles-on-drop` in
	// `behavior_tree_drag_polish_smoke.mjs` measured exactly this on the
	// observer path's drops). This reactor watches the one signal that
	// actually changes on a clean release — the state chart leaving
	// `select.translating` — and wakes the repair while glide records exist.
	// A claimed dnd-kit drag needs none of this: its own `onDragEnd` settles
	// synchronously in `treeDndDrag.tsx`. `scheduleRepair` alone is enough:
	// the settle branch runs before the `pending` drain, so seeding `pending`
	// here would only queue a redundant second reconcile.
	const stopSettle = react('behavior tree: settle after drag', () => {
		if (editor.isIn('select.translating')) return
		if (nativeGlidesFor(editor).size === 0) return
		scheduleRepair()
	})

	editor.store.mergeRemoteChanges(() => {
		for (const record of editor.store.allRecords()) {
			if (record.typeName !== 'shape') continue
			const shape = editor.getShape(record.id as TLShapeId)
			if (isBehaviorTreeShape(shape)) reconcileBehaviorTree(editor, shape.id)
		}
	})

	// Run-mode lifecycle rides the same install: XML drift under a live mock
	// run stops it (stale), and a deleted region tears its run down.
	const stopRunStore = installBtRunStore(editor)

	return () => {
		disposed = true
		stopCreate()
		stopChange()
		stopDelete()
		stopComplete()
		stopSettle()
		stopRunStore()
	}
}

/** Carry a per-path presentation dict (an offset, a node view override) across a structural edit's remap. */
function remapByPath<T>(dict: Record<string, T>, remap: Record<string, string>): Record<string, T> {
	const next: Record<string, T> = {}
	for (const [path, value] of Object.entries(dict)) {
		const to = remap[path]
		if (to !== undefined) next[to] = value
	}
	return next
}

function restampChildren(editor: Editor, region: BehaviorTreeShape, remap: Record<string, string>) {
	const updates: Array<{ id: TLShapeId; type: string; meta: Record<string, unknown> }> = []
	for (const id of editor.getSortedChildIdsForParent(region.id)) {
		const child = editor.getShape(id)
		const meta = readBtChildMeta(child)
		if (!child || !meta || meta.btRole !== 'node') continue
		const to = remap[meta[BT_META_PATH]]
		if (to !== undefined && to !== meta[BT_META_PATH]) updates.push({ id: child.id, type: child.type, meta: { ...child.meta, [BT_META_PATH]: to } })
	}
	if (updates.length > 0) editor.updateShapes(updates as never)
}

/** A drag moved a node: remember how far it sits from its tidy place. */
function recordOffset(editor: Editor, region: BehaviorTreeShape, path: string, shape: TLShape) {
	const projection = projectBehaviorTree(region.props)
	const tidy = projection.nodeRects.get(path)
	if (!tidy) return
	const offset = region.props.offsets[path] ?? { dx: 0, dy: 0 }
	const dx = shape.x - (tidy.x - offset.dx)
	const dy = shape.y - (tidy.y - offset.dy)
	if (Math.abs(dx - offset.dx) < 0.01 && Math.abs(dy - offset.dy) < 0.01) return
	const offsets = { ...region.props.offsets }
	if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) delete offsets[path]
	else offsets[path] = { dx, dy }
	editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, offsets } })
}

/**
 * The tidy-node shapes tldraw's own translate is gliding right now, mapped
 * to their regions. Only gestures the dnd drag lane deliberately leaves
 * native land here — a multi-select drag, an alt-clone — because
 * `treeDndDrag.tsx` claims every sole-node reorder gesture for dnd-kit
 * before tldraw's translate can own it. A glide commits nothing: the shapes
 * ride the pointer while the repair pass skips them, and the settle in
 * `repairPending` snaps them back onto the layout the XML dictates the
 * moment `select.translating` ends. The reorder machinery that used to live
 * here (per-shape sessions, frozen base XML, baseline restamps) moved to
 * `treeDndDrag.tsx` with the gesture itself.
 */
const nativeGlides = new WeakMap<Editor, Map<TLShapeId, TLShapeId>>()

function nativeGlidesFor(editor: Editor): Map<TLShapeId, TLShapeId> {
	let map = nativeGlides.get(editor)
	if (!map) {
		map = new Map()
		nativeGlides.set(editor, map)
	}
	return map
}

/** A title or port value typed on the projected Block becomes an XML attribute. */
function compileBlockEdit(editor: Editor, region: BehaviorTreeShape, path: string, before: BlockShape, after: BlockShape) {
	let xml = region.props.xml
	let changed = false
	if (before.props.title !== after.props.title) {
		const result = setBehaviorTreeNodeAttribute(xml, region.props.treeId, path, 'name', after.props.title.trim())
		if (result.ok) {
			xml = result.xml
			changed = true
		}
	}
	for (const port of after.props.inputs) {
		const previous = before.props.inputs.find((candidate) => candidate.id === port.id)
		if (!previous || previous.defaultValue === port.defaultValue || !port.id.startsWith(BT_IN_PORT)) continue
		const result = setBehaviorTreeNodeAttribute(xml, region.props.treeId, path, port.id.slice(BT_IN_PORT.length), port.defaultValue ?? '')
		if (result.ok) {
			xml = result.xml
			changed = true
		}
	}
	if (changed) editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml } })
}

/**
 * Item 2: a leaf set to Expanded from the ordinary Block view pill disagrees
 * with the region's own `nodeFace` on purpose — `desiredRecordProps` would
 * otherwise stomp it back to Simple/Port on the very next repair, since the
 * projection always wins there. Remembering the box on the REGION (not the
 * child) keeps that invariant intact: once `nodeViewOverrides` carries this
 * path, `leafBlockProps` computes the very `view`/`views` the child already
 * has, so the repair that follows is a no-op for it and only the surrounding
 * rails/wires (which now read the real box via `nodeViewOverrides`) move.
 * Reverting the pill to Simple or Port forgets the override the same way.
 */
function recordNodeViewOverride(editor: Editor, region: BehaviorTreeShape, path: string, after: BlockShape) {
	const existing = region.props.nodeViewOverrides[path]
	if (after.props.view === 'expanded') {
		if (existing?.view === 'expanded' && existing.w === after.props.w && existing.h === after.props.h) return
		const nodeViewOverrides = { ...region.props.nodeViewOverrides, [path]: { view: 'expanded', w: after.props.w, h: after.props.h } }
		editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, nodeViewOverrides } })
		return
	}
	if (!existing) return
	const nodeViewOverrides = { ...region.props.nodeViewOverrides }
	delete nodeViewOverrides[path]
	editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, nodeViewOverrides } })
}
