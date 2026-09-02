import type { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw'

import { canBlockContainChildren, isBlockShape } from '../blockModel'
import { isBranchShape } from '../../branch/branchModel'
import type { PortDot, PortFace } from './connectionModel'

/** A shape a cable can weld to: a Block, or a Branch through its control ports. */
type ScopeHost = TLShape

/**
 * A host defines a scope only when it is an Expanded Block. A Branch never
 * does: it is transparent to scoping, so a Block inside one of its arms lives
 * in the same scope as the Branch itself — which is what lets a cable run
 * straight from outside into an arm with no tunnel on the way.
 */
function hostIsLiveScope(host: ScopeHost): boolean {
	return isBlockShape(host) && canBlockContainChildren(host.props.view)
}

/**
 * Scopes: the one idea that makes a boundary port unambiguous.
 *
 * Every Block lives in a scope — the nearest Block above it, or the page. An
 * Expanded Block also DEFINES a scope: the inside of its frame. A cable joins
 * two faces in the same scope, and a face's polarity follows from which scope
 * it looks into (`portPolarity`). So the question "may these two ports be
 * wired, and which way does the data go?" is answered entirely by the two
 * Blocks' positions in the frame hierarchy — never by which dot was pressed.
 */

/** The slice of the editor the scope rules read, narrow so a test can stub it. */
export type ScopeReader = Pick<Editor, 'getShape' | 'getShapeParent' | 'getAncestorPageId'>

/** The scope a shape lives in: its nearest Block ancestor, else its page. */
export function blockScopeId(editor: ScopeReader, shapeId: TLShapeId): TLParentId {
	let parent: TLShape | undefined = editor.getShapeParent(shapeId)
	while (parent) {
		if (isBlockShape(parent)) return parent.id
		parent = editor.getShapeParent(parent)
	}
	return editor.getAncestorPageId(shapeId) ?? ('page:page' as TLParentId)
}

export interface FacePair {
	a: PortFace
	b: PortFace
	/** The scope both faces look into — and the parent a cable between them takes. */
	scopeId: TLParentId
}

/**
 * The faces two Blocks would meet a cable on, from their places in the tree.
 *
 *   siblings            outer ↔ outer   in their shared scope
 *   B inside A          A inner ↔ B outer   in A
 *   A inside B          A outer ↔ B inner   in B
 *   the same Block      inner ↔ inner   a pass-through wire across its inside
 *
 * Anything else — a grandchild, a cousin in another frame — shares no scope
 * and gets no pair. `requireLive` additionally demands that an inner face be
 * on screen (the Block is Expanded), which a new cable needs and an existing
 * one must not: a wire welded to an inner face survives Simple ↔ Port ↔
 * Expanded, or collapsing a Block would destroy its internal wiring.
 */
export function pairBlockFaces(
	editor: ScopeReader,
	a: ScopeHost,
	b: ScopeHost,
	options: { requireLive?: boolean } = {},
): FacePair | null {
	const live = (host: ScopeHost) => (
		!(options.requireLive ?? true) ? isBlockShape(host) : hostIsLiveScope(host)
	)
	if (a.id === b.id) return live(a) ? { a: 'inner', b: 'inner', scopeId: a.id } : null
	const scopeA = blockScopeId(editor, a.id)
	const scopeB = blockScopeId(editor, b.id)
	if (scopeA === scopeB) return { a: 'outer', b: 'outer', scopeId: scopeA }
	if (scopeB === a.id) return live(a) ? { a: 'inner', b: 'outer', scopeId: a.id } : null
	if (scopeA === b.id) return live(b) ? { a: 'outer', b: 'inner', scopeId: b.id } : null
	return null
}

/**
 * Which face of a dot looks into a given scope — for a cable end that is
 * still in the air, whose scope is wherever the pointer is.
 */
export function anchorFaceForScope(
	editor: ScopeReader,
	anchor: PortDot,
	scopeId: TLParentId,
): PortFace | null {
	const shape = editor.getShape(anchor.shapeId)
	if (!isBlockShape(shape) && !isBranchShape(shape)) return null
	if (scopeId === shape.id) return hostIsLiveScope(shape) ? 'inner' : null
	if (scopeId === blockScopeId(editor, shape.id)) return 'outer'
	return null
}
