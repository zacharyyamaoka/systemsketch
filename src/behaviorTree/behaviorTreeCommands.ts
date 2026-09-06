/**
 * Every gesture on a Behavior Tree — inspector, selection pill, on-canvas
 * "+", Delete key, a title typed on a projected Block — writes through here.
 * Each command is one public Editor mutation with a history label: the XML
 * changes, child identities are re-stamped by the edit's remap, and the
 * projection is repaired inside the same transaction so undo is one step.
 */
import { createShapeId, isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { isBlockShape } from '../blocks'
import {
	BEHAVIOR_TREE_SHAPE_TYPE,
	BT_META_PATH,
	getDefaultBehaviorTreeProps,
	isBehaviorTreeShape,
	readBtChildMeta,
	type BehaviorTreeShape,
	type BehaviorTreeShapeProps,
} from './behaviorTreeModel'
import { reconcileBehaviorTree } from './installBehaviorTreeRegions'
import { applyMockPresetToXml, setMockParamsInXml, type BtMockPreset } from './runtime/mockParams'
import {
	deleteBehaviorTreeNode,
	insertBehaviorTreeNode,
	insertBehaviorTreeSibling,
	moveBehaviorTreeNode,
	parseBehaviorTreeXml,
	renameBehaviorTreeKey,
	selectTree,
	setBehaviorTreeNodeAttribute,
	unwrapBehaviorTreeNode,
	wrapBehaviorTreeNode,
	type BtEditResult,
	type BtInsertTemplate,
	type BtNode,
} from './btcppXml'

export interface BtSelection {
	region: BehaviorTreeShape
	/** The selected occurrence, or null when the region itself is selected. */
	path: string | null
	child: TLShape | null
}

/** The region behind the selection: itself, or the parent of one selected child. */
export function getSelectedBehaviorTree(editor: Editor): BtSelection | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1) return null
	const shape = selected[0]
	if (isBehaviorTreeShape(shape)) return { region: shape, path: null, child: null }
	const meta = readBtChildMeta(shape)
	if (!meta || !isShapeId(shape.parentId)) return null
	const region = editor.getShape(shape.parentId)
	if (!isBehaviorTreeShape(region)) return null
	return { region, path: meta.btRole === 'node' ? meta[BT_META_PATH] : null, child: shape }
}

export function regionOfChild(editor: Editor, shape: TLShape): BehaviorTreeShape | null {
	if (!readBtChildMeta(shape) || !isShapeId(shape.parentId)) return null
	const region = editor.getShape(shape.parentId)
	return isBehaviorTreeShape(region) ? region : null
}

export function selectedTreeNode(editor: Editor): { region: BehaviorTreeShape; node: BtNode } | null {
	const selection = getSelectedBehaviorTree(editor)
	if (!selection || selection.path === null) return null
	const tree = selectTree(parseBehaviorTreeXml(selection.region.props.xml), selection.region.props.treeId)
	const node = tree?.nodes.find((candidate) => candidate.path === selection.path) ?? null
	return node ? { region: selection.region, node } : null
}

export function childShapeForPath(editor: Editor, regionId: TLShapeId, path: string): TLShape | null {
	for (const id of editor.getSortedChildIdsForParent(regionId)) {
		const shape = editor.getShape(id)
		const meta = readBtChildMeta(shape)
		if (meta && meta.btRole === 'node' && meta[BT_META_PATH] === path) return shape ?? null
	}
	return null
}

/* --------------------------------- views ---------------------------------- */

export type BtViewPatch = Partial<Pick<BehaviorTreeShapeProps,
	'projection' | 'orientation' | 'nodeFace' | 'controlFace' | 'edgeStyle' | 'dataLens' | 'blackboardLayout' | 'controlWireOpacity' | 'title' | 'treeId'
>>

