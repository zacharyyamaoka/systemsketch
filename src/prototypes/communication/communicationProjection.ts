import { WeakCache, computed, isShapeId, type Computed, type Editor, type TLShapeId } from 'tldraw'

import { isBlockShape } from '../../blocks/blockModel'
import {
	getConnectionBindings,
	getConnectionDirection,
} from '../../blocks/connections/ConnectionBindingUtil'
import { getPortHostPort } from '../../blocks/connections/blockPorts'
import {
	CONNECTION_SHAPE_TYPE,
	type ConnectionRoutingKind,
} from '../../blocks/connections/connectionModel'
import type { ConnectionShape } from '../../blocks/connections/ConnectionShapeUtil'
import { EditorAtom } from '../../blocks/ports/portState'
import { isAsyncRegionShape } from '../../asyncRegion/asyncRegionModel'
import {
	inspectCommunicationChannel,
	parseCommunicationChannel,
	type CommunicationAssociationIssueKind,
	type CommunicationFamily,
	type CommunicationPhase,
} from './channelParser'

export {
	inspectCommunicationChannel,
	parseCommunicationChannel,
	phaseLabel,
	type CommunicationAssociationIssueKind,
	type CommunicationChannelInspection,
	type CommunicationFamily,
	type CommunicationPhase,
} from './channelParser'
import { setCommunicationLensScope } from '../../blocks/ports/portLens'

export const COMMUNICATION_PROTOTYPE_QUERY = 'communication'

/**
 * The two ways to read an Async region.
 *
 * `dataflow` is the signature — ports on the left and right lanes, cables
 * between them. `communication` is the topology — ports on any of the four
 * edges, relationships between components. This is the ONLY axis that moves a
 * port; card face and cable paint are independent of it.
 */
export type CommunicationLens = 'dataflow' | 'communication'
export type CommunicationComponentView = 'simple' | 'port' | 'expanded'
/**
 * What the cables say, independent of which lens is reading them.
 *
 * `data` is every canonical cable in its ordinary grey. `split` paints each
 * protocol leg separately, tagged with its phase. `summary` collapses each
 * relationship onto one cable.
 */
export type CommunicationCableStyle = 'data' | 'split' | 'summary'

export interface CommunicationProjectionState {
	lens: CommunicationLens
	componentView: CommunicationComponentView
	cableStyle: CommunicationCableStyle
	focusedGroupKey: string | null
	/** Null is the legacy query-gated whole-board prototype. */
	activeRegionId: TLShapeId | null
	/**
	 * Which of the three drawable patterns the link tool is armed with.
	 *
	 * Presentation state, like every other field here: arming a family selects
	 * a tool, and writes nothing to the document until an arrow actually lands.
	 */
	drawFamily: 'stream' | 'service' | 'action'
}

export const communicationProjection = new EditorAtom<CommunicationProjectionState>(
	'communication projection prototype',
	() => ({
		lens: 'dataflow',
		componentView: 'simple',
		cableStyle: 'data',
		focusedGroupKey: null,
		activeRegionId: null,
		drawFamily: 'stream',
	}),
)

export const COMMUNICATION_FAMILY_PAINT: Readonly<Record<CommunicationFamily, {
	ink: string
	soft: string
	monogram: string
}>> = {
	topic: { ink: '#118b6d', soft: '#dff8ef', monogram: 'T' },
	stream: { ink: '#7558d7', soft: '#eee9ff', monogram: '↝' },
	service: { ink: '#3971dd', soft: '#e7efff', monogram: 'S' },
	action: { ink: '#d27a0a', soft: '#fff1dc', monogram: 'A' },
}

export interface CommunicationDescriptor {
	connectionId: TLShapeId
	family: CommunicationFamily
	phase: CommunicationPhase
	name: string
	sourceShapeId: TLShapeId
	targetShapeId: TLShapeId
	sourcePortName: string
	targetPortName: string
	bidirectional: boolean
	groupKey: string
	pairKey: string
	/** The V1 inference seam. A source analyser can emit this descriptor later. */
	provenance: 'strict-port-name'
}

export interface CommunicationRelation extends CommunicationDescriptor {
	representativeId: TLShapeId
	edgeCount: number
	memberIds: TLShapeId[]
	memberDescriptors: CommunicationDescriptor[]
	displayId: string
	lane: number
}

export interface CommunicationRepresentativeCandidate {
	descriptor: CommunicationDescriptor
	pathLength: number
}


export interface CommunicationAssociationIssue {
	kind: CommunicationAssociationIssueKind
	message: string
	connectionId?: TLShapeId
	groupKey?: string
}

