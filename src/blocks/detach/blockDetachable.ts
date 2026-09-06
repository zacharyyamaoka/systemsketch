/**
 * The Block kind's registration with the generic detach sweep.
 *
 * A Block is the one kind that lowers its own incident cables: each arrow must
 * bind port-precisely to the card that replaces the Block and keep the
 * Block-rebuild promise, which no phase running before the card exists could
 * do. Declaring `claimsIncidentEdges` makes the planner leave those cables to
 * this kind, and the `leaf` phase guarantees the far endpoints still stand.
 */
import type { Editor, TLShape } from 'tldraw'

import type { DetachableKind, LoweredNode } from '../../detach/detachableKind'
import { isBlockShape } from '../blockModel'
import { detachBlockToPrimitives } from './detachBlock'

export const blockDetachable: DetachableKind = {
	kind: 'block',
	role: 'node',
	nodePhase: 'leaf',
	// The one kind a detached group can become again: `rebuildSelectedBlocks`
	// reads the remembered record back. Arrows bound to its card keep their
	// rebuild promise.
	rebuildable: true,
	claimsIncidentEdges: true,
	discoversChildren: true,
	matches: (shape: TLShape) => isBlockShape(shape),
	lowerNode: (editor: Editor, shape: TLShape): LoweredNode | null => {
		const result = detachBlockToPrimitives(editor, shape.id, { mark: false })
		if (result === null) return null
		const replacementId = result.groupId ?? result.cardId
		return {
			bindingTargetId: result.cardId,
			selectionId: replacementId,
			rootIds: [replacementId, ...result.edgeRootIds],
			detail: result,
		}
	},
}