export function setBehaviorTreeView(editor: Editor, regionId: TLShapeId, patch: BtViewPatch, historyLabel = 'behavior tree view'): boolean {
	const region = editor.getShape(regionId)
	if (!isBehaviorTreeShape(region)) return false
	const next = { ...region.props, ...patch }
	if (Object.keys(patch).every((key) => (region.props as Record<string, unknown>)[key] === (next as Record<string, unknown>)[key])) return false
	editor.run(() => {
		editor.markHistoryStoppingPoint(historyLabel)
		editor.updateShape<BehaviorTreeShape>({ id: regionId, type: BEHAVIOR_TREE_SHAPE_TYPE, props: next })
		reconcileBehaviorTree(editor, regionId)
	})
	return true
}

/** Tidy: forget every free-arrangement offset; the XML is untouched. */
export function tidyBehaviorTree(editor: Editor, regionId: TLShapeId): boolean {
	const region = editor.getShape(regionId)
	if (!isBehaviorTreeShape(region)) return false
	if (Object.keys(region.props.offsets).length === 0) return false
	editor.run(() => {
		editor.markHistoryStoppingPoint('tidy behavior tree')
		editor.updateShape<BehaviorTreeShape>({ id: regionId, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, offsets: {} } })
		reconcileBehaviorTree(editor, regionId)
	})
	return true
}

/** The explicit Apply from the XML source editor. Returns parse diagnostics. */
export function applyBehaviorTreeXml(editor: Editor, regionId: TLShapeId, xml: string): { ok: boolean; error: string | null } {
	const region = editor.getShape(regionId)
	if (!isBehaviorTreeShape(region)) return { ok: false, error: 'No Behavior Tree selected' }
	const parsed = parseBehaviorTreeXml(xml)
	if (parsed.parseError) return { ok: false, error: parsed.parseError }
	if (xml === region.props.xml) return { ok: true, error: null }
	editor.run(() => {
		editor.markHistoryStoppingPoint('edit behavior tree xml')
		editor.updateShape<BehaviorTreeShape>({ id: regionId, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml } })
		reconcileBehaviorTree(editor, regionId)
	})
	return { ok: true, error: null }
}

/* ------------------------------- structure -------------------------------- */

export type BtCommandResult = { ok: true; path: string; shapeId: TLShapeId | null } | { ok: false; reason: string }

/**
 * Apply one XML edit: re-stamp surviving children with their new paths, carry
 * their free offsets, write the XML, repair the projection, select the result.
 */
function applyEdit(editor: Editor, region: BehaviorTreeShape, result: BtEditResult, historyLabel: string, selectPath?: string): BtCommandResult {
	if (!result.ok) return { ok: false, reason: result.reason }
	let selectedId: TLShapeId | null = null
	editor.run(() => {
		editor.markHistoryStoppingPoint(historyLabel)
		const remap = result.remap
		const restamps: Array<{ id: TLShapeId; type: string; meta: Record<string, unknown> }> = []
		for (const id of editor.getSortedChildIdsForParent(region.id)) {
			const child = editor.getShape(id)
			const meta = readBtChildMeta(child)
			if (!child || !meta || meta.btRole !== 'node') continue
			const to = remap[meta[BT_META_PATH]]
			if (to !== undefined && to !== meta[BT_META_PATH]) {
				restamps.push({ id: child.id, type: child.type, meta: { ...child.meta, [BT_META_PATH]: to } })
			}
		}
		if (restamps.length > 0) editor.updateShapes(restamps as never)
		const offsets: Record<string, { dx: number; dy: number }> = {}
		for (const [path, offset] of Object.entries(region.props.offsets)) {
			const to = remap[path]
			if (to !== undefined) offsets[to] = offset
		}
		editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml: result.xml, offsets } })
		reconcileBehaviorTree(editor, region.id)
		const target = childShapeForPath(editor, region.id, selectPath ?? result.path)
		if (target) {
			selectedId = target.id
			editor.select(target.id)
		}
	})
	return { ok: true, path: result.path, shapeId: selectedId }
}

