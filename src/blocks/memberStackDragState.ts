import type { TLShapeId } from 'tldraw'

import { EditorAtom } from './ports/portState'

/**
 * The one reactive fact the rest of the app needs about the stack lane: which
 * member of which stacked Block dnd-kit is dragging right now, and the slot it
 * would take if released — null the rest of the time.
 *
 * Editor-scoped and out of the store on purpose (the same shape as
 * `btDndDragState`): it is what is happening under the pointer, never part of
 * the document, and must never become an undo entry. Its own module so the
 * settle pass (`memberStack.ts`) and the canvas paint (`BlockCanvas.tsx`) can
 * read it without importing the drag lane, which imports both of them.
 */
export interface StackMemberDragSignal {
	parentId: TLShapeId
	memberId: TLShapeId
	/** The neighbour the member would land before; null = last. */
	before: TLShapeId | null
}

export const memberStackDragState = new EditorAtom<StackMemberDragSignal | null>('stack member dnd drag', () => null)
