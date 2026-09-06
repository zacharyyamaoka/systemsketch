/** The free Port's registration with the one generic detach/export sweep. */
import type { Editor, TLShape } from 'tldraw'

import type { DetachableKind, LoweredNode } from '../detach/detachableKind'
import { detachFloatingPortToPrimitives } from './detachFloatingPort'
import { isFloatingPortShape } from './floatingPortModel'

export const floatingPortDetachable: DetachableKind = {
	kind: 'floating-port',
	role: 'node',
	nodePhase: 'leaf',
	rebuildable: false,
	discoversChildren: true,
	matches: (shape: TLShape) => isFloatingPortShape(shape),
	lowerNode: (editor: Editor, shape: TLShape): LoweredNode | null => {
		const replacements = detachFloatingPortToPrimitives(editor, shape.id)
		if (replacements === null) return null
		return {
			// The Port lowers to a dot plus a sibling label, so there is no single
			// wrapper to claim both. The dot is the closest continuation of its
			// endpoint identity and keeps the post-detach selection tangible.
			bindingTargetId: replacements[0] ?? null,
			selectionId: replacements[0] ?? null,
			rootIds: replacements,
		}
	},
}
