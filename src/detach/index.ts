/**
 * Detach to primitives — the generic, registry-driven sweep.
 *
 * `detachableKind.ts` is the contract, `detachPlan.ts` decides what lowers in
 * which order, `detachSweep.ts` executes the phases, and `registeredKinds.ts`
 * is the one list of kinds. The entry points here bind them together for the
 * selection menu and the page-wide export.
 */
import type { Editor, TLShapeId } from 'tldraw'

import { matchDetachableKind } from './detachableKind'
import { DETACHABLE_KINDS } from './registeredKinds'
import { runDetachSweep, type DetachSweepOptions, type DetachSweepResult } from './detachSweep'

export * from './detachableKind'
export * from './detachPlan'
export * from './detachSweep'
export * from './registeredKinds'
export { rebuildSelectedBlocks, selectedDetachedGroupIds } from '../blocks/detach/detachBlock'
export {
	detachSelectedConnections,
	selectedConnectionIds,
} from '../blocks/connections/detachConnection'

/**
 * Every registered custom visual reachable from `roots`, nesting included.
 * Discovery only needs to include every custom visual a person can author;
 * ordering is imposed by the sweep's phases, not by this walk.
 */
function detachableIdsFrom(editor: Editor, roots: readonly TLShapeId[]): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			const kind = matchDetachableKind(DETACHABLE_KINDS, shape)
			if (kind) found.push(id)
			// A region detaches whole; descending into it would list its
			// projection as if a person had drawn each occurrence.
			if (kind && kind.discoversChildren === false) continue
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(roots)
	return [...new Set(found)]
}

/** Every detachable custom visual selected through the current tree. */
export function selectedDetachableIds(editor: Editor): TLShapeId[] {
	return detachableIdsFrom(editor, editor.getSelectedShapeIds())
}

/** All detachable custom visuals on the current page, nesting included. */
export function allDetachableIds(editor: Editor): TLShapeId[] {
	return detachableIdsFrom(editor, editor.getSortedChildIdsForParent(editor.getCurrentPageId()))
}

/** The selection-scoped command exposed as "Detach to primitives". */
export function detachSelectedPrimitives(editor: Editor): DetachSweepResult {
	return runDetachSweep(editor, selectedDetachableIds(editor), DETACHABLE_KINDS)
}

/** Detach every custom visual on the current page in one undoable step. */
export function detachAllPrimitives(
	editor: Editor,
	options: DetachSweepOptions = {},
): DetachSweepResult {
	return runDetachSweep(editor, allDetachableIds(editor), DETACHABLE_KINDS, options)
}