export interface CommunicationSummary {
	edgeCount: number
	taggedEdgeCount: number
	localValueEdgeCount: number
	neutralEdgeCount: number
	relations: CommunicationRelation[]
	issues: CommunicationAssociationIssue[]
}

const REPRESENTATIVE_PHASE_PRIORITY: Readonly<Record<CommunicationPhase, number>> = {
	goal: 0,
	request: 0,
	publish: 0,
	stream: 0,
	cancel: 1,
	feedback: 2,
	response: 3,
	result: 4,
}

function compareRepresentativeCandidates(
	a: CommunicationRepresentativeCandidate,
	b: CommunicationRepresentativeCandidate,
): number {
	return REPRESENTATIVE_PHASE_PRIORITY[a.descriptor.phase]
		- REPRESENTATIVE_PHASE_PRIORITY[b.descriptor.phase]
		|| String(a.descriptor.connectionId).localeCompare(String(b.descriptor.connectionId))
}

/**
 * The one leg a summary cable rides. There is deliberately no choice.
 *
 * WHY the selectors went away (Zach, 2026-09-06): "you do not get a choice.
 * The summary cable for the stream is set as only 1 option, for the service it
 * is always the request, for the action it is always the goal." A protocol's
 * INITIATING leg is the honest stand-in for the whole interaction — it is the
 * one that says who started it and in which direction — and offering Response
 * or Result or a shortest-path heuristic made a board's meaning depend on a
 * dropdown nobody could see in a screenshot. `REPRESENTATIVE_PHASE_PRIORITY`
 * already ranks goal, request, publish and stream first, so the rule is simply
 * the head of that order.
 */
export function chooseCommunicationRepresentative(
	family: CommunicationFamily,
	candidates: readonly CommunicationRepresentativeCandidate[],
): CommunicationDescriptor | null {
	if (candidates.length === 0) return null
	const ordered = [...candidates].sort(compareRepresentativeCandidates)
	// Cancel is a coordination side-channel and never speaks for an Action, so
	// it can only carry one when nothing else is there to.
	const eligible = family === 'action'
		? ordered.filter((candidate) => candidate.descriptor.phase !== 'cancel')
		: ordered
	return (eligible[0] ?? ordered[0]).descriptor
}

function orderedPair(a: TLShapeId, b: TLShapeId): [TLShapeId, TLShapeId] {
	return String(a).localeCompare(String(b)) <= 0 ? [a, b] : [b, a]
}

/** One canonical data edge, interpreted as one leg of a communication pattern. */
export function describeCommunicationConnection(
	editor: Editor,
	connection: ConnectionShape,
): CommunicationDescriptor | null {
	const bindings = getConnectionBindings(editor, connection)
	if (!bindings.start || !bindings.end) return null
	const direction = getConnectionDirection(editor, connection)
	const sourceBinding = bindings[direction.sourceTerminal]
	const targetBinding = bindings[direction.sinkTerminal]
	if (!sourceBinding || !targetBinding) return null
	const sourceShape = editor.getShape(sourceBinding.toId)
	const targetShape = editor.getShape(targetBinding.toId)
	if (!isBlockShape(sourceShape) || !isBlockShape(targetShape)) return null
	// A literal/value pill is local data, not a communicating component. It is
	// left untouched in Tagged wiring and omitted from the component projection.
	if (sourceShape.props.view === 'value' || targetShape.props.view === 'value') return null
	const sourcePort = getPortHostPort(editor, sourceShape, sourceBinding.props.portId)
	const targetPort = getPortHostPort(editor, targetShape, targetBinding.props.portId)
	if (!sourcePort || !targetPort) return null
	const parsed = parseCommunicationChannel(sourcePort.name, targetPort.name)
	if (!parsed) return null
	const [left, right] = orderedPair(sourceShape.id, targetShape.id)
	const pairKey = `${left}|${right}`
	return {
		connectionId: connection.id,
		...parsed,
		sourceShapeId: sourceShape.id,
		targetShapeId: targetShape.id,
		sourcePortName: sourcePort.name,
		targetPortName: targetPort.name,
		pairKey,
		groupKey: `${pairKey}|${parsed.family}|${parsed.name.toLowerCase()}`,
	}
}

/**
 * Collapse protocol legs into component relationships while retaining one
 * representative connection record as the renderer's supported tldraw seam.
 */
