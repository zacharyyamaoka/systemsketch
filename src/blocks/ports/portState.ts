import { WeakCache, atom, type Atom, type Editor, type TLShapeId } from 'tldraw'
import type { PortDot } from '../connections/connectionModel'

/**
 * An atom scoped to one editor instance.
 *
 * Transient interaction state — what is highlighted while you drag — must never
 * reach the document. Keying the signal on the editor keeps it out of the store,
 * out of `.systemsketch` files, and out of undo, while staying reactive enough
 * for a port dot to repaint on every pointer move.
 */
export class EditorAtom<T> {
	private states = new WeakCache<Editor, Atom<T>>()

	constructor(
		private name: string,
		private getInitialState: (editor: Editor) => T,
	) {}

	getAtom(editor: Editor): Atom<T> {
		return this.states.get(editor, () => atom(this.name, this.getInitialState(editor)))
	}

	get(editor: Editor): T {
		return this.getAtom(editor).get()
	}

	update(editor: Editor, update: (state: T) => T): T {
		return this.getAtom(editor).update(update)
	}

	set(editor: Editor, state: T): T {
		return this.getAtom(editor).set(state)
	}
}

export type PortIdentifier = PortDot

/**
 * Which ports a drag could legally land on, and which one it is over.
 *
 * Without this, the only feedback for an illegal drop is that nothing happens —
 * indistinguishable from a missed target. `eligiblePorts` is set the moment a
 * cable starts moving; each dot asks the rules whether a cable from `anchor`
 * may land on it. `hintingPort` lights the single dot the pointer is on.
 */
export interface PortState {
	hintingPort: PortIdentifier | null
	eligiblePorts: {
		/** The end of the cable that is already welded. */
		anchor: PortDot
		/** Blocks that would close a cycle, precomputed once per move. */
		excludeBlocks: ReadonlySet<TLShapeId> | null
	} | null
}

export const portState = new EditorAtom<PortState>('block port state', () => ({
	hintingPort: null,
	eligiblePorts: null,
}))

export function updatePortState(editor: Editor, update: Partial<PortState>): void {
	portState.update(editor, (state) => ({ ...state, ...update }))
}

export function clearPortDragState(editor: Editor): void {
	updatePortState(editor, { hintingPort: null, eligiblePorts: null })
}

/**
 * The selected cable the pointer is currently near.
 *
 * Figma's rule: a selected edge shows its control points only while the mouse
 * is close to it, so a selection does not sprinkle handles across the board.
 * This is an atom rather than a read of `editor.inputs` inside `getHandles`
 * because it flips at a threshold — the handle list then recomputes when the
 * answer changes, not on every pointer move.
 */
export const nearbyConnection = new EditorAtom<TLShapeId | null>(
	'nearby connection',
	() => null,
)
