import { createShapeId, type Editor, type TLShapeId } from 'tldraw'

import {
	BLOCK_SHAPE_TYPE,
	FIRST_BODY_ROW,
	isBlockShape,
	normalizeBlockPortRows,
	type BlockPort,
	type BlockShape,
} from '../../blocks/blockModel'
import { createOrUpdateConnectionBinding } from '../../blocks/connections/ConnectionBindingUtil'
import { getPortHostPort } from '../../blocks/connections/blockPorts'
import { pairBlockFaces } from '../../blocks/connections/connectionScope'
import { CONNECTION_SHAPE_TYPE } from '../../blocks/connections/connectionModel'
import { applyAsyncRegionConnectionDefault } from '../../asyncRegion/asyncRegionModel'
import type { CommunicationFamily, CommunicationPhase, CommunicationRelation } from './communicationProjection'

/**
 * The three arrows a communication view can author.
 *
 * `topic` is deliberately absent. It is what an *un-annotated* plain data edge
 * already projects as — the parser's fallback — so offering it as a drawable
 * pattern would ask which of two spellings of "a message goes that way" the
 * author meant, when only one of them can be read back unambiguously.
 */
export const COMMUNICATION_DRAW_FAMILIES = ['stream', 'service', 'action'] as const
export type CommunicationDrawFamily = (typeof COMMUNICATION_DRAW_FAMILIES)[number]

export function isCommunicationDrawFamily(value: unknown): value is CommunicationDrawFamily {
	return COMMUNICATION_DRAW_FAMILIES.includes(value as CommunicationDrawFamily)
}

/**
 * Which way one leg of a protocol runs, relative to the drawn arrow.
 *
 * `forward` follows the arrow the author drew; `back` returns along it. This
 * is the whole meaning of the arrowhead: for Service it names the client, for
 * Action the component that sends the goal. Nothing else reads direction.
 */
export type CommunicationLegDirection = 'forward' | 'back'

export interface CommunicationLegSpec {
	phase: CommunicationPhase
	direction: CommunicationLegDirection
}

/**
 * The canonical data legs each drawn pattern expands into.
 *
 * WHY: Action deliberately generates goal, feedback and result but NOT cancel.
 * The existing projection already treats cancel as a coordination side-channel
 * rather than the work or the outcome — `chooseCommunicationRepresentative`
 * refuses to let it win Shortest for exactly that reason. Emitting a fourth
 * cable nobody asked for on every Action would make the common case noisier to
 * pay for the rare one; cancel stays available by wiring a `name.cancel` pair
 * by hand, which the parser already reads.
 */
export const COMMUNICATION_PROTOCOL_LEGS: Readonly<
	Record<CommunicationDrawFamily, readonly CommunicationLegSpec[]>
> = {
	stream: [{ phase: 'stream', direction: 'forward' }],
	service: [
		{ phase: 'request', direction: 'forward' },
		{ phase: 'response', direction: 'back' },
	],
	action: [
		{ phase: 'goal', direction: 'forward' },
		{ phase: 'feedback', direction: 'back' },
		{ phase: 'result', direction: 'back' },
	],
}

/** What the arrow's two ends are called, per family, for labels and a11y text. */
export const COMMUNICATION_ROLE_LABELS: Readonly<
	Record<CommunicationDrawFamily, { initiator: string; responder: string }>
> = {
	stream: { initiator: 'publisher', responder: 'subscriber' },
	service: { initiator: 'client', responder: 'server' },
	action: { initiator: 'client', responder: 'server' },
}

/**
 * The token a phase contributes to a generated port name.
 *
 * These are exactly the spellings `inspectCommunicationChannel` recognises, so
 * a generated board reads back as the relationship that generated it. The two
 * tables are asserted equal in `communicationAuthoring.test.ts`; that test is
 * the contract that keeps the round trip honest.
 */
const PHASE_PORT_TOKEN: Readonly<Record<CommunicationPhase, string>> = {
	publish: '',
	stream: 'stream',
	request: 'request',
	response: 'response',
	goal: 'goal',
	cancel: 'cancel',
	feedback: 'feedback',
	result: 'result',
}

/**
 * Fold an authored interaction name into the parser's own canonical spelling.
 *
 * WHY dots, not underscores: the reader splits a port name on `[._:/-]` and
 * rejoins what is left with `.`, so a dot-joined name is the only form that
 * survives being written and read back. `move_base` looks safer and is not —
 * it comes back as `move.base`, and a name that changes spelling on the round
 * trip splits one relationship's legs across two group keys. The round-trip
 * test in `communicationAuthoring.test.ts` is what proves this, and it caught
 * exactly that bug.
 */