function computeCommunicationRelations(editor: Editor): CommunicationSummary {
	const connections = editor.getCurrentPageShapes()
		.filter((shape): shape is ConnectionShape => shape.type === CONNECTION_SHAPE_TYPE)
		.filter((connection) => isConnectionInCommunicationScope(editor, connection))
	let localValueEdgeCount = 0
	const issues: CommunicationAssociationIssue[] = []
	const described = connections.flatMap((connection) => {
		const descriptor = describeCommunicationConnection(editor, connection)
		if (!descriptor) {
			const bindings = getConnectionBindings(editor, connection)
			if (!bindings.start || !bindings.end) return []
			const direction = getConnectionDirection(editor, connection)
			const sourceBinding = bindings[direction.sourceTerminal]
			const targetBinding = bindings[direction.sinkTerminal]
			if (!sourceBinding || !targetBinding) return []
			const sourceShape = editor.getShape(sourceBinding.toId)
			const targetShape = editor.getShape(targetBinding.toId)
			if (!isBlockShape(sourceShape) || !isBlockShape(targetShape)) return []
			if (sourceShape.props.view === 'value' || targetShape.props.view === 'value') {
				localValueEdgeCount += 1
				return []
			}
			const sourcePort = getPortHostPort(editor, sourceShape, sourceBinding.props.portId)
			const targetPort = getPortHostPort(editor, targetShape, targetBinding.props.portId)
			if (!sourcePort || !targetPort) return []
			const inspection = inspectCommunicationChannel(sourcePort.name, targetPort.name)
			if (inspection.issue) issues.push({ ...inspection.issue, connectionId: connection.id })
			return []
		}
		return descriptor ? [descriptor] : []
	})
	const groups = new Map<string, CommunicationDescriptor[]>()
	for (const descriptor of described) {
		const group = groups.get(descriptor.groupKey)
		if (group) group.push(descriptor)
		else groups.set(descriptor.groupKey, [descriptor])
	}
	const unslotted = [...groups.values()].map((members) => {
		// WHY: an aggregate relationship still needs one honest route back to its
		// source dataflow. Dora's initiating leg is the stable carrier: Action uses
		// goal, Service uses request, and Topic/Stream already have one data track.
		members.sort((a, b) =>
			REPRESENTATIVE_PHASE_PRIORITY[a.phase] - REPRESENTATIVE_PHASE_PRIORITY[b.phase]
			|| String(a.connectionId).localeCompare(String(b.connectionId)))
		return {
			...members[0],
			representativeId: members[0].connectionId,
			edgeCount: members.length,
			memberIds: members.map((member) => member.connectionId),
			memberDescriptors: [...members],
			displayId: '',
			lane: 0,
		}
	})
	for (const relation of unslotted) {
		const members = groups.get(relation.groupKey) ?? []
		const phases = new Map<CommunicationPhase, CommunicationDescriptor[]>()
		for (const member of members) {
			const phaseMembers = phases.get(member.phase)
			if (phaseMembers) phaseMembers.push(member)
			else phases.set(member.phase, [member])
		}
		const required = relation.family === 'action'
			? (['goal', 'result'] as const)
			: relation.family === 'service'
				? (['request', 'response'] as const)
				: []
		for (const phase of required) {
			if (!phases.has(phase)) issues.push({
				kind: 'missing-required-phase',
				groupKey: relation.groupKey,
				message: `${relation.family} ${relation.name} is missing its ${phase} leg`,
			})
		}
		for (const [phase, phaseMembers] of phases) {
			if (phaseMembers.length > 1) issues.push({
				kind: 'duplicate-phase',
				groupKey: relation.groupKey,
				message: `${relation.family} ${relation.name} has ${phaseMembers.length} ${phase} legs`,
			})
		}
		const initiator = members.find((member) => member.phase === 'goal' || member.phase === 'request')
		if (initiator) {
			for (const member of members) {
				const returns = member.phase === 'response' || member.phase === 'feedback' || member.phase === 'result'
				const expectedSource = returns ? initiator.targetShapeId : initiator.sourceShapeId
				const expectedTarget = returns ? initiator.sourceShapeId : initiator.targetShapeId
				if (member.sourceShapeId !== expectedSource || member.targetShapeId !== expectedTarget) {
					issues.push({
						kind: 'reversed-phase',
						connectionId: member.connectionId,
						groupKey: relation.groupKey,
						message: `${relation.family} ${relation.name}.${member.phase} runs opposite its expected direction`,
					})
				}
			}
		}
	}
	const byPair = new Map<string, CommunicationRelation[]>()
	for (const relation of unslotted) {
		const siblings = byPair.get(relation.pairKey)
		if (siblings) siblings.push(relation)
		else byPair.set(relation.pairKey, [relation])
	}
	let relations: CommunicationRelation[] = []
	for (const siblings of byPair.values()) {
		siblings.sort((a, b) => `${a.family}:${a.name}`.localeCompare(`${b.family}:${b.name}`))
		for (let index = 0; index < siblings.length; index += 1) {
			relations.push({ ...siblings[index], lane: index - (siblings.length - 1) / 2 })
		}
	}
	const familyOrder: Readonly<Record<CommunicationFamily, number>> = {
		action: 0,
		service: 1,
		topic: 2,
		stream: 3,
	}
	const familyPrefix: Readonly<Record<CommunicationFamily, string>> = {
		action: 'A',
		service: 'S',
		topic: 'T',
		stream: 'ST',
	}
	relations = relations.sort((a, b) =>
		familyOrder[a.family] - familyOrder[b.family]
		|| a.name.localeCompare(b.name)
		|| a.pairKey.localeCompare(b.pairKey))
	const counters: Partial<Record<CommunicationFamily, number>> = {}
	relations = relations.map((relation) => {
		const ordinal = (counters[relation.family] ?? 0) + 1
		counters[relation.family] = ordinal
		return { ...relation, displayId: `${familyPrefix[relation.family]}${ordinal}` }
	})
	return {
		edgeCount: connections.length,
		taggedEdgeCount: described.length,
		localValueEdgeCount,
		neutralEdgeCount: connections.length - described.length,
		relations,
		issues,
	}
}

