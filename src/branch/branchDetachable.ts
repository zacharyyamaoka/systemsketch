/**
 * The Branch kind's registration with the generic detach sweep.
 *
 * A Branch is a container: its incident cables lower in the edge phase (a
 * cable claimed by a Block endpoint is that Block's instead), its authored
 * children lower in their own phases or stay semantic and are adopted into
 * the replacement group, and its wrapper chrome reduces last. Its replacement
 * can never become a Branch again through the Block rebuild path, so arrows
 * bound to its card have their rebuild promise cleared by the sweep.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import type { DetachableKind, LoweredNode } from '../detach/detachableKind'
import { getBlockPortConnections } from '../blocks/connections/blockPorts'
import { detachedArrowPortIds } from '../blocks/connections/detachConnection'
import { isBranchShape, type BranchShape } from './branchModel'
import { detachBranchToPrimitives } from './detachBranch'

/**
 * Ports that visibly carry a wire, read before any cable in the sweep is
 * lowered. Both sources count: live semantic cables, and stock arrows left by
 * an earlier detach — the same rule the Block applies to its own dots.
 */
export function surveyWiredPortIds(editor: Editor, shape: TLShape): ReadonlySet<string> {
	return new Set([
		...getBlockPortConnections(editor, shape.id).map((entry) => entry.ownPortId),
		...detachedArrowPortIds(editor, shape.id),
	])
}

/** Semantic cables wired to this shape's ports, for the planner's edge phase. */
export function incidentConnectionIds(editor: Editor, shape: TLShape): TLShapeId[] {
	return [...new Set(
		getBlockPortConnections(editor, shape.id).map((entry) => entry.connectionId),
	)]
}

export const branchDetachable: DetachableKind = {
	kind: 'branch',
	role: 'node',
	nodePhase: 'container',
	rebuildable: false,
	discoversChildren: true,
	matches: (shape: TLShape) => isBranchShape(shape),
	surveyConnectedPortIds: surveyWiredPortIds,
	incidentEdgeIds: incidentConnectionIds,
	lowerNode: (editor: Editor, shape: TLShape, context): LoweredNode | null => {
		const detached = detachBranchToPrimitives(
			editor,
			shape.id as BranchShape['id'],
			context.connectedPortIds,
		)
		if (detached === null) return null
		return {
			bindingTargetId: detached.cardId,
			selectionId: detached.groupId,
			rootIds: [detached.groupId],
		}
	},
}
