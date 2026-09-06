/**
 * The mutual-exclusivity boundary of the Behavior Tree's second drag system
 * (`treeDndDrag.tsx`), tested at its decision point: `treeDndClaimTarget`
 * answers "may dnd-kit own this press?" and everything it declines stays
 * byte-identical native tldraw. The full gesture — the mounted DndContext,
 * the cancel hand-off, the live reorder — is proven in a real browser by
 * `tests/behavior_tree_dual_drag_smoke.mjs` and the two existing drag
 * journeys; what belongs here is the truth table of the claim itself.
 */
import { describe, expect, it } from 'vitest'
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import { BEHAVIOR_TREE_SHAPE_TYPE, BT_META_PATH, BT_META_REGION, btChildMeta } from './behaviorTreeModel'
import { treeDndClaimTarget } from './treeDndDrag'

const REGION_ID = 'shape:region' as TLShapeId
const NODE_ID = 'shape:node' as TLShapeId
const ARROW_ID = 'shape:arrow' as TLShapeId
const OTHER_ID = 'shape:other' as TLShapeId

interface FakeEditorConfig {
	arrangement?: 'tidy' | 'free'
	projection?: 'tree' | 'process'
	/** What the select tool's own hit test returns for the press. */
	hit?: 'node' | 'arrow' | 'region' | null
	statePath?: string
	readonly?: boolean
	panning?: boolean
	selectedIds?: TLShapeId[]
	/** Whether the press lands inside a multi-selection's rotated bounds. */
	pressInsideSelectionBounds?: boolean
	nodeRole?: 'node' | 'key'
}

function fakeEditor(config: FakeEditorConfig = {}): Editor {
	const {
		arrangement = 'tidy',
		projection = 'tree',
		hit = 'node',
		statePath = 'select.idle',
		readonly = false,
		panning = false,
		selectedIds = [],
		pressInsideSelectionBounds = false,
		nodeRole = 'node',
	} = config
	const region: TLShape = {
		id: REGION_ID,
		typeName: 'shape',
		type: BEHAVIOR_TREE_SHAPE_TYPE,
		parentId: 'page:page',
		x: 0, y: 0, rotation: 0, index: 'a1', isLocked: false, opacity: 1,
		meta: {},
		props: { projection, arrangement },
	} as unknown as TLShape
	const node: TLShape = {
		id: NODE_ID,
		typeName: 'shape',
		type: 'block',
		parentId: REGION_ID,
		x: 10, y: 10, rotation: 0, index: 'a1', isLocked: false, opacity: 1,
		meta: btChildMeta(REGION_ID, '0.1', nodeRole as never) as never,
		props: { w: 100, h: 40 },
	} as unknown as TLShape
	const arrow: TLShape = {
		id: ARROW_ID,
		typeName: 'shape',
		type: 'arrow',
		parentId: 'page:page',
		x: 0, y: 0, rotation: 0, index: 'a2', isLocked: false, opacity: 1,
		meta: {},
		props: {},
	} as unknown as TLShape
	const shapes = new Map<string, TLShape>([
		[REGION_ID, region],
		[NODE_ID, node],
		[ARROW_ID, arrow],
	])
	const hitShape = hit === 'node' ? node : hit === 'arrow' ? arrow : hit === 'region' ? region : undefined
	return {
		getIsReadonly: () => readonly,
		isIn: (path: string) => statePath === path || statePath.startsWith(`${path}.`),
		inputs: { getIsPanning: () => panning },
		options: { selectLockedShapes: false },
		getHitTestMargin: () => 4,
		screenToPage: (point: { x: number; y: number }) => point,
		getShapeAtPoint: () => hitShape,
		getSelectedShapeAtPoint: () => undefined,
		isShapeOrAncestorLocked: () => false,
		getShape: (id: TLShapeId) => shapes.get(id),
		getSelectedShapeIds: () => selectedIds,
		getSelectionRotatedPageBounds: () =>
			selectedIds.length > 0 ? { containsPoint: () => pressInsideSelectionBounds } : undefined,
		findShapeAncestor: (shape: TLShape, predicate: (ancestor: TLShape) => boolean) => {
			let parent = shapes.get(shape.parentId as string)
			while (parent) {
				if (predicate(parent)) return parent
				parent = shapes.get(parent.parentId as string)
			}
			return undefined
		},
	} as unknown as Editor
}