export function communicationNameSlug(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join('.')
}

/** `move` + `goal` → `move.goal`: the name the strict V1 parser reads back. */
export function communicationPortName(name: string, phase: CommunicationPhase): string {
	const token = PHASE_PORT_TOKEN[phase]
	return token ? `${name}.${token}` : name
}

/**
 * A generated port's durable identity.
 *
 * Deterministic on purpose: drawing the same relationship twice finds the
 * ports it already made instead of stacking a second, identical set beside
 * them. The editable *name* stays the thing a person changes.
 */
export function communicationPortId(
	family: CommunicationDrawFamily,
	name: string,
	phase: CommunicationPhase,
): string {
	return `comm:${family}:${communicationNameSlug(name)}:${phase}`
}

function blockTitleSlug(editor: Editor, shapeId: TLShapeId): string {
	const shape = editor.getShape(shapeId)
	return isBlockShape(shape) ? communicationNameSlug(shape.props.title) : ''
}

/**
 * True when this relationship's legs are already spelled on either end.
 *
 * Matched on the port NAME, not its id: a renamed relationship keeps the id it
 * was born with (ids are durable identity — see `BlockPort`), so an id probe
 * would report a renamed `dock` interaction as a free `robot` one and let a
 * second relationship collide with its group key.
 */
function linkAlreadyExists(
	editor: Editor,
	family: CommunicationDrawFamily,
	name: string,
	initiatorId: TLShapeId,
	responderId: TLShapeId,
): boolean {
	const wanted = new Set(COMMUNICATION_PROTOCOL_LEGS[family]
		.map((leg) => communicationPortName(name, leg.phase)))
	return [initiatorId, responderId].some((shapeId) => {
		const shape = editor.getShape(shapeId)
		if (!isBlockShape(shape)) return false
		return [...shape.props.inputs, ...shape.props.outputs].some((port) => wanted.has(port.name))
	})
}

/**
 * The name a freshly drawn relationship starts with.
 *
 * WHY a component's own title, not an anonymous ordinal: `battery.request`
 * says what the call is for the moment it appears, and a default a person
 * immediately understands is one they will actually rename rather than leave.
 * This is an authoring default in the same sense the Async region's is — read
 * once, at creation — never a derivation kept in sync with the title.
 *
 * WHY the two families take opposite ends: a stream is named by what it
 * CARRIES, which is the publisher (`camera.stream`), while a service or action
 * is named by what is PROVIDED, which is the server (`battery.request`).
 * Naming a stream after its subscriber would label the channel with the one
 * component that has no say in what flows down it.
 */
export function defaultCommunicationName(
	editor: Editor,
	family: CommunicationDrawFamily,
	initiatorId: TLShapeId,
	responderId: TLShapeId,
): string {
	const namedEnd = family === 'stream' ? initiatorId : responderId
	const base = blockTitleSlug(editor, namedEnd) || family
	if (!linkAlreadyExists(editor, family, base, initiatorId, responderId)) return base
	// The disambiguating suffix goes through the slug too: `battery_2` would be
	// re-read as `battery.2` by the parser, so it has to be written that way.
	for (let ordinal = 2; ordinal < 100; ordinal += 1) {
		const candidate = communicationNameSlug(`${base} ${ordinal}`)
		if (!linkAlreadyExists(editor, family, candidate, initiatorId, responderId)) return candidate
	}
	return communicationNameSlug(`${base} ${editor.getCurrentPageShapeIds().size}`)
}

export interface MaterializeCommunicationLinkOptions {
	family: CommunicationDrawFamily
	/** The arrow's tail: publisher, or the client that sends the request/goal. */
	initiatorId: TLShapeId
	/** The arrow's head: subscriber, or the server that answers. */
	responderId: TLShapeId
	/** Omitted means the responder-title default. */
	name?: string
}

export interface MaterializedCommunicationLeg {
	phase: CommunicationPhase
	connectionId: TLShapeId
	sourceShapeId: TLShapeId
	targetShapeId: TLShapeId
	portId: string
	portName: string
}

export type MaterializeCommunicationLinkResult =
	| {
		ok: true
		family: CommunicationDrawFamily
		name: string
		legs: MaterializedCommunicationLeg[]
		asyncRegionId: TLShapeId | null
	}
	| {
		ok: false
		reason: 'missing-block' | 'same-block' | 'unpairable-scope' | 'binding-failed'
	}

