/**
 * Tidy edges — route automatic elbows around obstacles, then spread channels.
 *
 * This is orchestration only. Obstacle collection, one-edge A*, route
 * stabilization, collision-safe bundle nudging, and persistence live in
 * separate functions and carry independent tests. Automatic elbow routes may
 * move; authored routes remain immovable constraints; curved and straight
 * connections are ignored.
 * Scope is always explicit: selected edges plus edges incident to any selected
 * Block. The one-container exception treats a lone Expanded Block or Loop as
 * its immediate interior scope. An empty selection never sweeps the page.
 */
import { Mat, type Editor, type TLShapeId } from 'tldraw'

import { branchAncestry } from '../../branch/branchScope'
import { isBranchShape } from '../../branch/branchModel'
import { isBlockShape } from '../blockModel'
import { getSelectedContainerLayoutScope } from '../expandedBlockLayoutScope'
import {
	type ElbowRoute,
	type ElbowRouteInput,
	DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS,
	hasElbowSoftClearancePreference,
	resolveElbowSoftClearanceOptions,
	softClearanceCost,
	type ElbowSoftClearanceOptions,
	type ElbowSoftRoute,
} from '../elbow'
import {
	getConnectionElbowRoute,
	getConnectionEndpoints,
	type ConnectionShape,
} from './ConnectionShapeUtil'
import {
	nudgeRoutesWithoutObstacleCollisions,
	planOrthogonalRoute,
	routeClearsInput,
	routesHaveSamePoints,
	stabilizeOrthogonalRoute,
} from './collisionAwareRouting'
import {
	AUTHORED_PORT_LEG,
	captureResolvedRoute,
	dongleEndpoints,
	type ConnectionElbowRouteModel,
	type ElbowTerminalLegs,
} from './elbowAuthoredRoute'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { collectConnectionRoutingScene } from './routingObstacles'

export interface TidyEdgesOutcome {
	tidied: number
	locked: number
	ignored: number
	bundles: number
	forcedCrossings: number
	unresolved: number
	revertedNudges: number
}

export const EMPTY_TIDY_EDGES_OUTCOME: TidyEdgesOutcome = {
	tidied: 0,
	locked: 0,
	ignored: 0,
	bundles: 0,
	forcedCrossings: 0,
	unresolved: 0,
	revertedNudges: 0,
}

