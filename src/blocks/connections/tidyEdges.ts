/**
 * Tidy edges — spread shared elbow channels as a one-shot command.
 *
 * This is the editor adapter for the pure `nudgeRoutes` implementation already
 * shared with PyBlocks. Automatic elbow routes may move; authored routes remain
 * immovable constraints; curved and straight connections are ignored. Routes
 * are compared in page space and persisted as the same endpoint-relative pins
 * the existing elbow editor uses, so the operation is undoable and repeatable.
 * Scope is always explicit: selected edges plus edges incident to any selected
 * Block. An empty selection never sweeps the page.
 */
import { Mat, type Editor, type TLShapeId } from 'tldraw'

import { isBlockShape } from '../blockModel'
import {
	createPin,
	nudgeRoutes,
	routeElbow,
	type ElbowPin,
	type ElbowRoute,
} from '../elbow'
import {
	getConnectionElbowRoute,
	getConnectionEndpoints,
	type ConnectionShape,
} from './ConnectionShapeUtil'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'

export interface TidyEdgesOutcome {
	tidied: number
	locked: number
	ignored: number
	bundles: number
	forcedCrossings: number
}

export const EMPTY_TIDY_EDGES_OUTCOME: TidyEdgesOutcome = {
	tidied: 0,
	locked: 0,
	ignored: 0,
	bundles: 0,
	forcedCrossings: 0,
}

export function describeTidyEdgesOutcome(outcome: TidyEdgesOutcome): string {
	if (outcome.tidied === 0 && outcome.locked === 0) {
		return outcome.ignored > 0
			? `Nothing to tidy — ${outcome.ignored} edge${plural(outcome.ignored)} ${
				outcome.ignored === 1 ? 'is' : 'are'
			} curved or straight`
			: 'Edges are already tidy'
	}
	const parts = [`Tidied ${outcome.tidied} edge${plural(outcome.tidied)}`]
	if (outcome.locked > 0) parts.push(`kept ${outcome.locked} hand-routed`)
	if (outcome.ignored > 0) parts.push(`skipped ${outcome.ignored} non-elbow`)
	if (outcome.forcedCrossings > 0) {
		parts.push(`${outcome.forcedCrossings} crossing${plural(outcome.forcedCrossings)} cannot be removed`)
	}
	return parts.join(', ')
}

function plural(count: number): string {
	return count === 1 ? '' : 's'
}

export type TidyEdgeRole = 'free' | 'locked' | 'ignored'

export function tidyEdgeRole(connection: ConnectionShape): TidyEdgeRole {
	if (connection.props.routing !== 'elbow') return 'ignored'
	if (connection.props.elbowRoute !== null || connection.props.curve !== null) return 'locked'
	return 'free'
}

export interface TidyEdgesOptions {
	spacing?: number
}

