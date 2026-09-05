import { type Editor, type TLShapeId } from 'tldraw'

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
}

export const communicationProjection = new EditorAtom<CommunicationProjectionState>(
	'communication projection prototype',
	() => ({ mode: 'wiring', componentView: 'simple', routeStyle: 'elbow' }),
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
}

export interface CommunicationRelation extends CommunicationDescriptor {
	representativeId: TLShapeId
	edgeCount: number
	lane: number
}

export interface CommunicationSummary {
	edgeCount: number
	taggedEdgeCount: number
	localValueEdgeCount: number
	relations: CommunicationRelation[]
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
export function parseCommunicationChannel(
	sourcePortName: string,
	targetPortName: string,
): Pick<CommunicationDescriptor, 'family' | 'phase' | 'name' | 'bidirectional'> {
	const sourceToken = finalToken(sourcePortName)
	const targetToken = finalToken(targetPortName)
	const token = [sourceToken, targetToken].find((candidate) => candidate in ACTION_PHASES)
	if (token) {
		return {
			family: 'action',
			phase: ACTION_PHASES[token],
			name: communicationName(sourcePortName || targetPortName, token),
			bidirectional: true,
		}
	}
	const serviceToken = [sourceToken, targetToken].find((candidate) => candidate in SERVICE_PHASES)
	if (serviceToken) {
		return {
			family: 'service',
			phase: SERVICE_PHASES[serviceToken],
			name: communicationName(sourcePortName || targetPortName, serviceToken),
			bidirectional: true,
		}
	}
	const stream = [sourceToken, targetToken].some((candidate) =>
		['stream', 'preview', 'chunk', 'chunks'].includes(candidate))
	if (stream) {
		return {
			family: 'stream',
			phase: 'stream',
			name: communicationName(sourcePortName || targetPortName, sourceToken),
			bidirectional: false,
		}
	}
	return {
		family: 'topic',
		phase: 'publish',
		name: sourcePortName.trim() || targetPortName.trim() || 'message',
		bidirectional: false,
	}
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
export function collectCommunicationRelations(editor: Editor): CommunicationSummary {
	const connections = editor.getCurrentPageShapes()
		.filter((shape): shape is ConnectionShape => shape.type === CONNECTION_SHAPE_TYPE)
	const described = connections.flatMap((connection) => {
		const descriptor = describeCommunicationConnection(editor, connection)
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
			lane: 0,
		}
	})
	const byPair = new Map<string, CommunicationRelation[]>()
	for (const relation of unslotted) {
		const siblings = byPair.get(relation.pairKey)
		if (siblings) siblings.push(relation)
		else byPair.set(relation.pairKey, [relation])
	}
	const relations: CommunicationRelation[] = []
	for (const siblings of byPair.values()) {
		siblings.sort((a, b) => `${a.family}:${a.name}`.localeCompare(`${b.family}:${b.name}`))
		for (let index = 0; index < siblings.length; index += 1) {
			relations.push({ ...siblings[index], lane: index - (siblings.length - 1) / 2 })
		}
	}
	return {
		edgeCount: connections.length,
		taggedEdgeCount: described.length,
		localValueEdgeCount: connections.length - described.length,
		relations: relations.sort((a, b) => String(a.representativeId).localeCompare(String(b.representativeId))),
	}
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
	communicationProjection.update(editor, (state) => ({ ...state, mode }))
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

export function phaseLabel(phase: CommunicationPhase): string {
	return phase === 'publish' ? 'topic' : phase
}
