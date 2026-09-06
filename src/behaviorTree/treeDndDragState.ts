import type { TLShapeId } from 'tldraw'

import { EditorAtom } from '../blocks/ports/portState'

/**
 * The one reactive fact the rest of the app needs about the Behavior Tree's
 * dnd-kit drag lane: which projected node, in which region, dnd-kit is
 * dragging right now — null the rest of the time.
 *
 * Editor-scoped and out of the store on purpose (the same shape as
 * `treeDragRefusalState`): this is what is happening under the pointer right
 * now, never part of the document, and it must never become an undo entry.
 *
 * It exists as its own module so the three kinds of consumer can read it
 * without importing the drag lane itself (which imports the region installer,
 * which several of those consumers sit beside — a cycle otherwise):
 *   - `BehaviorTreeCanvas` re-anchors live wires onto the dragged card,
 *     exactly as it already does for a native `select.translating` drag;
 *   - `installBehaviorTreeRegions`'s repair pass skips the dragged shape so
 *     the drag stays single-writer (dnd-kit's sensor is the only thing
 *     positioning that card while this is non-null);
 *   - the selection menu and connector controls hide for the gesture, the
 *     same way they already do for every native manipulation state.
 */
export interface BtDndDragSignal {
	regionId: TLShapeId
	shapeId: TLShapeId
	/** The dragged occurrence's path in the session's own base numbering. */
	path: string
}

export const btDndDragState = new EditorAtom<BtDndDragSignal | null>('behavior tree dnd drag', () => null)
