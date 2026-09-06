/**
 * The Loop kind's registration with the generic detach sweep.
 *
 * Same container contract as the Branch: incident cables lower in the edge
 * phase, children go through their own kinds or stay semantic inside the
 * replacement group, wrapper chrome reduces last, and arrows bound to the
 * replacement card lose their Block-rebuild promise.
 */
import type { Editor, TLShape } from 'tldraw'

import type { DetachableKind, LoweredNode } from '../detach/detachableKind'
import {
	incidentConnectionIds,
	surveyWiredPortIds,
} from '../branch/branchDetachable'
import { isLoopShape, type LoopShape } from './loopModel'
import { detachLoopToPrimitives } from './detachLoop'

export const loopDetachable: DetachableKind = {
	kind: 'loop',
	role: 'node',
	nodePhase: 'container',
	rebuildable: false,
	discoversChildren: true,
	matches: (shape: TLShape) => isLoopShape(shape),
	surveyConnectedPortIds: surveyWiredPortIds,
	incidentEdgeIds: incidentConnectionIds,
	lowerNode: (editor: Editor, shape: TLShape, context): LoweredNode | null => {
		const detached = detachLoopToPrimitives(
			editor,
			shape.id as LoopShape['id'],
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