interface PendingPort {
	shapeId: TLShapeId
	side: 'inputs' | 'outputs'
	port: BlockPort
}

/**
 * Which edge of `fromId` faces `toId`, when the two are stacked rather than
 * side by side.
 *
 * Null keeps the historical derived rails (input left, named output right),
 * which is still the right answer for a left-to-right topology. Returning a
 * horizontal rail is what puts a generated socket on the face the cable
 * actually leaves by — the reason four-sided ports exist for this view at all.
 */
export function facingRail(
	editor: Editor,
	fromId: TLShapeId,
	toId: TLShapeId,
): 'top' | 'bottom' | null {
	const from = editor.getShapePageBounds(fromId)
	const to = editor.getShapePageBounds(toId)
	if (!from || !to) return null
	const dx = to.center.x - from.center.x
	const dy = to.center.y - from.center.y
	if (Math.abs(dy) <= Math.abs(dx)) return null
	return dy > 0 ? 'bottom' : 'top'
}

function appendPorts(editor: Editor, pending: readonly PendingPort[]): boolean {
	const byShape = new Map<TLShapeId, PendingPort[]>()
	for (const item of pending) {
		const existing = byShape.get(item.shapeId)
		if (existing) existing.push(item)
		else byShape.set(item.shapeId, [item])
	}
	for (const [shapeId, items] of byShape) {
		const shape = editor.getShape(shapeId)
		if (!isBlockShape(shape)) return false
		const inputs = [...shape.props.inputs]
		const outputs = [...shape.props.outputs]
		for (const item of items) {
			const lane = item.side === 'inputs' ? inputs : outputs
			// Idempotent: re-drawing the same relationship reuses the port it made.
			if (lane.some((port) => port.id === item.port.id)) continue
			lane.push(item.port)
		}
		editor.updateShape<BlockShape>({
			id: shapeId,
			type: BLOCK_SHAPE_TYPE,
			props: normalizeBlockPortRows({ ...shape.props, inputs, outputs }),
		})
	}
	return true
}

/**
 * Turn one drawn communication arrow into canonical dataflow.
 *
 * WHY: the communication view authors ports and cables *once*, then stops. It
 * does not keep a second protocol graph beside the data one — the generated
 * port names ARE the record, and the same strict parser that reads a
 * hand-wired board reads this one. That is what makes the two views inverses
 * of each other instead of two stores that must be reconciled: flipping to
 * Dataflow shows real ports because real ports is all that was ever written.
 */
