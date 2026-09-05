/**
 * Lower a Behavior Tree region to stock tldraw records.
 *
 * The honest generalisation of "detach": a projected child is not a thing a
 * person authored — its truth is the region's XML — so a child cannot be
 * detached on its own. The *region* can, and when it is, every occurrence in
 * it goes down with it: leaves and Blackboard pills through the ordinary Block
 * detach, Dataflow cables through the ordinary connection detach, and the
 * layer the region paints for itself — control cards, wires, rails, merge
 * marks, chips, group boxes and Start — through `behaviorTreePrimitives`.
 *
 * The region becomes a stock **frame**, not a group: it clips nothing a
 * projection ever put outside its own bounds, it keeps the header band and the
 * title as a first-class stock affordance, and it is the record a future
 * importer reads the canonical XML back out of.
 */
import {
	createShapeId,
	type Editor,
	type TLShapeId,
} from 'tldraw'

import { isBlockShape } from '../blocks/blockModel'
import { CONNECTION_SHAPE_TYPE } from '../blocks/connections/connectionModel'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'
import { detachBlockToPrimitives, detachConnectionToArrow } from '../blocks/detach/detachBlock'
import { DETACH_FORMAT_VERSION, toJsonSafe } from '../blocks/detach/detachModel'
import {
	liftContainerPartial,
	shapePoseInPrimitiveParent,
	unframedPrimitiveParentId,
} from '../blocks/detach/primitiveSpace'
import {
	BT_META_PATH,
	BT_META_REGION,
	BT_META_ROLE,
	isBehaviorTreeShape,
} from './behaviorTreeModel'
import { behaviorTreePrimitives } from './btPrimitives'
import { regionCables, withoutBehaviorTreeRepair } from './installBehaviorTreeRegions'

export interface DetachedBehaviorTreePrimitives {
	/** The stock frame that replaced the region. */
	frameId: TLShapeId
	/** Every top-level record now inside it. */
	childIds: TLShapeId[]
	/** Occurrences that went through the ordinary Block detach. */
	detachedBlocks: number
	/** Dataflow cables that became stock arrows. */
	detachedCables: number
}

/** Remove this region's stamps from a record so no installer re-adopts it. */
function stripBehaviorTreeMeta(editor: Editor, id: TLShapeId): void {
	const shape = editor.getShape(id)
	if (!shape) return
	const meta = shape.meta as Record<string, unknown>
	if (meta[BT_META_REGION] === undefined && meta[BT_META_ROLE] === undefined) return
	const next: Record<string, unknown> = { ...meta }
	// WHY: tldraw's update merge can add a meta key but never remove one, and
	// writing `undefined` would leave the key present holding a value `meta`'s
	// `T.jsonValue` refuses. Replacing the record is the only way to forget.
	delete next[BT_META_REGION]
	delete next[BT_META_PATH]
	delete next[BT_META_ROLE]
	editor.store.update(shape.id, (record) => ({ ...record, meta: next } as typeof record))
}

function withDescendants(editor: Editor, id: TLShapeId, out: TLShapeId[]): void {
	out.push(id)
	for (const childId of editor.getSortedChildIdsForParent(id)) withDescendants(editor, childId, out)
}

/**
 * Convert one Behavior Tree region to a stock frame full of stock records.
 *
 * Returns null when `regionId` is not a region. Safe to call twice: the second
 * call finds no region and does nothing.
 */
export function detachBehaviorTreeToPrimitives(
	editor: Editor,
	regionId: TLShapeId,
): DetachedBehaviorTreePrimitives | null {
	const region = editor.getShape(regionId)
	if (!isBehaviorTreeShape(region)) return null
	if (editor.getCurrentToolId() !== 'select') editor.setCurrentTool('select')

	return withoutBehaviorTreeRepair(editor, () => {
		const primitiveParentId = unframedPrimitiveParentId(editor, region.parentId)
		const pose = shapePoseInPrimitiveParent(editor, region, primitiveParentId)
		const painted = behaviorTreePrimitives(region.props)
		const before = new Set(editor.getCurrentPageShapeIds())
		let detachedBlocks = 0
		let detachedCables = 0

		// Cables first, while the Blocks they bind to still carry their ports.
		for (const cable of regionCables(editor, region.id)) {
			if (cable.type !== CONNECTION_SHAPE_TYPE) continue
			if (detachConnectionToArrow(editor, cable as ConnectionShape) !== null) detachedCables += 1
		}

		// Then every occurrence the region projected as a real Block — a leaf, a
		// Blackboard pill, the Dataflow unbundle. Each becomes the same stock
		// group any detached Block becomes, so a person keeps one idiom.
		for (const childId of editor.getSortedChildIdsForParent(region.id)) {
			const child = editor.getShape(childId)
			if (!isBlockShape(child)) continue
			if (detachBlockToPrimitives(editor, child.id, { mark: false }) !== null) detachedBlocks += 1
		}

		// The painted layer, lifted out of the region's own space.
		editor.createShapes(painted.shapes.map((partial) => liftContainerPartial(
			{ ...partial, parentId: primitiveParentId },
			primitiveParentId,
			pose,
		)))

		// Whatever is still parented by the region is chrome the projection owns
		// — control cards above all — and the stock records just painted replace
		// it. Deleting the region takes them with it.
		editor.deleteShape(region.id)

		const frameId = createShapeId()
		editor.createShape({
			id: frameId,
			type: 'frame',
			parentId: primitiveParentId,
			x: pose.x,
			y: pose.y,
			rotation: pose.rotation,
			props: {
				w: Math.max(1, region.props.w),
				h: Math.max(1, region.props.h),
				name: region.props.title,
			},
			meta: {
				...toJsonSafe(region.meta),
				systemSketch: {
					kind: 'behavior-tree',
					version: DETACH_FORMAT_VERSION,
					// WHY: the XML is the region's whole truth. A picture of a tree
					// is a one-way door; the frame carries the source so a future
					// importer can put the region back, and stock tldraw ignores it.
					props: toJsonSafe(region.props),
				},
			},
		})
		// Frames adopt by containment, so the frame is created after its content
		// and the content is handed to it explicitly: page positions are kept.
		const produced: TLShapeId[] = []
		for (const id of editor.getCurrentPageShapeIds()) {
			if (id === frameId || before.has(id)) continue
			const shape = editor.getShape(id)
			if (!shape || shape.parentId !== primitiveParentId) continue
			produced.push(id)
		}
		if (produced.length > 0) editor.reparentShapes(produced, frameId)

		const everything: TLShapeId[] = []
		for (const id of produced) withDescendants(editor, id, everything)
		for (const id of everything) stripBehaviorTreeMeta(editor, id)

		return {
			frameId,
			childIds: produced,
			detachedBlocks,
			detachedCables,
		}
	})
}
