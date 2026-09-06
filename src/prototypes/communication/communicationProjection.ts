import { WeakCache, computed, isShapeId, type Computed, type Editor, type TLShapeId } from 'tldraw'

import { isBlockShape } from '../../blocks/blockModel'
import {
	getConnectionBindings,
	getConnectionDirection,
} from '../../blocks/connections/ConnectionBindingUtil'
import { getPortHostPort } from '../../blocks/connections/blockPorts'
import {
	CONNECTION_SHAPE_TYPE,
} from '../../blocks/connections/connectionModel'
import type { ConnectionShape } from '../../blocks/connections/ConnectionShapeUtil'
import { EditorAtom } from '../../blocks/ports/portState'
import { isAsyncRegionShape } from '../../asyncRegion/asyncRegionModel'

export const COMMUNICATION_PROTOTYPE_QUERY = 'communication'

export type CommunicationProjectionMode = 'wiring' | 'tagged' | 'components'
export type CommunicationComponentView = 'simple' | 'port'
export type CommunicationRouteStyle = 'elbow' | 'straight'
export type CommunicationServiceTrack = 'request' | 'response' | 'shortest'
export type CommunicationActionTrack = 'goal' | 'feedback' | 'result' | 'shortest'
export type CommunicationFamily = 'topic' | 'stream' | 'service' | 'action'
export type CommunicationPhase =
	| 'publish'
	| 'stream'
	| 'request'
	| 'response'
	| 'goal'
	| 'cancel'
	| 'feedback'
	| 'result'

