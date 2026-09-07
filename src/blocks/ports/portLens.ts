/**
 * Which lens a Block's ports are currently laid out for, and nothing else.
 *
 * WHY this is a leaf module rather than part of the communication projection:
 * `blockPorts.ts` has to know the lens to place a socket, and the projection
 * imports `blockPorts` to read a port by id. Importing the projection back into
 * `blockPorts` would close that ring and leave one of the two half-initialised
 * at import time — the same shape of problem `systemPortDragState.ts` exists to
 * avoid. Everything here depends on tldraw and a type import only.
 *
 * The projection owns the truth and pushes it here through one writer, so the
 * mirror cannot drift: there is exactly one call site.
 */
import { atom, isShapeId, type Atom, type Editor, type TLShapeId } from 'tldraw'

import type { BlockLayoutLens } from '../layoutBlock'

export interface CommunicationLensScope {
	/** The region whose contents are being read as communication, if any. */
	regionId: TLShapeId | null
	/** The legacy query-gated prototype puts the whole board in the lens. */
	wholeBoard: boolean
	/**
	 * The shape communication draws its cables with.
	 *
	 * WHY it lives here and not on the connection: a cable's `routing` and
	 * `curve` are document state shared by both lenses, so choosing Curve in
	 * Dataflow silently re-shaped the communication drawing and vice versa — an
	 * adversarial audit demonstrated the leak in both directions. Communication
	 * stores NO cable state, exactly like its routes; this is a projection
	 * field, and Dataflow's document values are left alone.
	 */
	routing: 'curved' | 'straight' | 'elbow'
}

const IDLE: CommunicationLensScope = { regionId: null, wholeBoard: false, routing: 'elbow' }

const scopes = new WeakMap<Editor, Atom<CommunicationLensScope>>()

function scopeAtom(editor: Editor): Atom<CommunicationLensScope> {
	let value = scopes.get(editor)
	if (!value) {
		value = atom<CommunicationLensScope>('communication lens scope', IDLE)
		scopes.set(editor, value)
	}
	return value
}

/** The projection's single writer. */
export function setCommunicationLensScope(editor: Editor, scope: CommunicationLensScope): void {
	const current = scopeAtom(editor).get()
	if (
		current.regionId === scope.regionId
		&& current.wholeBoard === scope.wholeBoard
		&& current.routing === scope.routing
	) return
	scopeAtom(editor).set(scope)
}

export function getCommunicationLensScope(editor: Editor): CommunicationLensScope {
	return scopeAtom(editor).get()
}

function shapeIsInRegion(editor: Editor, shapeId: TLShapeId, regionId: TLShapeId): boolean {
	let shape = editor.getShape(shapeId)
	const visited = new Set<TLShapeId>()
	while (shape && !visited.has(shape.id)) {
		visited.add(shape.id)
		if (shape.id === regionId) return true
		if (!isShapeId(shape.parentId)) return false
		shape = editor.getShape(shape.parentId)
	}
	return false
}

/**
 * The lens one host's ports should be laid out for.
 *
 * Reading this inside the port cache's computed is what makes cables follow a
 * socket that moved to another edge: tldraw's signals track the atom read and
 * re-evaluate the whole port table when the lens changes, so nothing
 * downstream has to subscribe by hand.
 */
export function blockLayoutLensFor(editor: Editor, shapeId: TLShapeId): BlockLayoutLens {
	const scope = scopeAtom(editor).get()
	if (scope.wholeBoard) return 'communication'
	if (!scope.regionId) return 'dataflow'
	return shapeIsInRegion(editor, shapeId, scope.regionId) ? 'communication' : 'dataflow'
}

/** The shape a cable takes in the communication lens. */
export function communicationLensRouting(editor: Editor): 'curved' | 'straight' | 'elbow' {
	return scopeAtom(editor).get().routing
}
