import type { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw'

import { canBlockContainChildren, isBlockShape } from '../blockModel'
import { isBranchShape } from '../../branch/branchModel'
import { isLoopShape } from '../../loop/loopModel'
import { isImportedPageFrame } from '../../singlePageDocument'
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
 * Every Block lives in a scope — the nearest Block above it, an imported-page
 * Frame, or the root canvas. An Expanded Block also DEFINES a scope: the inside of its frame. A cable joins
 * two faces in the same scope, and a face's polarity follows from which scope
 * it looks into (`portPolarity`). So the question "may these two ports be
 * wired, and which way does the data go?" is answered entirely by the two
 * Blocks' positions in the frame hierarchy — never by which dot was pressed.
 */

/** The slice of the editor the scope rules read, narrow so a test can stub it. */
export type ScopeReader = Pick<Editor, 'getShape' | 'getShapeParent' | 'getAncestorPageId'>

/** The scope a shape lives in: nearest Block / imported-page Frame, else root. */
export function blockScopeId(editor: ScopeReader, shapeId: TLShapeId): TLParentId {
	let parent: TLShape | undefined = editor.getShapeParent(shapeId)
	while (parent) {
		if (isBlockShape(parent)) return parent.id
		if (isImportedPageFrame(parent)) return parent.id
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
	// Every port host, not a hand-written list of two. Spelling the hosts out
	// here is what made a TAP on a Loop's item port do nothing while a drag
	// from the same dot worked: `offerBlockForLooseTerminal` asks this function
	// for a face, got null, and bailed silently. The QA sweep caught it by
	// running the same tap on a Block port as a control.
	if (!isBlockShape(shape) && !isBranchShape(shape) && !isLoopShape(shape)) return null
	if (scopeId === shape.id) return hostIsLiveScope(shape) ? 'inner' : null
	if (scopeId === blockScopeId(editor, shape.id)) return 'outer'
	return null
}

/**
 * A container that draws a frame without defining a scope, and that can hold a
 * cable: a Branch, a Loop. Blocks inside one live in the SAME scope as it does,
 * which is what lets a cable run straight in from outside with no tunnel.
 *
 * A Branch ARM is deliberately not one. An arm folds, and tldraw hides a
 * folded frame's children — so an arm that owned a cable would swallow it on
 * every fold, instead of letting `branchFoldAttachPoint` reattach it to the
 * arm's header edge the way the design asks. A cable inside an arm takes the
 * Branch instead, which cannot fold.
 */
export function isRegionShape(shape: TLShape | undefined | null): boolean {
	return isBranchShape(shape) || isLoopShape(shape)
}

/** The regions between a cable end and its scope, innermost first. */
function regionChain(editor: ScopeReader, host: ScopeHost, scopeId: TLParentId): TLShapeId[] {
	const chain: TLShapeId[] = []
	let node: TLShape | undefined = isRegionShape(host) ? host : editor.getShapeParent(host.id)
	while (node && node.id !== scopeId) {
		if (isRegionShape(node)) chain.push(node.id)
		node = editor.getShapeParent(node)
	}
	return chain
}

/**
 * Whose children a cable paints among — and, because of how tldraw hit-tests,
 * whether it can be clicked at all.
 *
 * A cable's SCOPE answers "may these two faces meet, and which way does the
 * data go". This answers a different question, and the two only coincide for
 * an Expanded Block, which both defines a scope and draws a frame.
 *
 * A Loop or a Branch draws a frame without defining a scope, so a cable
 * between two Blocks inside one used to stay in the page beneath it. tldraw
 * stops hit-testing at a frame-like shape's hollow face and answers nothing
 * (see `containerGeometry.ts`), so every one of those cables was unclickable
 * wherever it crossed the region — while the identical cable inside an
 * Expanded Block worked, purely because being that Block's child sorted it
 * above the frame. A region takes the cable as a child for the same reason.
 *
 * `blockScopeId` reads straight through a region, so the scope is unchanged.
 * A cable whose ends sit in two different regions, or one that merely flies
 * over a region it has no end in, still belongs to the shared scope.
 */
export function cableCompositingParent(
	editor: ScopeReader,
	a: ScopeHost,
	b: ScopeHost,
	scopeId: TLParentId,
): TLParentId {
	const chainA = regionChain(editor, a, scopeId)
	const chainB = regionChain(editor, b, scopeId)
	// A region that holds both ends holds the whole cable.
	const shared = chainA.find((id) => chainB.includes(id))
	if (shared) return shared
	// One end outside: the cable crosses in, so the region it enters still owns
	// the run that is drawn over it. Both ends in regions that share none means
	// no region contains the cable — taking either would hide half of it with a
	// folded arm, so it stays in the scope.
	if (chainA.length === 0) return chainB[0] ?? scopeId
	if (chainB.length === 0) return chainA[0]
	return scopeId
}
