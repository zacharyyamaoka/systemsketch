/**
 * Reset edge routing — clear hand-authored geometry back to automatic.
 *
 * Tidy deliberately leaves hand-routed (authored) and curved/straight bends
 * alone, so a deliberate reroute survives the next Tidy pass. Reset is the
 * escape hatch that pass needs: it clears whatever a person authored — elbow
 * rails, a curve/straight bend — back to the router's own live geometry, on
 * every edge in scope. Scope matches Tidy's `getTidyEdgesSelection` exactly:
 * explicit edges plus edges incident to any selected Block/Branch, because
 * selecting only arrows is the hard case this command exists to route around.
 */
import type { Editor } from 'tldraw'

import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'
import { getTidyEdgesSelection } from './tidyEdges'

export interface ResetEdgeRoutingOutcome {
	reset: number
	alreadyAutomatic: number
}

export const EMPTY_RESET_EDGE_ROUTING_OUTCOME: ResetEdgeRoutingOutcome = {
	reset: 0,
	alreadyAutomatic: 0,
}

/** Whether this edge carries any geometry a reset would clear. */
export function connectionHasCustomRoute(connection: ConnectionShape): boolean {
	return connection.props.curve !== null
		|| connection.props.pins.length > 0
		|| connection.props.elbowRoute !== null
}

export function describeResetEdgeRoutingOutcome(outcome: ResetEdgeRoutingOutcome): string {
	if (outcome.reset === 0) {
		return outcome.alreadyAutomatic > 0
			? 'Nothing to reset — already automatic'
			: 'No edges selected'
	}
	const parts = [`Reset ${outcome.reset} edge${plural(outcome.reset)} to automatic`]
	if (outcome.alreadyAutomatic > 0) {
		parts.push(`${outcome.alreadyAutomatic} already automatic`)
	}
	return parts.join(', ')
}

function plural(count: number): string {
	return count === 1 ? '' : 's'
}

/**
 * Clear authored geometry on every edge in scope.
 *
 * Pass `connections` explicitly for a precise, already-known set (the
 * inspector's own selection); omit it to use Tidy's broader selection scope,
 * which is what makes this reachable from a mixed node+edge selection.
 */
export function resetEdgeRouting(
	editor: Editor,
	connections: ConnectionShape[] = getTidyEdgesSelection(editor),
): ResetEdgeRoutingOutcome {
	if (connections.length === 0) return EMPTY_RESET_EDGE_ROUTING_OUTCOME
	const toReset = connections.filter(connectionHasCustomRoute)
	if (toReset.length === 0) {
		return { reset: 0, alreadyAutomatic: connections.length }
	}
	editor.markHistoryStoppingPoint('reset edge routing')
	editor.updateShapes(toReset.map((connection) => ({
		id: connection.id,
		type: CONNECTION_SHAPE_TYPE,
		props: { curve: null, pins: [], elbowRoute: null, routeMode: 'automatic' as const },
	})))
	return { reset: toReset.length, alreadyAutomatic: connections.length - toReset.length }
}
