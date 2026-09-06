/**
 * The Code kind's registration with the generic detach sweep.
 *
 * Registering it is what closes the old gap where a Code block inside a
 * detached region survived as a non-stock record in a stock frame: a kind
 * with a real reduction lowers wherever it participates — selection, page
 * sweep, or contributed by a composite — instead of being lifted as foreign.
 */
import type { Editor, TLShape } from 'tldraw'

import type { DetachableKind, LoweredNode } from '../detach/detachableKind'
import { isCodeShape, type CodeShape } from './codeModel'
import { detachCodeToPrimitives } from './detachCode'

export const codeDetachable: DetachableKind = {
	kind: 'code',
	role: 'node',
	nodePhase: 'leaf',
	rebuildable: false,
	discoversChildren: true,
	matches: (shape: TLShape) => isCodeShape(shape),
	lowerNode: (editor: Editor, shape: TLShape): LoweredNode | null => {
		const detached = detachCodeToPrimitives(editor, shape as CodeShape)
		const replacementId = detached.groupId ?? detached.cardId
		return {
			bindingTargetId: detached.cardId,
			selectionId: replacementId,
			rootIds: [replacementId],
		}
	},
}
