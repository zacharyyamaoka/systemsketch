import { WeakCache, atom, computed, type Atom, type Computed, type Editor, type TLShapeId } from 'tldraw'
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
		/** The cable in flight, so its own current landing is not a duplicate of itself. */
		connectionId: TLShapeId
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

type EligiblePorts = PortState['eligiblePorts']

function sameEligiblePorts(before: EligiblePorts, after: EligiblePorts): boolean {
	if (before === after) return true
	if (!before || !after) return false
	if (before.connectionId !== after.connectionId) return false
	if (
		before.anchor.shapeId !== after.anchor.shapeId
		|| before.anchor.portId !== after.anchor.portId
	) return false
	const a = before.excludeBlocks
	const b = after.excludeBlocks
	if (a === b) return true
	if (!a || !b || a.size !== b.size) return false
	for (const id of a) if (!b.has(id)) return false
	return true
}

const eligiblePortsSignals = new WeakCache<Editor, Computed<EligiblePorts>>()

/**
 * `eligiblePorts` as a signal that changes only when a landing would be judged
 * differently.
 *
 * The drag rewrites the whole port state on every pointer move, and every dot
 * on the board re-asks the rules whenever the state it reads changes — 11 ms
 * of judging per second of cable drag on 48 Blocks, measured. The anchor and
 * the cycle set are the rules' only inputs from here, and they hold still for
 * the length of a drag, so the dots read them through this equality-guarded
 * view instead of the raw atom.
 */
export function getEligiblePorts(editor: Editor): EligiblePorts {
	return eligiblePortsSignals
		.get(editor, () => computed(
			'eligible ports',
			() => portState.get(editor).eligiblePorts,
			{ isEqual: sameEligiblePorts },
		))
		.get()
}