export interface CommunicationProjectionState {
	mode: CommunicationProjectionMode
	componentView: CommunicationComponentView
	routeStyle: CommunicationRouteStyle
	serviceTrack: CommunicationServiceTrack
	actionTrack: CommunicationActionTrack
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
		mode: 'wiring',
		componentView: 'simple',
		routeStyle: 'elbow',
		serviceTrack: 'request',
		actionTrack: 'goal',
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

export type CommunicationAssociationIssueKind =
	| 'missing-interaction-name'
	| 'conflicting-endpoint-claims'
	| 'missing-required-phase'
	| 'duplicate-phase'
	| 'reversed-phase'

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

const ACTION_PHASES: Readonly<Record<string, CommunicationPhase>> = {
	goal: 'goal',
	cancel: 'cancel',
	feedback: 'feedback',
	result: 'result',
}

const SERVICE_PHASES: Readonly<Record<string, CommunicationPhase>> = {
	req: 'request',
	request: 'request',
	query: 'request',
	reply: 'response',
	response: 'response',
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
 * Pick the real protocol leg whose existing geometry carries a collapsed edge.
 *
 * `pathLength` is supplied by the renderer because it owns the routed cable
 * geometry. Keeping the policy here leaves the communication model independent
 * of ConnectionShapeUtil and avoids a semantic↔presentation import cycle.
 */
export function chooseCommunicationRepresentative(
	family: CommunicationFamily,
	candidates: readonly CommunicationRepresentativeCandidate[],
	policy: CommunicationServiceTrack | CommunicationActionTrack,
): CommunicationDescriptor | null {
	if (candidates.length === 0) return null
	const ordered = [...candidates].sort(compareRepresentativeCandidates)
	const fallback = ordered[0].descriptor
	if (family === 'topic' || family === 'stream') return fallback
	if (policy !== 'shortest') {
		return ordered.find((candidate) => candidate.descriptor.phase === policy)?.descriptor ?? fallback
	}
	const eligible = family === 'action'
		? ordered.filter((candidate) => candidate.descriptor.phase !== 'cancel')
		: ordered
	// WHY: Cancel is a coordination side-channel, not the work or outcome a
	// compact Action line normally stands for. It remains visible on expansion,
	// but does not unexpectedly win merely because its ports happen to be close.
	const measurable = (eligible.length > 0 ? eligible : ordered)
		.filter((candidate) => Number.isFinite(candidate.pathLength))
		.sort((a, b) => a.pathLength - b.pathLength || compareRepresentativeCandidates(a, b))
	return measurable[0]?.descriptor ?? fallback
}

function finalToken(name: string): string {
	return name.trim().toLowerCase().split(/[._:/-]+/).filter(Boolean).at(-1) ?? ''
}

function communicationName(name: string, phase: string): string {
	const normalized = name.trim()
	if (normalized === '') return phase
	const tokens = normalized.split(/[._:/-]+/).filter(Boolean)
	if (tokens.length > 1 && tokens.at(-1)?.toLowerCase() === phase) tokens.pop()
	return tokens.join('.') || phase
}

/**
 * Parse Dora-style well-known channel names without changing the edge model.
 *
 * The prototype intentionally reads the port names already carried by the
 * canonical dataflow. It does not write a second service/action graph merely
 * to paint one: the derived family and phase can later be replaced by a richer
 * analyzer without changing either projection.
 */
type ParsedCommunicationChannel = Pick<
	CommunicationDescriptor,
	'family' | 'phase' | 'name' | 'bidirectional' | 'provenance'
>

export interface CommunicationChannelInspection {
	parsed: ParsedCommunicationChannel | null
	issue: Omit<CommunicationAssociationIssue, 'connectionId'> | null
}

interface MultiLegCandidate {
	family: 'action' | 'service'
	phase: CommunicationPhase
	name: string | null
}

function multiLegCandidate(name: string): MultiLegCandidate | null {
	const token = finalToken(name)
	const family = token in ACTION_PHASES ? 'action' : token in SERVICE_PHASES ? 'service' : null
	if (!family) return null
	return {
		family,
		phase: family === 'action' ? ACTION_PHASES[token] : SERVICE_PHASES[token],
		name: name.trim().split(/[._:/-]+/).filter(Boolean).length > 1
			? communicationName(name, token)
			: null,
	}
}

/**
 * Strict V1 inference for a canonical data edge.
 *
 * Action and Service are multi-leg protocols, so a bare `goal` or `response`
 * cannot identify which interaction owns the leg. At least one endpoint must
 * provide `interaction.phase`; if both endpoints make claims, they must agree.
 * Topic and Stream remain single-edge classifications and need no grouping key.
 */
export function inspectCommunicationChannel(
	sourcePortName: string,
	targetPortName: string,
): CommunicationChannelInspection {
	const sourceClaim = multiLegCandidate(sourcePortName)
	const targetClaim = multiLegCandidate(targetPortName)
	const claims = [sourceClaim, targetClaim].filter((claim): claim is MultiLegCandidate => Boolean(claim))
	if (claims.length > 0) {
		const namedClaims = claims.filter((claim) => claim.name !== null)
		if (namedClaims.length === 0) {
			return {
				parsed: null,
				issue: {
					kind: 'missing-interaction-name',
					message: `Reserved phase name needs an interaction prefix: ${sourcePortName} → ${targetPortName}`,
				},
			}
		}
		const canonical = namedClaims[0]
		const conflict = namedClaims.find((claim) =>
			claim.family !== canonical.family
			|| claim.phase !== canonical.phase
			|| claim.name?.toLowerCase() !== canonical.name?.toLowerCase())
		if (conflict) {
			return {
				parsed: null,
				issue: {
					kind: 'conflicting-endpoint-claims',
					message: `Endpoint protocol claims disagree: ${sourcePortName} → ${targetPortName}`,
				},
			}
		}
		return {
			parsed: {
				family: canonical.family,
				phase: canonical.phase,
				name: canonical.name!,
				bidirectional: true,
				provenance: 'strict-port-name',
			},
			issue: null,
		}
	}
	const sourceToken = finalToken(sourcePortName)
	const targetToken = finalToken(targetPortName)
	const stream = [sourceToken, targetToken].some((candidate) =>
		['stream', 'preview', 'chunk', 'chunks'].includes(candidate))
	if (stream) {
		return {
			parsed: {
				family: 'stream',
				phase: 'stream',
				name: communicationName(sourcePortName || targetPortName, sourceToken),
				bidirectional: false,
				provenance: 'strict-port-name',
			},
			issue: null,
		}
	}
	return {
		parsed: {
			family: 'topic',
			phase: 'publish',
			name: sourcePortName.trim() || targetPortName.trim() || 'message',
			bidirectional: false,
			provenance: 'strict-port-name',
		},
		issue: null,
	}
}

export function parseCommunicationChannel(
	sourcePortName: string,
	targetPortName: string,
): ParsedCommunicationChannel | null {
	return inspectCommunicationChannel(sourcePortName, targetPortName).parsed
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
export function applyActiveCommunicationRegion(editor: Editor, regionId: TLShapeId | null): void {
	const valid = regionId && isAsyncRegionShape(editor.getShape(regionId)) ? regionId : null
	communicationProjection.update(editor, (state) => ({
		...state,
		activeRegionId: valid,
		focusedGroupKey: valid === state.activeRegionId ? state.focusedGroupKey : null,
	}))
}

export function applyCommunicationProjectionMode(
	editor: Editor,
	mode: CommunicationProjectionMode,
): void {
	// The projection changes paint only. In particular, Simple is rendered at
	// the stored Port box rather than writing the Block's view or remembered
	// dimensions, so switching lenses cannot dirty the document.
	communicationProjection.update(editor, (state) => ({
		...state,
		mode,
		focusedGroupKey: mode === 'wiring' ? null : state.focusedGroupKey,
	}))
}

export function applyCommunicationComponentView(
	editor: Editor,
	componentView: CommunicationComponentView,
): void {
	communicationProjection.update(editor, (state) => ({ ...state, componentView }))
}

export function applyCommunicationRouteStyle(editor: Editor, routeStyle: CommunicationRouteStyle): void {
	communicationProjection.update(editor, (state) => ({ ...state, routeStyle }))
}

export function applyCommunicationServiceTrack(editor: Editor, serviceTrack: CommunicationServiceTrack): void {
	communicationProjection.update(editor, (state) => ({ ...state, serviceTrack }))
}

export function applyCommunicationActionTrack(editor: Editor, actionTrack: CommunicationActionTrack): void {
	communicationProjection.update(editor, (state) => ({ ...state, actionTrack }))
}

export function applyCommunicationDrawFamily(
	editor: Editor,
	drawFamily: CommunicationProjectionState['drawFamily'],
): void {
	communicationProjection.update(editor, (state) => ({ ...state, drawFamily }))
}

export function applyCommunicationFocus(editor: Editor, groupKey: string | null): void {
	communicationProjection.update(editor, (state) => ({
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

export function phaseLabel(phase: CommunicationPhase): string {
	return phase === 'publish' ? 'topic' : phase
}
