import type { TLShapeId } from 'tldraw'

import { EditorAtom } from '../blocks/ports/portState'

/**
 * A Tree view auto-layout drag landing somewhere `moveBehaviorTreeNode`
 * refuses (a cycle, a full decorator, a leaf) has no other feedback — the
 * preview simply freezes at the last legal slot. `at` is a nonce (not a
 * boolean) so the SAME reason firing twice in a row — the pointer sitting
 * still over one illegal spot for several frames — still shows one toast per
 * genuinely new refusal rather than only the first.
 *
 * Editor-scoped and out of the store on purpose, the same as `portState`:
 * this is what is happening under the pointer right now, never part of the
 * document, and it must repaint every frame of a drag without becoming an
 * undo entry.
 */
export interface TreeDragRefusal {
	regionId: TLShapeId
	reason: string
	at: number
}

export const treeDragRefusalState = new EditorAtom<TreeDragRefusal | null>('behavior tree drag refusal', () => null)