export function tidyEdges(
	editor: Editor,
	options: TidyEdgesOptions = {},
): TidyEdgesOutcome {
	const connections = editor.getCurrentPageShapes().filter(
		(shape): shape is ConnectionShape => shape.type === CONNECTION_SHAPE_TYPE,
	)
	const selected = new Set(getTidyEdgesSelection(editor, connections).map((connection) => connection.id))
	if (selected.size === 0) return EMPTY_TIDY_EDGES_OUTCOME

	const movable = new Set<TLShapeId>()
	let locked = 0
	let ignored = 0
	for (const connection of connections) {
		if (!selected.has(connection.id)) continue
		const role = tidyEdgeRole(connection)
		if (role === 'free') movable.add(connection.id)
		else if (role === 'locked') locked += 1
		else ignored += 1
	}
	if (movable.size === 0) {
		return { ...EMPTY_TIDY_EDGES_OUTCOME, locked, ignored }
	}

	// Unselected elbows remain immutable but participate as routing constraints.
	// This makes selecting one edge useful: it can move away from an overlapping
	// sibling without silently rewriting that sibling.
	const participants = connections.filter((connection) =>
		movable.has(connection.id) || connection.props.routing === 'elbow')
	const pageRoutes = participants.map((connection) =>
		toPageRoute(editor, connection, movable.has(connection.id)))
	const lockedFlags = participants.map((connection) => !movable.has(connection.id))
	const report = nudgeRoutes(
		pageRoutes,
		options.spacing === undefined ? {} : { spacing: options.spacing },
		lockedFlags,
	)

	const edits: { id: TLShapeId; type: typeof CONNECTION_SHAPE_TYPE; props: { pins: ElbowPin[] } }[] = []
	participants.forEach((connection, index) => {
		if (!movable.has(connection.id)) return
		const pins = pinsForRoute(editor, connection, pageRoutes[index], report.routes[index])
		if (pins) edits.push({ id: connection.id, type: CONNECTION_SHAPE_TYPE, props: { pins } })
	})
	if (edits.length > 0) {
		editor.markHistoryStoppingPoint('tidy edges')
		editor.updateShapes<ConnectionShape>(edits)
	}

	return {
		tidied: edits.length,
		locked,
		ignored,
		bundles: report.bundles.length,
		forcedCrossings: report.forcedCrossings.length,
	}
}

/** Explicit edges plus every edge incident to at least one selected Block. */
export function getTidyEdgesSelection(
	editor: Editor,
	connections = editor.getCurrentPageShapes().filter(
		(shape): shape is ConnectionShape => shape.type === CONNECTION_SHAPE_TYPE,
	),
): ConnectionShape[] {
	const selected = new Set(editor.getSelectedShapeIds())
	if (selected.size === 0) return []
	const selectedBlocks = new Set(editor.getSelectedShapes().filter(isBlockShape).map((shape) => shape.id))
	return connections.filter((connection) => {
		if (selected.has(connection.id)) return true
		const bound = editor.getBindingsFromShape(connection, 'connection').map((binding) => binding.toId)
		return bound.some((id) => selectedBlocks.has(id))
	})
}

/** Recompute pinned routes from their pristine auto-route for idempotence. */
function toPageRoute(
	editor: Editor,
	connection: ConnectionShape,
	ignoreAutomaticPins: boolean,
): ElbowRoute {
	const transform = editor.getShapePageTransform(connection)
	const authored = getConnectionElbowRoute(editor, connection)
	const { source, sink } = getConnectionEndpoints(editor, connection)
	const pristine = ignoreAutomaticPins && connection.props.pins.length > 0
		? routeElbow({
			start: { point: source, side: 'right', box: null },
			end: { point: sink, side: 'left', box: null },
		})
		: authored
	return {
		...pristine,
		points: pristine.points.map((point) => {
			const pagePoint = Mat.applyToPoint(transform, point)
			return { x: pagePoint.x, y: pagePoint.y }
		}),
	}
}

function pinsForRoute(
	editor: Editor,
	connection: ConnectionShape,
	before: ElbowRoute,
	after: ElbowRoute,
): ElbowPin[] | null {
	const inverse = Mat.Inverse(editor.getShapePageTransform(connection))
	const { source, sink } = getConnectionEndpoints(editor, connection)
	const pins: ElbowPin[] = []

	for (let index = 1; index + 2 < before.points.length; index += 1) {
		const previous = before.points[index]
		const next = after.points[index]
		if (Math.abs(previous.x - next.x) < 1e-6 && Math.abs(previous.y - next.y) < 1e-6) continue
		const segmentEnd = before.points[index + 1]
		const axis: 'x' | 'y' = Math.abs(previous.y - segmentEnd.y) <= Math.abs(previous.x - segmentEnd.x)
			? 'x'
			: 'y'
		const local = Mat.applyToPoint(inverse, next)
		const value = axis === 'x' ? local.y : local.x
		pins.push(createPin(index, axis, value, source, sink))
	}
	return pins.length > 0 ? pins : null
}
