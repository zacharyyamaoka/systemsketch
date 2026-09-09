import { isShapeId, type Editor, type TLShape } from 'tldraw'

import { blockBodyLayout, blockIsFolded, isBlockShape } from './blockModel'
import { isBranchShape } from '../branch/branchModel'
import {
	foldedUnderCaseView,
	isHiddenByFoldedArm,
	outermostFoldedLevel,
} from '../branch/branchScope'
import { getConnectionBindings } from './connections/ConnectionBindingUtil'
import { CONNECTION_SHAPE_TYPE } from './connections/connectionModel'
import { getActiveDepthScopeId } from '../depth/depthNavigation'
import {
	communicationProjection,
	isCommunicationPrototypeEnabled,
	isConnectionInCommunicationScope,
	isShapeInCommunicationScope,
	summaryCarrierFor,
} from '../prototypes/communication/communicationProjection'
import type { ConnectionShape } from './connections/ConnectionShapeUtil'

/**
 * A Block is an opaque leaf unless its active view is Expanded, and a Branch
 * arm is opaque while it is folded.
 *
 * tldraw's visibility callback is recursive: hiding one direct child also
 * hides that child's descendants. Internal Blocks, stock shapes and semantic
 * connections therefore follow the same rule without being deleted,
 * reparented or copied into a second visibility model.
 *
 * A cable is the one shape whose visibility is read from its ENDS rather than
 * its parent, because it lives in the scope outside the Branch. Expanded view
 * keeps a cable into a folded arm and re-attaches it at the arm's header (see
 * `branchFoldAttachPoint`); it drops only a cable wholly inside one folded
 * arm. Case view drops every cable that touches a folded arm — the open case
 * reads as one straight dataflow.
 */
export function getBlockShapeVisibility(
	shape: TLShape,
	editor: Editor,
): 'visible' | 'hidden' | 'inherit' {
	// WHY: the component map is a transient projection of this exact document.
	// Literal value nodes remain stored and return untouched in Dataflow; hiding
	// them here proves the simplified view did not create or delete a second
	// graph merely to make component communication legible.
	if (
		isCommunicationPrototypeEnabled(editor)
		&& communicationProjection.get(editor).lens === 'communication'
		&& isBlockShape(shape)
		&& shape.props.view === 'value'
		&& isShapeInCommunicationScope(editor, shape.id)
	) return 'hidden'
	const depthScopeId = getActiveDepthScopeId(editor)
	if (depthScopeId && editor.getShape(depthScopeId)) {
		// The entered Block must explicitly override a hidden ancestor. Its
		// descendants then inherit the ordinary Block / Branch visibility rules
		// below, while everything outside the scope leaves both rendering and
		// hit testing. This is true isolation rather than a canvas-coloured mask.
		if (shape.id === depthScopeId) return 'visible'
		if (!editor.hasAncestor(shape, depthScopeId)) return 'hidden'
	}
	if (isShapeId(shape.parentId)) {
		const parent = editor.getShape(shape.parentId)
		if (isBlockShape(parent) && (parent.props.view !== 'expanded' || blockIsFolded(parent.props))) {
			return 'hidden'
		}
	}
	if (shape.type === CONNECTION_SHAPE_TYPE) {
		// WHY: a stacked Block's members are read top-to-bottom, so a cable between
		// two of them says nothing the order does not; Zach's 2026-09-09 rule is
		// "with stacked we hide the connecting traces". The cable is parented to the
		// stack (its two ends' shared scope), stays stored, and returns on Free.
		if (isShapeId(shape.parentId)) {
			const host = editor.getShape(shape.parentId)
			if (isBlockShape(host) && blockBodyLayout(host.props) === 'stack') return 'hidden'
		}
		// WHY hidden and not merely unpainted: the communication lens draws one
		// summary cable per relationship, and the legs it stands for used to keep
		// their geometry — so a cable nobody could see was still hit-testable and
		// could be selected by a stray click, chrome and all. tldraw's own
		// visibility seam removes it from rendering AND hit testing without
		// touching the document, which is what Dataflow still needs it for.
		if (hiddenByCommunicationSummary(editor, shape)) return 'hidden'
		return connectionHiddenByBranch(editor, shape) ? 'hidden' : 'inherit'
	}
	if (!isShapeId(shape.parentId)) return 'inherit'
	const parent = editor.getShape(shape.parentId)
	if (isBranchShape(parent) && isHiddenByFoldedArm(editor, shape)) return 'hidden'
	return 'inherit'
}

/**
 * A cable the communication lens does not draw: every leg but the carrier.
 *
 * WHY the three tests below mirror `CommunicationConnectionShapeComponent`
 * clause for clause rather than approximating it: this seam removes a shape
 * from hit testing as well as from paint, so any cable the renderer DOES paint
 * and this rule hides becomes invisible-and-uninteractive, and any cable it
 * hides that this rule keeps stays selectable with nothing on screen. Both
 * failures have already happened once each.
 */
function hiddenByCommunicationSummary(editor: Editor, shape: TLShape): boolean {
	if (!isCommunicationPrototypeEnabled(editor)) return false
	const projection = communicationProjection.get(editor)
	// The renderer branches on the CABLE STYLE, not the lens — Summary is what
	// collapses a relationship onto one leg, and Dataflow can be asked for it.
	if (projection.cableStyle !== 'summary') return false
	// And on a connection's ENDPOINTS, not its parent: a cable between two
	// in-region components is in scope even when it is parented to the page.
	if (!isConnectionInCommunicationScope(editor, shape as ConnectionShape)) return false
	const carrier = summaryCarrierFor(editor, shape as ConnectionShape)
	// A cable in no relationship at all (an ordinary data edge) keeps its
	// ordinary visibility; only a relationship's non-carrier legs go.
	if (!carrier || carrier.connectionId === null || carrier.connectionId === shape.id) return false
	// WHY focus is an exception: focusing a relationship is precisely the
	// gesture that asks to see its other legs, and the renderer answers by
	// painting each one as a `focus-member` tag. Hiding them here would delete
	// the reveal — the whole point of the click.
	return projection.focusedGroupKey !== carrier.groupKey
}

export function connectionHiddenByBranch(editor: Editor, connection: TLShape): boolean {
	const bindings = getConnectionBindings(editor, connection.id)
	const ends = [bindings.start, bindings.end].filter((binding) => binding !== undefined)
	if (ends.length === 0) return false
	for (const binding of ends) {
		if (foldedUnderCaseView(editor, binding.toId)) return true
	}
	if (ends.length < 2) return false
	const [a, b] = ends.map((binding) => outermostFoldedLevel(editor, binding.toId))
	return a !== null && b !== null && a.branch.id === b.branch.id && a.armId === b.armId
}