export function materializeCommunicationLink(
	editor: Editor,
	options: MaterializeCommunicationLinkOptions,
): MaterializeCommunicationLinkResult {
	const { family, initiatorId, responderId } = options
	if (initiatorId === responderId) return { ok: false, reason: 'same-block' }
	const initiator = editor.getShape(initiatorId)
	const responder = editor.getShape(responderId)
	if (!isBlockShape(initiator) || !isBlockShape(responder)) return { ok: false, reason: 'missing-block' }
	const faces = pairBlockFaces(editor, initiator, responder, { requireLive: false })
	if (!faces) return { ok: false, reason: 'unpairable-scope' }

	const name = communicationNameSlug(options.name ?? '')
		|| defaultCommunicationName(editor, family, initiatorId, responderId)
	const legs = COMMUNICATION_PROTOCOL_LEGS[family]

	const markId = editor.markHistoryStoppingPoint(`draw ${family} ${name}`)

	const pending: PendingPort[] = []
	for (const leg of legs) {
		const portId = communicationPortId(family, name, leg.phase)
		const portName = communicationPortName(name, leg.phase)
		const sourceShapeId = leg.direction === 'forward' ? initiatorId : responderId
		const targetShapeId = leg.direction === 'forward' ? responderId : initiatorId
		const base = { id: portId, name: portName, type: '', visible: true, row: FIRST_BODY_ROW }
		// Each end's socket goes on the face pointing at the other component.
		const sourceRail = facingRail(editor, sourceShapeId, targetShapeId)
		const targetRail = facingRail(editor, targetShapeId, sourceShapeId)
		pending.push({
			shapeId: sourceShapeId,
			side: 'outputs',
			port: sourceRail ? { ...base, edge: sourceRail } : base,
		})
		pending.push({
			shapeId: targetShapeId,
			side: 'inputs',
			port: targetRail ? { ...base, edge: targetRail } : base,
		})
	}
	if (!appendPorts(editor, pending)) {
		editor.bailToMark(markId)
		return { ok: false, reason: 'missing-block' }
	}

	const materialized: MaterializedCommunicationLeg[] = []
	let asyncRegionId: TLShapeId | null = null
	for (const leg of legs) {
		const portId = communicationPortId(family, name, leg.phase)
		const portName = communicationPortName(name, leg.phase)
		const sourceShapeId = leg.direction === 'forward' ? initiatorId : responderId
		const targetShapeId = leg.direction === 'forward' ? responderId : initiatorId
		const sourceFace = sourceShapeId === initiatorId ? faces.a : faces.b
		const targetFace = targetShapeId === initiatorId ? faces.a : faces.b

		const connectionId = createShapeId()
		editor.createShape({
			id: connectionId,
			type: CONNECTION_SHAPE_TYPE,
			x: 0,
			y: 0,
			props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
		})
		// `start` IS the source on a settled cable — the file-format normal form
		// the connection model documents.
		const welded = createOrUpdateConnectionBinding(editor, connectionId, sourceShapeId, {
			portId,
			face: sourceFace,
			terminal: 'start',
		}) && createOrUpdateConnectionBinding(editor, connectionId, targetShapeId, {
			portId,
			face: targetFace,
			terminal: 'end',
		})
		if (!welded) {
			editor.bailToMark(markId)
			return { ok: false, reason: 'binding-failed' }
		}
		// One code path with a hand-drawn wire: a relationship authored inside an
		// Async region gets that region's Async default for the same reason, and
		// is just as free to be changed back to Data afterwards.
		const applied = applyAsyncRegionConnectionDefault(editor, connectionId, sourceShapeId, targetShapeId)
		asyncRegionId = applied.regionId ?? asyncRegionId
		materialized.push({
			phase: leg.phase,
			connectionId,
			sourceShapeId,
			targetShapeId,
			portId,
			portName,
		})
	}

	return { ok: true, family, name, legs: materialized, asyncRegionId }
}

/**
 * Rename a relationship by renaming the ports that spell it.
 *
 * There is nowhere else the name lives, so this is the whole operation: the
 * projection re-reads the same ports and reports the new name.
 *
 * WHY the port ID is deliberately left alone: `BlockPort` documents the id as
 * durable identity, and every cable binds to it. Recomputing the id from the
 * new name would mean re-pointing two bindings per leg on the assumption that
 * `start` is still the source — an assumption `connectionModel` explicitly
 * forbids — and any one of those failing rolls the whole rename back. Names
 * are what the parser groups on; ids are what cables hold. Only the first has
 * to move.
 */
export function renameCommunicationRelation(
	editor: Editor,
	relation: Pick<CommunicationRelation, 'family' | 'name' | 'memberDescriptors'>,
	nextName: string,
): boolean {
	const slug = communicationNameSlug(nextName)
	if (!slug || slug === relation.name) return false
	editor.markHistoryStoppingPoint(`rename ${relation.family} ${slug}`)
	const phaseOfName = new Map<string, CommunicationPhase>()
	for (const member of relation.memberDescriptors) {
		phaseOfName.set(member.sourcePortName, member.phase)
		phaseOfName.set(member.targetPortName, member.phase)
	}
	const shapeIds = new Set(relation.memberDescriptors
		.flatMap((member) => [member.sourceShapeId, member.targetShapeId]))
	let changed = false
	for (const shapeId of shapeIds) {
		const shape = editor.getShape(shapeId)
		if (!isBlockShape(shape)) continue
		const rename = (ports: readonly BlockPort[]) => ports.map((port) => {
			const phase = phaseOfName.get(port.name)
			if (phase === undefined) return port
			const name = communicationPortName(slug, phase)
			if (name === port.name) return port
			changed = true
			return { ...port, name }
		})
		const inputs = rename(shape.props.inputs)
		const outputs = rename(shape.props.outputs)
		editor.updateShape<BlockShape>({
			id: shapeId,
			type: BLOCK_SHAPE_TYPE,
			props: { ...shape.props, inputs, outputs },
		})
	}
	return changed
}

/** The families a projection can report, narrowed to those this view can draw. */
export function drawFamilyOf(family: CommunicationFamily): CommunicationDrawFamily | null {
	return isCommunicationDrawFamily(family) ? family : null
}
