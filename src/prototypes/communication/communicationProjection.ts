import { WeakCache, computed, type Computed, type Editor, type TLShapeId } from 'tldraw'

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

export const COMMUNICATION_PROTOTYPE_QUERY = 'communication'

export type CommunicationProjectionMode = 'wiring' | 'tagged' | 'components'
export type CommunicationComponentView = 'simple' | 'port'
export type CommunicationRouteStyle = 'elbow' | 'straight'
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
	focusedGroupKey: string | null
}

export const communicationProjection = new EditorAtom<CommunicationProjectionState>(
	'communication projection prototype',
	() => ({ mode: 'wiring', componentView: 'simple', routeStyle: 'elbow', focusedGroupKey: null }),
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
	displayId: string
	lane: number
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

export function isCommunicationPrototypeEnabled(): boolean {
	if (typeof window === 'undefined') return false
	return new URLSearchParams(window.location.search).get('prototype') === COMMUNICATION_PROTOTYPE_QUERY
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
	editor.selectNone()
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

export function applyCommunicationFocus(editor: Editor, groupKey: string | null): void {
	communicationProjection.update(editor, (state) => ({
		...state,
		focusedGroupKey: state.focusedGroupKey === groupKey ? null : groupKey,
	}))
	editor.selectNone()
}

export function phaseLabel(phase: CommunicationPhase): string {
	return phase === 'publish' ? 'topic' : phase
}
