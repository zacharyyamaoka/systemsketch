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
	type Editor,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockShape } from '../blocks'
import { createOrUpdateConnectionBinding } from '../blocks/connections/ConnectionBindingUtil'
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
import { deleteBehaviorTreeNode, setBehaviorTreeNodeAttribute } from './btcppXml'

/** True while a projection is writing children, so its writes are not read as gestures. */
const projecting = new WeakMap<Editor, number>()

function isProjecting(editor: Editor): boolean {
	return (projecting.get(editor) ?? 0) > 0
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
export function reconcileBehaviorTree(editor: Editor, regionId: TLShapeId): BtRepairReport {
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
					if (Math.abs(current.x - child.x) > 0.01 || Math.abs(current.y - child.y) > 0.01 || !sameProps(current.props as Record<string, unknown>, wanted)) {
						editor.updateShape({ id: current.id, type: current.type, x: child.x, y: child.y, props: wanted } as never)
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

/** Every Dataflow cable this region projected, wherever the connection layer parented it. */
export function regionCables(editor: Editor, regionId: TLShapeId): TLShape[] {
	return editor.getCurrentPageShapes().filter((shape) => {
		const meta = readBtChildMeta(shape)
		return meta !== null && meta.btRole === 'cable' && meta[BT_META_REGION] === regionId
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
		const meta = readBtChildMeta(shape)
		if (meta && isShapeId(meta[BT_META_REGION])) return meta[BT_META_REGION] as TLShapeId
		return null
	}

	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (isProjecting(editor)) return
		const id = regionIdFor(shape)
		if (id) queue(id, source === 'remote' ? 'remote' : 'user')
	})

	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		if (isProjecting(editor)) return
		const repairSource: RepairSource = source === 'remote' ? 'remote' : 'user'
		if (isBehaviorTreeShape(after)) {
			if (before.props !== after.props && (before as BehaviorTreeShape).props.xml === after.props.xml
				&& JSON.stringify({ ...(before as BehaviorTreeShape).props, w: 0, h: 0 }) === JSON.stringify({ ...after.props, w: 0, h: 0 })) return
			if (before.props !== after.props) queue(after.id, repairSource)
			return
		}
		const meta = readBtChildMeta(after)
		if (!meta) return
		const regionId = meta[BT_META_REGION] as TLShapeId
		const region = editor.getShape(regionId)
		if (!isBehaviorTreeShape(region)) return
		if (meta.btRole === 'cable') return
		// A child dragged out of its region comes straight back: the region owns it.
		if (after.parentId !== region.id) {
			queue(regionId, repairSource)
			editor.reparentShapes([after.id], region.id)
			return
		}
		if (meta.btRole === 'node' && (before.x !== after.x || before.y !== after.y)) {
			recordOffset(editor, region, meta[BT_META_PATH], after)
		}
		if (meta.btRole === 'node' && isBlockShape(after) && isBlockShape(before) && source !== 'remote') {
			compileBlockEdit(editor, region, meta[BT_META_PATH], before, after)
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
		const regionId = meta[BT_META_REGION] as TLShapeId
		const region = editor.getShape(regionId)
		if (!isBehaviorTreeShape(region)) return
		// Delete on a projected node is a semantic delete of that occurrence.
		const result = deleteBehaviorTreeNode(region.props.xml, region.props.treeId, meta[BT_META_PATH])
		if (result.ok) {
			restampChildren(editor, region, result.remap)
			editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml: result.xml, offsets: remapOffsets(region.props.offsets, result.remap) } })
		}
		queue(regionId, source === 'remote' ? 'remote' : 'user')
	})

	const repairPending = () => {
		repairQueued = false
		if (disposed) return
		let pass = 0
		while (pending.size > 0 && pass < 3) {
			pass += 1
			const entries = pending
			pending = new Map()
			for (const [id, source] of entries) {
				const repair = () => {
					if (isBehaviorTreeShape(editor.getShape(id))) reconcileBehaviorTree(editor, id)
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
		if (pending.size > 0) scheduleRepair()
	})

	editor.store.mergeRemoteChanges(() => {
		for (const record of editor.store.allRecords()) {
			if (record.typeName !== 'shape') continue
			const shape = editor.getShape(record.id as TLShapeId)
			if (isBehaviorTreeShape(shape)) reconcileBehaviorTree(editor, shape.id)
		}
	})

	return () => {
		disposed = true
		stopCreate()
		stopChange()
		stopDelete()
		stopComplete()
	}
}

function remapOffsets(offsets: Record<string, { dx: number; dy: number }>, remap: Record<string, string>) {
	const next: Record<string, { dx: number; dy: number }> = {}
	for (const [path, offset] of Object.entries(offsets)) {
		const to = remap[path]
		if (to !== undefined) next[to] = offset
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