const communicationSummaryCache = new WeakCache<Editor, Computed<CommunicationSummary>>()

/** One reactive derivation is shared by the controls and every painted edge. */
export function collectCommunicationRelations(editor: Editor): CommunicationSummary {
	return communicationSummaryCache
		.get(editor, () => computed(
			'communication relationships',
			() => computeCommunicationRelations(editor),
		))
		.get()
}

export function isCommunicationPrototypeQueryEnabled(): boolean {
	if (typeof window === 'undefined') return false
	return new URLSearchParams(window.location.search).get('prototype') === COMMUNICATION_PROTOTYPE_QUERY
}

export function activeCommunicationRegionId(editor: Editor): TLShapeId | null {
	const id = communicationProjection.get(editor).activeRegionId
	return id && isAsyncRegionShape(editor.getShape(id)) ? id : null
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

/** True for the selected region's contents, or every shape in the legacy prototype URL. */
export function isShapeInCommunicationScope(editor: Editor, shapeId: TLShapeId): boolean {
	const regionId = activeCommunicationRegionId(editor)
	return regionId
		? shapeIsInRegion(editor, shapeId, regionId)
		: isCommunicationPrototypeQueryEnabled()
}

/** A relationship belongs to a region only when both component endpoints do. */
export function isConnectionInCommunicationScope(
	editor: Editor,
	connection: ConnectionShape,
): boolean {
	const regionId = activeCommunicationRegionId(editor)
	if (!regionId) return isCommunicationPrototypeQueryEnabled()
	const bindings = getConnectionBindings(editor, connection)
	return Boolean(
		bindings.start
		&& bindings.end
		&& shapeIsInRegion(editor, bindings.start.toId, regionId)
		&& shapeIsInRegion(editor, bindings.end.toId, regionId),
	)
}

export function isCommunicationPrototypeEnabled(editor?: Editor): boolean {
	return isCommunicationPrototypeQueryEnabled()
		|| Boolean(editor && activeCommunicationRegionId(editor))
}

/** Enter or leave the transient communication lens for one durable region. */
/**
 * The single write path for projection state.
 *
 * WHY funnelled: `portLens` mirrors the two facts the port layout needs, and a
 * mirror with more than one writer drifts. Every `apply*` below goes through
 * here, so the lens the geometry uses cannot disagree with the lens the chrome
 * is showing.
 */
function updateProjection(
	editor: Editor,
	update: (state: CommunicationProjectionState) => CommunicationProjectionState,
): void {
	const next = communicationProjection.update(editor, update)
	// Only the lens relocates a socket. Cable style is paint and never moves a
	// port, which is what lets Split and Summary be read in either lens.
	const inCommunicationLens = next.lens === 'communication'
	setCommunicationLensScope(editor, {
		regionId: inCommunicationLens ? next.activeRegionId : null,
		wholeBoard: inCommunicationLens
			&& next.activeRegionId === null
			&& isCommunicationPrototypeQueryEnabled(),
	})
}

export function applyActiveCommunicationRegion(editor: Editor, regionId: TLShapeId | null): void {
	const valid = regionId && isAsyncRegionShape(editor.getShape(regionId)) ? regionId : null
	updateProjection(editor, (state) => ({
		...state,
		activeRegionId: valid,
		focusedGroupKey: valid === state.activeRegionId ? state.focusedGroupKey : null,
	}))
}

export function applyCommunicationLens(editor: Editor, lens: CommunicationLens): void {
	updateProjection(editor, (state) => ({
		...state,
		lens,
		// The two lenses have opposite honest defaults, and switching should land
		// on the useful one rather than on whatever the other lens was showing:
		// Dataflow means grey cables, Communication means one arrow per
		// relationship. An explicit cable choice inside a lens still stands.
		// WHY the communication lens has no card or cable choice at all (Zach,
		// 2026-09-06): "in the communication mode, blocks only are in simple
		// view, and cables are only in summary view." Every other combination
		// was reachable and none of them helped: Port cards there crowded four
		// walls with sockets no arrow led to, and Split cables replaced the one
		// arrow you drew with the legs it expands into, which is the Dataflow
		// question asked in the wrong lens. Dataflow keeps both choices.
		cableStyle: lens === 'communication'
			? 'summary'
			: (state.cableStyle === 'summary' ? 'data' : state.cableStyle),
		componentView: lens === 'communication'
			? 'simple'
			: (state.componentView === 'simple' ? 'port' : state.componentView),
		focusedGroupKey: null,
	}))
}

export function applyCommunicationCableStyle(
	editor: Editor,
	cableStyle: CommunicationCableStyle,
): void {
	updateProjection(editor, (state) => ({
		...state,
		cableStyle,
		focusedGroupKey: cableStyle === 'data' ? null : state.focusedGroupKey,
	}))
}

export function applyCommunicationComponentView(
	editor: Editor,
	componentView: CommunicationComponentView,
): void {
	updateProjection(editor, (state) => ({ ...state, componentView }))
}

export function applyCommunicationDrawFamily(
	editor: Editor,
	drawFamily: CommunicationProjectionState['drawFamily'],
): void {
	updateProjection(editor, (state) => ({ ...state, drawFamily }))
}

/**
 * Set the shape of every cable inside the active region.
 *
 * WHY this writes the document rather than a projection field: cable shape is
 * already a real per-cable style (`ConnectionRoutingStyle`), settable on one
 * selected cable through the ordinary selection menu. A second presentation-only
 * copy of the same idea would let the bar and the cable disagree about what
 * shape a cable is. So the bar is a BULK EDIT of the thing that already exists —
 * "you can change them individually, but that top thing just allows you to do it
 * for all of them inside."
 */
export function applyCommunicationCableRouting(
	editor: Editor,
	routing: ConnectionRoutingKind,
): number {
	const regionId = activeCommunicationRegionId(editor)
	const targets = editor.getCurrentPageShapes().filter((shape): shape is ConnectionShape => {
		if (shape.type !== CONNECTION_SHAPE_TYPE) return false
		if (!regionId) return isCommunicationPrototypeQueryEnabled()
		return isConnectionInCommunicationScope(editor, shape as ConnectionShape)
	}).filter((connection) => connection.props.routing !== routing)
	if (targets.length === 0) return 0
	editor.markHistoryStoppingPoint(`use ${routing} cables in this region`)
	editor.updateShapes(targets.map((connection) => ({
		id: connection.id,
		type: CONNECTION_SHAPE_TYPE,
		props: { routing },
	})))
	return targets.length
}

/** What the bar should show: the one shape every cable agrees on, else null. */
export function communicationCableRouting(editor: Editor): ConnectionRoutingKind | null {
	const regionId = activeCommunicationRegionId(editor)
	const routings = new Set(editor.getCurrentPageShapes()
		.filter((shape): shape is ConnectionShape => shape.type === CONNECTION_SHAPE_TYPE)
		.filter((connection) => (regionId
			? isConnectionInCommunicationScope(editor, connection)
			: isCommunicationPrototypeQueryEnabled()))
		.map((connection) => connection.props.routing))
	return routings.size === 1 ? [...routings][0] : null
}

export function applyCommunicationFocus(editor: Editor, groupKey: string | null): void {
	updateProjection(editor, (state) => ({
		...state,
		focusedGroupKey: groupKey,
	}))
}

export function selectedCommunicationGroupKey(
	summary: CommunicationSummary,
	selectedShapeIds: readonly TLShapeId[],
): string | null {
	if (selectedShapeIds.length !== 1) return null
	const selectedId = selectedShapeIds[0]
	return summary.relations.find((relation) => relation.memberIds.includes(selectedId))?.groupKey ?? null
}