function regionOrFail(editor: Editor, regionId: TLShapeId): BehaviorTreeShape | null {
	const region = editor.getShape(regionId)
	return isBehaviorTreeShape(region) ? region : null
}

export function insertBehaviorTreeChild(editor: Editor, regionId: TLShapeId, parentPath: string | null, index: number, template: BtInsertTemplate): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = insertBehaviorTreeNode(region.props.xml, region.props.treeId, parentPath, index, template)
	return applyEdit(editor, region, result, `add ${template.id}`)
}

export function insertBehaviorTreeSiblingOf(editor: Editor, regionId: TLShapeId, path: string, after: boolean, template: BtInsertTemplate): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = insertBehaviorTreeSibling(region.props.xml, region.props.treeId, path, after, template)
	return applyEdit(editor, region, result, `add ${template.id}`)
}

export function deleteBehaviorTreeOccurrence(editor: Editor, regionId: TLShapeId, path: string): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = deleteBehaviorTreeNode(region.props.xml, region.props.treeId, path)
	const outcome = applyEdit(editor, region, result, 'delete node')
	if (outcome.ok && !outcome.shapeId) editor.select(regionId)
	return outcome
}

export function wrapBehaviorTreeOccurrence(editor: Editor, regionId: TLShapeId, path: string, template: BtInsertTemplate): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = wrapBehaviorTreeNode(region.props.xml, region.props.treeId, path, template)
	return applyEdit(editor, region, result, `wrap in ${template.id}`)
}

export function unwrapBehaviorTreeOccurrence(editor: Editor, regionId: TLShapeId, path: string): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = unwrapBehaviorTreeNode(region.props.xml, region.props.treeId, path)
	return applyEdit(editor, region, result, 'unwrap node')
}

/** Move one step earlier or later among its siblings. */
export function nudgeBehaviorTreeOccurrence(editor: Editor, regionId: TLShapeId, path: string, direction: -1 | 1): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const segments = path.split('.')
	if (segments.length < 2) return { ok: false, reason: 'The root has no siblings' }
	const parentPath = segments.slice(0, -1).join('.')
	const index = Number.parseInt(segments[segments.length - 1], 10)
	const targetIndex = direction === -1 ? index - 1 : index + 2
	if (targetIndex < 0) return { ok: false, reason: 'Already first' }
	const result = moveBehaviorTreeNode(region.props.xml, region.props.treeId, path, parentPath, targetIndex)
	return applyEdit(editor, region, result, direction === -1 ? 'move node earlier' : 'move node later')
}

export function moveBehaviorTreeOccurrenceTo(editor: Editor, regionId: TLShapeId, path: string, parentPath: string, index: number): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = moveBehaviorTreeNode(region.props.xml, region.props.treeId, path, parentPath, index)
	return applyEdit(editor, region, result, 'move node')
}

/**
 * Flowstate's "Add failure recovery": the node becomes the first child of a
 * Fallback whose second child is the recovery, which starts as a Sequence so
 * more steps can follow.
 */
export function addBehaviorTreeFailureRecovery(editor: Editor, regionId: TLShapeId, path: string, recovery: BtInsertTemplate = { id: 'Sequence', kind: 'control' }): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const wrapped = wrapBehaviorTreeNode(region.props.xml, region.props.treeId, path, { id: 'Fallback', kind: 'control' })
	if (!wrapped.ok) return { ok: false, reason: wrapped.reason }
	const withRecovery = insertBehaviorTreeNode(wrapped.xml, region.props.treeId, path, 1, recovery)
	if (!withRecovery.ok) return { ok: false, reason: withRecovery.reason }
	const remap: Record<string, string> = {}
	for (const [from, mid] of Object.entries(wrapped.remap)) {
		const to = withRecovery.remap[mid]
		if (to !== undefined) remap[from] = to
	}
	return applyEdit(editor, region, { ok: true, xml: withRecovery.xml, path: withRecovery.path, remap }, 'add failure recovery')
}

