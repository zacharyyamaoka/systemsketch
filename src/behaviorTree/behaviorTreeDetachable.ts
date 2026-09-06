/**
 * The Behavior Tree region's registration with the generic detach sweep.
 *
 * The honest generalisation of "detach": a projected child is not a thing a
 * person authored — its truth is the region's XML — so a child cannot be
 * detached on its own (`refuses`). The *region* can, and when it is, every
 * occurrence goes down with it: the region contributes its projected cables
 * and child occurrences to the sweep, each lowers through its own kind's
 * reduction, and the region's own reduction handles only the layer it paints
 * for itself — control cards, wires, rails, merge marks, chips, group boxes
 * and Start — via `behaviorTreePrimitives`.
 *
 * The region never names a child kind. A child some kind knows how to lower
 * is contributed and lowered; a child no kind knows — a person's annotation,
 * or a record from a future feature — is lifted into the frame and preserved.
 * Nothing inside a region is silently destroyed except the region's own
 * chrome, which the painted stock layer replaces.
 *
 * The region becomes a stock **frame**, not a group: it clips nothing a
 * projection ever put outside its own bounds, it keeps the header band and the
 * title as a first-class stock affordance, and it is the record a future
 * importer reads the canonical XML back out of.
 */
import {
	createShapeId,
	type Editor,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import type {
	DetachableKind,
	DetachExpandContext,
	LoweredNode,
	LowerNodeContext,
} from '../detach/detachableKind'
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
	isBtControlShape,
	readBtChildMeta,
	type BehaviorTreeShape,
} from './behaviorTreeModel'
import { behaviorTreePrimitives } from './btPrimitives'
import { regionCables, withoutBehaviorTreeRepair } from './installBehaviorTreeRegions'

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

function expandBehaviorTreeRegion(
	editor: Editor,
	region: TLShape,
	contribute: DetachExpandContext,
): void {
	// Projected Dataflow cables lower as plain arrows — a Block-rebuild promise
	// on them would resurrect occurrences whose truth is the XML.
	for (const cable of regionCables(editor, region.id)) {
		contribute.addEdge({ shapeId: cable.id, forcePlain: true })
	}
	// Every direct child that is not the region's own control chrome is handed
	// to the planner: a kind that knows it lowers it, and anything unknown is
	// left for the region's reduction to lift and preserve. Stamped cables were
	// contributed above already.
	for (const childId of editor.getSortedChildIdsForParent(region.id)) {
		const child = editor.getShape(childId)
		if (!child || isBtControlShape(child)) continue
		if (readBtChildMeta(child)?.btRole === 'cable') continue
		contribute.addNode({ shapeId: childId })
	}
}

function lowerBehaviorTreeRegion(
	editor: Editor,
	region: BehaviorTreeShape,
	context: LowerNodeContext,
): LoweredNode {
	const primitiveParentId = unframedPrimitiveParentId(editor, region.parentId)
	const pose = shapePoseInPrimitiveParent(editor, region, primitiveParentId)
	const painted = behaviorTreePrimitives(region.props)

	// The painted layer, lifted out of the region's own space.
	const chromePartials = painted.shapes.map((partial) => liftContainerPartial(
		{ ...partial, parentId: primitiveParentId },
		primitiveParentId,
		pose,
	))
	editor.createShapes(chromePartials)
	const chromeIds = chromePartials.map((partial) => partial.id as TLShapeId)

	// Survivors leave before the region does: contributed occurrences lowered
	// out of the region already, but an in-place replacement, a person's own
	// drawing, or a stamped record no kind knows is still a child — and
	// deleting the region deletes its whole subtree, the one thing detach must
	// never do to authored work. The test is "not the region's own chrome",
	// not a list of kinds, so a shape type that does not exist yet survives too.
	const lifted: TLShapeId[] = []
	for (const childId of editor.getSortedChildIdsForParent(region.id)) {
		const child = editor.getShape(childId)
		if (!child || isBtControlShape(child)) continue
		lifted.push(childId)
	}
	if (lifted.length > 0) editor.reparentShapes(lifted, primitiveParentId)

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
	// and the content is handed to it explicitly by id: the replacements of
	// everything this region contributed, its own painted chrome, and the
	// lifted survivors. Page positions are kept.
	const produced: TLShapeId[] = []
	const adopted = new Set<TLShapeId>()
	for (const id of [...context.contributedRootIds, ...chromeIds, ...lifted]) {
		if (adopted.has(id)) continue
		adopted.add(id)
		const shape = editor.getShape(id)
		if (!shape || shape.parentId !== primitiveParentId) continue
		produced.push(id)
	}
	if (produced.length > 0) editor.reparentShapes(produced, frameId)

	const everything: TLShapeId[] = []
	for (const id of produced) withDescendants(editor, id, everything)
	for (const id of everything) stripBehaviorTreeMeta(editor, id)

	return {
		bindingTargetId: null,
		selectionId: frameId,
		rootIds: [frameId],
	}
}

export const behaviorTreeDetachable: DetachableKind = {
	kind: 'behavior-tree',
	role: 'node',
	nodePhase: 'container',
	rebuildable: false,
	// The region owns its projection: its children are contributed by `expand`,
	// never discovered as authored work — descending would list occurrences as
	// if a person had drawn each one.
	discoversChildren: false,
	matches: (shape: TLShape) => isBehaviorTreeShape(shape),
	/**
	 * WHY: a projected child is refused from discovery. Its truth is the
	 * region's XML, so lowering the occurrence on its own would be a lie in two
	 * directions at once — the primitives would claim to be an authored Block,
	 * and deleting the Block record compiles an XML delete, so asking to
	 * *detach* a node would silently *remove* it from the tree. Refusal reuses
	 * the idiom the menu already has: nothing detachable in the selection, so
	 * no menu item appears.
	 */
	refuses: (shape: TLShape) => readBtChildMeta(shape) !== null,
	// WHY: dismantling a region is not a gesture *on* a region. Detach deletes
	// projected children on purpose, and the repair installer would otherwise
	// read each delete as "the person removed this occurrence" — compiling XML
	// deletes and rebuilding the region around the primitives that replaced it.
	aroundSweep: (editor, body) => withoutBehaviorTreeRepair(editor, body),
	expand: expandBehaviorTreeRegion,
	lowerNode: (editor: Editor, shape: TLShape, context): LoweredNode | null => {
		if (!isBehaviorTreeShape(shape)) return null
		return lowerBehaviorTreeRegion(editor, shape, context)
	},
}