export function describeTidyEdgesOutcome(outcome: TidyEdgesOutcome): string {
	if (outcome.tidied === 0 && outcome.locked === 0 && outcome.unresolved === 0) {
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
	if (outcome.unresolved > 0) {
		parts.push(`${outcome.unresolved} route${plural(outcome.unresolved)} could not clear every obstacle`)
	}
	if (outcome.revertedNudges > 0) {
		parts.push(`kept ${outcome.revertedNudges} channel${plural(outcome.revertedNudges)} clear of Blocks`)
	}
	return parts.join(', ')
}

function plural(count: number): string {
	return count === 1 ? '' : 's'
}

export type TidyEdgeRole = 'free' | 'locked' | 'ignored'

export function tidyEdgeRole(connection: ConnectionShape): TidyEdgeRole {
	if (connection.props.routing !== 'elbow') return 'ignored'
	if (connection.props.routeMode === 'authored' || connection.props.curve !== null) return 'locked'
	return 'free'
}

export interface TidyEdgesOptions {
	spacing?: number
	/**
	 * Local, non-blocking cable separation. Both weights are zeroable, which
	 * restores the prior hard-obstacle-only Tidy planner exactly.
	 */
	softClearance?: Partial<ElbowSoftClearanceOptions>
}

/** Default preference used only by Tidy edges; ordinary live routing is unchanged. */
export const DEFAULT_TIDY_SOFT_CLEARANCE_OPTIONS = DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS

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
	const currentRoutes = participants.map((connection) => routeInPage(editor, connection))
	const scenesByRoute = participants.map((connection) => (
		movable.has(connection.id) ? collectConnectionRoutingScene(editor, connection) : undefined
	))
	const inputsByRoute: (ElbowRouteInput | undefined)[] = scenesByRoute.map((scene) => scene?.input)
	const lockedFlags = participants.map((connection) => !movable.has(connection.id))
	let unresolved = 0
	// Establish an unweighted baseline first. The soft pass then compares only
	// routes that actually enter the desired gap, keeping the local grid compact
	// on dense boards and keeping the policy deterministic.
	const baselineRoutes = participants.map((_, index) => (
		lockedFlags[index] || !scenesByRoute[index]
			? currentRoutes[index]
			: planOrthogonalRoute(scenesByRoute[index]!.input)
	))
	const softOptions = resolveElbowSoftClearanceOptions(options.softClearance)
	const softEnabled = hasElbowSoftClearancePreference(softOptions)
	const plannedRoutes = baselineRoutes.map((route) => route)
	// Soft avoidance has a deterministic priority rather than a mutual rewrite:
	// authored/unselected routes are anchors, then automatic participants yield
	// in stable page order. That gives the local solve a repeatable tie-break.
	for (let index = 0; index < participants.length; index += 1) {
		const scene = scenesByRoute[index]
		if (lockedFlags[index] || !scene) continue
		const references: ElbowSoftRoute[] = softEnabled
			? plannedRoutes
				.filter((_, referenceIndex) => referenceIndex !== index && (
					lockedFlags[referenceIndex] || referenceIndex < index
				))
				.filter((route) => softClearanceCost(
					baselineRoutes[index].points,
					[route],
					softOptions,
				) > 1e-6 || softClearanceCost(
					currentRoutes[index].points,
					[route],
					softOptions,
				) > 1e-6)
				.map((route) => ({ points: route.points }))
			: []
		const input = references.length > 0
			? { ...scene.input, softClearance: { routes: references, options: softOptions } }
			: scene.input
		const planned = references.length > 0 ? planOrthogonalRoute(input) : baselineRoutes[index]
		const stable = stabilizeOrthogonalRoute(currentRoutes[index], planned, input)
		if (!routeClearsInput(stable, scene.input)) {
			lockedFlags[index] = true
			unresolved += 1
			plannedRoutes[index] = currentRoutes[index]
			continue
		}
		plannedRoutes[index] = stable
	}
	const report = nudgeRoutesWithoutObstacleCollisions(
		plannedRoutes,
		inputsByRoute,
		lockedFlags,
		options.spacing === undefined ? {} : { spacing: options.spacing },
	)
	// Channel spreading is deliberately independent from path planning. Keep
	// that useful parallel-rail pass, but reject any nudge that would undo the
	// selected route's soft-clearance win against its deterministic predecessors.
	const routes = report.routes.map((route, index) => {
		if (!softEnabled || lockedFlags[index] || routesHaveSamePoints(route, plannedRoutes[index])) return route
		const references = plannedRoutes
			.filter((_, referenceIndex) => referenceIndex !== index && (
				lockedFlags[referenceIndex] || referenceIndex < index
			))
			.map((reference) => ({ points: reference.points }))
		const beforeCost = softClearanceCost(plannedRoutes[index].points, references, softOptions)
		const afterCost = softClearanceCost(route.points, references, softOptions)
		return afterCost > beforeCost + 1e-6 ? plannedRoutes[index] : route
	})

	const edits: {
		id: TLShapeId
		type: typeof CONNECTION_SHAPE_TYPE
		props: {
			pins: []
			elbowRoute: ConnectionElbowRouteModel
			routeMode: 'automatic'
		}
	}[] = []
	participants.forEach((connection, index) => {
		if (!movable.has(connection.id) || lockedFlags[index]) return
		if (routesHaveSamePoints(currentRoutes[index], routes[index])) return
		edits.push({
			id: connection.id,
			type: CONNECTION_SHAPE_TYPE,
			props: {
				pins: [],
				elbowRoute: automaticRouteModel(editor, connection, routes[index]),
				routeMode: 'automatic',
			},
		})
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
		unresolved,
		revertedNudges: report.reverted.length,
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
	const containerScope = getSelectedContainerLayoutScope(editor)
	if (containerScope) {
		const scoped = new Set(containerScope.connections.map((connection) => connection.id))
		return connections.filter((connection) => scoped.has(connection.id))
	}
	const selectedShapes = editor.getSelectedShapes()
	const selectedBlocks = new Set(selectedShapes.filter(isBlockShape).map((shape) => shape.id))
	const selectedBranches = new Set(selectedShapes.filter(isBranchShape).map((shape) => shape.id))
	return connections.filter((connection) => {
		if (selected.has(connection.id)) return true
		const bound = editor.getBindingsFromShape(connection, 'connection').map((binding) => binding.toId)
		return bound.some((id) => selectedBlocks.has(id)
			|| selectedBranches.has(id)
			|| (selectedBranches.size > 0
				&& branchAncestry(editor, id).some((level) => selectedBranches.has(level.branch.id))))
	})
}

/** Resolve the currently painted connection polyline into page coordinates. */
export function routeInPage(editor: Editor, connection: ConnectionShape): ElbowRoute {
	const transform = editor.getShapePageTransform(connection)
	const route = getConnectionElbowRoute(editor, connection)
	return {
		...route,
		points: route.points.map((point) => {
			const pagePoint = Mat.applyToPoint(transform, point)
			return { x: pagePoint.x, y: pagePoint.y }
		}),
	}
}

/** Persist a page-space automatic route in the endpoint-relative authored model. */
export function automaticRouteModel(
	editor: Editor,
	connection: ConnectionShape,
	route: ElbowRoute,
): ConnectionElbowRouteModel {
	const inverse = Mat.Inverse(editor.getShapePageTransform(connection))
	const { source, sink } = getConnectionEndpoints(editor, connection)
	const localPoints = route.points.map((point) => Mat.applyToPoint(inverse, point))
	const startPoint = localPoints[1] ?? source
	const endPoint = localPoints.at(-2) ?? sink
	const startDistance = Math.abs(startPoint.x - source.x) + Math.abs(startPoint.y - source.y)
	const endDistance = Math.abs(endPoint.x - sink.x) + Math.abs(endPoint.y - sink.y)
	const legs: ElbowTerminalLegs = {
		...(startDistance < AUTHORED_PORT_LEG ? { startLeg: startDistance } : {}),
		...(endDistance < AUTHORED_PORT_LEG ? { endLeg: endDistance } : {}),
	}
	const dongles = dongleEndpoints(source, sink, legs)
	return captureResolvedRoute(localPoints, dongles.start, dongles.end, legs)
}