export function setBehaviorTreeNodeName(editor: Editor, regionId: TLShapeId, path: string, name: string): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = setBehaviorTreeNodeAttribute(region.props.xml, region.props.treeId, path, 'name', name)
	return applyEdit(editor, region, result, 'rename node', path)
}

export function setBehaviorTreePortValue(editor: Editor, regionId: TLShapeId, path: string, port: string, value: string | null): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = setBehaviorTreeNodeAttribute(region.props.xml, region.props.treeId, path, port, value)
	return applyEdit(editor, region, result, 'edit port', path)
}

export function renameBehaviorTreeBlackboardKey(editor: Editor, regionId: TLShapeId, from: string, to: string): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	if (from === to) return { ok: true, path: '0', shapeId: null }
	const result = renameBehaviorTreeKey(region.props.xml, region.props.treeId, from, to)
	const outcome = applyEdit(editor, region, result, 'rename key')
	if (outcome.ok) editor.select(regionId)
	return outcome
}

/* -------------------------------- creation -------------------------------- */

/** Put a new region on the current page with this XML, projected and selected. */
export function createBehaviorTreeRegion(editor: Editor, xml: string, at: { x: number; y: number }, patch: Partial<BehaviorTreeShapeProps> = {}): TLShapeId {
	const id = createShapeId()
	const document = parseBehaviorTreeXml(xml)
	const title = patch.title ?? document.mainTreeId ?? 'Behavior Tree'
	editor.run(() => {
		editor.markHistoryStoppingPoint('create behavior tree')
		editor.createShape<BehaviorTreeShape>({
			id,
			type: BEHAVIOR_TREE_SHAPE_TYPE,
			x: at.x,
			y: at.y,
			props: { ...getDefaultBehaviorTreeProps(), ...patch, xml, title },
		})
		reconcileBehaviorTree(editor, id)
		editor.select(id)
	})
	return id
}

/** Whether a Block on the page is one of a region's projected leaves. */
export function isProjectedBehaviorTreeBlock(editor: Editor, shape: TLShape): boolean {
	return isBlockShape(shape) && regionOfChild(editor, shape) !== null
}

/* ------------------------------- mock params -------------------------------- */

/**
 * Authored mock-profile edits. These change the XML but never the tree's
 * structure, so no child is re-stamped and free offsets stay put — they are
 * ordinary one-step-undo document writes, exactly like a port value.
 */
export function setBehaviorTreeMockParams(
	editor: Editor,
	regionId: TLShapeId,
	skillId: string,
	kind: BtNode['kind'],
	params: { successChance?: number | null; durationMs?: number | null },
): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const result = setMockParamsInXml(region.props.xml, skillId, kind, params)
	if (!result.ok) return { ok: false, reason: result.reason }
	editor.run(() => {
		editor.markHistoryStoppingPoint('edit mock params')
		editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml: result.xml } })
	})
	return { ok: true, path: '', shapeId: null }
}

/** Apply a preset: one bulk authored write over every leaf the tree uses. */
export function applyBehaviorTreeMockPreset(editor: Editor, regionId: TLShapeId, preset: BtMockPreset): BtCommandResult {
	const region = regionOrFail(editor, regionId)
	if (!region) return { ok: false, reason: 'No Behavior Tree' }
	const document = parseBehaviorTreeXml(region.props.xml)
	const result = applyMockPresetToXml(region.props.xml, document, region.props.treeId || document.mainTreeId, preset)
	if (!result.ok) return { ok: false, reason: result.reason }
	editor.run(() => {
		editor.markHistoryStoppingPoint(`mock preset ${preset}`)
		editor.updateShape<BehaviorTreeShape>({ id: region.id, type: BEHAVIOR_TREE_SHAPE_TYPE, props: { ...region.props, xml: result.xml } })
	})
	return { ok: true, path: '', shapeId: null }
}