const PLAIN_PRESS = {
	button: 0,
	isPrimary: true,
	shiftKey: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
}
const POINT = { x: 50, y: 30 }

describe('treeDndClaimTarget — the dual-drag ownership boundary', () => {
	it('claims a plain primary press on a tidy Tree diagram node', () => {
		const target = treeDndClaimTarget(fakeEditor(), POINT, PLAIN_PRESS)
		expect(target?.shape.id).toBe(NODE_ID)
		expect(target?.region.id).toBe(REGION_ID)
		expect(target?.path).toBe('0.1')
	})

	it('claims when the node is already the sole selection', () => {
		const target = treeDndClaimTarget(fakeEditor({ selectedIds: [NODE_ID] }), POINT, PLAIN_PRESS)
		expect(target?.shape.id).toBe(NODE_ID)
	})

	it('claims when one unrelated shape is selected (the press re-selects the node)', () => {
		const target = treeDndClaimTarget(fakeEditor({ selectedIds: [OTHER_ID] }), POINT, PLAIN_PRESS)
		expect(target?.shape.id).toBe(NODE_ID)
	})

	it('declines when auto-layout is off — the region is a plain whiteboard again', () => {
		expect(treeDndClaimTarget(fakeEditor({ arrangement: 'free' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it("claims Process view too — Zach's 2026-09-06 follow-up extended the exception to both diagram projections", () => {
		const target = treeDndClaimTarget(fakeEditor({ projection: 'process' }), POINT, PLAIN_PRESS)
		expect(target?.shape.id).toBe(NODE_ID)
	})

	it('declines Process view with auto-layout off — same whiteboard rule as Tree', () => {
		expect(treeDndClaimTarget(fakeEditor({ projection: 'process', arrangement: 'free' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it("declines when tldraw's own hit test gives the press to a whiteboard arrow drawn over the node", () => {
		expect(treeDndClaimTarget(fakeEditor({ hit: 'arrow' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines a press on the region itself', () => {
		expect(treeDndClaimTarget(fakeEditor({ hit: 'region' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines empty canvas', () => {
		expect(treeDndClaimTarget(fakeEditor({ hit: null }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines a blackboard child (role is not node)', () => {
		expect(treeDndClaimTarget(fakeEditor({ nodeRole: 'key' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines every modified or non-primary press', () => {
		for (const press of [
			{ ...PLAIN_PRESS, button: 1 },
			{ ...PLAIN_PRESS, button: 2 },
			{ ...PLAIN_PRESS, isPrimary: false },
			{ ...PLAIN_PRESS, shiftKey: true },
			{ ...PLAIN_PRESS, ctrlKey: true },
			{ ...PLAIN_PRESS, metaKey: true },
			{ ...PLAIN_PRESS, altKey: true },
		]) {
			expect(treeDndClaimTarget(fakeEditor(), POINT, press)).toBeNull()
		}
	})

	it('declines when another tool (or a non-idle select state) owns the pointer', () => {
		expect(treeDndClaimTarget(fakeEditor({ statePath: 'arrow.idle' }), POINT, PLAIN_PRESS)).toBeNull()
		expect(treeDndClaimTarget(fakeEditor({ statePath: 'select.editing_shape' }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines during a pan and in a read-only editor', () => {
		expect(treeDndClaimTarget(fakeEditor({ panning: true }), POINT, PLAIN_PRESS)).toBeNull()
		expect(treeDndClaimTarget(fakeEditor({ readonly: true }), POINT, PLAIN_PRESS)).toBeNull()
	})

	it('declines a node inside a multi-selection — that drag translates the selection, natively', () => {
		expect(
			treeDndClaimTarget(fakeEditor({ selectedIds: [NODE_ID, OTHER_ID] }), POINT, PLAIN_PRESS),
		).toBeNull()
	})

	it("declines a press inside a multi-selection's bounds — PointingShape translates the selection", () => {
		expect(
			treeDndClaimTarget(
				fakeEditor({ selectedIds: [OTHER_ID, ARROW_ID], pressInsideSelectionBounds: true }),
				POINT,
				PLAIN_PRESS,
			),
		).toBeNull()
	})

	it('declines when an ancestor (the region) is selected — that drag moves the region', () => {
		expect(
			treeDndClaimTarget(fakeEditor({ selectedIds: [REGION_ID] }), POINT, PLAIN_PRESS),
		).toBeNull()
	})
})
