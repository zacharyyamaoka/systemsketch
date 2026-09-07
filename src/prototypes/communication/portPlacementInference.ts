/**
 * Where a port should sit in the lens that has not been told about it yet.
 *
 * A port carries one authored placement per lens, but most ports only ever get
 * one: generated ones know their communication edge, hand-wired ones know only
 * their dataflow row, and an off-the-shelf component arrives with neither. The
 * missing side has to be inferred, and inferring it badly is worse than not
 * offering the lens at all — a protocol's four legs scattered around a card's
 * perimeter is harder to read than the signature it replaced.
 *
 * WHY grouping is the rule (Zach, 2026-09-06): "it may often be needed to
 * infer the location of ports, in this case the ports should be placed in an
 * intelligent way (ie action feedback, result close together, etc)". Legs of
 * one interaction belong together, in the order the protocol runs, on the side
 * that faces the component they talk to. Everything below is that one idea.
 *
 * This is inference for PRESENTATION only. It never writes: the layout asks
 * for a placement and gets one, and a port a person actually dragged keeps the
 * position they gave it, because an authored `commEdge` short-circuits this
 * whole file.
 */
import type { BlockPort } from '../../blocks/blockModel'
import { inspectCommunicationChannel, type CommunicationPhase } from './channelParser'

export type PortEdge = 'left' | 'right' | 'top' | 'bottom'

export interface InferredPlacement {
	edge: PortEdge
	/** Position along that edge, 0 at the left/top corner. */
	edgeT: number
}

/**
 * The order legs of one interaction read in.
 *
 * Request before response, goal then feedback then result: the sequence the
 * protocol actually runs. Keeping them adjacent AND ordered is what makes a
 * grouped Action legible rather than merely compact.
 */
const PHASE_ORDER: Readonly<Record<CommunicationPhase, number>> = {
	publish: 0,
	stream: 0,
	request: 0,
	goal: 0,
	cancel: 1,
	feedback: 2,
	response: 3,
	result: 3,
}

/**
 * The phase whose leg a summary cable rides, per family.
 *
 * Fixed, and the same table the carrier chooser uses: a Service's request, an
 * Action's goal, a Stream's single leg, a Topic's publish.
 */
const CARRIER_PHASE: Readonly<Record<string, CommunicationPhase>> = {
	topic: 'publish',
	stream: 'stream',
	service: 'request',
	action: 'goal',
}

/**
 * What kind of port this is, as far as communication is concerned.
 *
 * THE VOCABULARY (Zach, 2026-09-07): "we can split all ports into undefined,
 * split or summary. In communication view only and all wired and unwired
 * summary ports should show."
 *
 *   summary    the leg a summary arrow rides — the interaction's initiating
 *              phase, or, when that leg is absent, the first one that IS here,
 *              matching `chooseCommunicationRepresentative` exactly
 *   split      a protocol leg no summary arrow touches: response, feedback,
 *              result, cancel
 *   undefined  not a communication port at all — an ordinary data port whose
 *              name carries no protocol phase. The strict parser reads such a
 *              name as a Topic publish, which is why this cannot simply ask the
 *              parser whether it parsed: it always does.
 *
 * Wiring is deliberately NOT part of this. A summary port shows whether or not
 * a cable has reached it yet — that is what makes an un-wired interaction
 * something you can see and wire FROM.
 */
export type CommunicationPortKind = 'undefined' | 'split' | 'summary'

/** Phases that only ever appear when a name carries an explicit protocol suffix. */
const EXPLICIT_PHASES: ReadonlySet<CommunicationPhase> = new Set<CommunicationPhase>([
	'stream', 'request', 'response', 'goal', 'cancel', 'feedback', 'result',
])

export function classifyCommunicationPort(
	port: BlockPort,
	/** Every phase this port's interaction has on this card; see the fallback. */
	siblingPhases?: ReadonlySet<CommunicationPhase>,
): CommunicationPortKind {
	const parsed = inspectCommunicationChannel(port.name, port.name).parsed
	// The parser's Topic fallback fires for any name without a phase suffix, so
	// "it parsed" proves nothing. An explicit phase is what marks a port as
	// belonging to a protocol at all.
	if (!parsed || !EXPLICIT_PHASES.has(parsed.phase)) return 'undefined'
	const preferred = CARRIER_PHASE[parsed.family]
	if (parsed.phase === preferred) return 'summary'
	if (!siblingPhases || siblingPhases.has(preferred)) return 'split'
	return firstPresentPhase(parsed.family, siblingPhases) === parsed.phase ? 'summary' : 'split'
}

/** Shorthand for the one question the layout asks. */
export function isSummaryCarrierPort(
	port: BlockPort,
	siblingPhases?: ReadonlySet<CommunicationPhase>,
): boolean {
	return classifyCommunicationPort(port, siblingPhases) === 'summary'
}

/** The order a summary cable falls back through when its initiator is missing. */
const FALLBACK_ORDER: readonly CommunicationPhase[] = [
	'publish', 'stream', 'request', 'goal', 'feedback', 'response', 'result', 'cancel',
]

function firstPresentPhase(
	family: string,
	present: ReadonlySet<CommunicationPhase>,
): CommunicationPhase | null {
	// Cancel never speaks for an Action while any other leg exists, matching
	// `chooseCommunicationRepresentative` exactly.
	const eligible = family === 'action' && [...present].some((phase) => phase !== 'cancel')
		? FALLBACK_ORDER.filter((phase) => phase !== 'cancel')
		: FALLBACK_ORDER
	return eligible.find((phase) => present.has(phase)) ?? null
}

/** Every communication phase present on this card, grouped by interaction. */
export function phasesByInteraction(
	ports: readonly BlockPort[],
): Map<string, Set<CommunicationPhase>> {
	const grouped = new Map<string, Set<CommunicationPhase>>()
	for (const port of ports) {
		const parsed = inspectCommunicationChannel(port.name, port.name).parsed
		if (!parsed) continue
		const key = `${parsed.family}:${parsed.name.toLowerCase()}`
		const set = grouped.get(key) ?? new Set<CommunicationPhase>()
		set.add(parsed.phase)
		grouped.set(key, set)
	}
	return grouped
}

/** The phases of THIS port's interaction, ready to pass to the carrier test. */
export function siblingPhasesFor(
	port: BlockPort,
	grouped: Map<string, Set<CommunicationPhase>>,
): ReadonlySet<CommunicationPhase> | undefined {
	const key = portInteractionKey(port)
	return key ? grouped.get(key) : undefined
}

/** The interaction a port belongs to, or null when its name says nothing. */
export function portInteractionKey(port: BlockPort): string | null {
	const parsed = inspectCommunicationChannel(port.name, port.name).parsed
	if (!parsed) return null
	return `${parsed.family}:${parsed.name.toLowerCase()}`
}

function portPhase(port: BlockPort): CommunicationPhase | null {
	return inspectCommunicationChannel(port.name, port.name).parsed?.phase ?? null
}

export interface InferencePort {
	port: BlockPort
	side: 'input' | 'output'
	/**
	 * The edge this port has already been put on, if any. Groups follow their
	 * placed members rather than out-voting them.
	 */
	placedEdge?: PortEdge
}

/**
 * Place every port that has no authored communication placement.
 *
 * THE RULE (Zach, 2026-09-06): "in communication view, all of the ports for the
 * associated communication pattern must be side by side on the same edge." An
 * Action's goal leaves the client and its feedback and result come back into
 * it, so by side alone they would sit on opposite walls — and the one thing you
 * most want to see about an interaction is all of it at once, next to the arrow
 * that stands for it. So the interaction, not the side, chooses the edge, and
 * its members are laid out contiguously along that edge in protocol order.
 *
 * Which edge: the one its already-placed members use, if any — the generator
 * puts a whole interaction on the wall facing the component it talks to, and an
 * inferred sibling must not contradict that. Otherwise the majority side, which
 * keeps a producer's channels on the right and a consumer's on the left, the
 * reading direction the signature already established.
 */
export function inferCommunicationPlacements(
	ports: readonly InferencePort[],
): Map<string, InferredPlacement> {
	const visible = ports.filter((entry) => entry.port.visible)
	if (visible.length === 0) return new Map()

	// Group by interaction, preserving first-appearance order so a card's layout
	// does not reshuffle when an unrelated port is added.
	const groups: { key: string; members: InferencePort[] }[] = []
	for (const entry of visible) {
		const key = portInteractionKey(entry.port) ?? `solo:${entry.port.id}`
		const existing = groups.find((group) => group.key === key)
		if (existing) existing.members.push(entry)
		else groups.push({ key, members: [entry] })
	}

	const placements = new Map<string, InferredPlacement>()
	const byEdge = new Map<PortEdge, InferencePort[]>()
	for (const group of groups) {
		group.members.sort((a, b) => {
			const orderA = PHASE_ORDER[portPhase(a.port) ?? 'publish']
			const orderB = PHASE_ORDER[portPhase(b.port) ?? 'publish']
			return orderA - orderB || a.port.name.localeCompare(b.port.name)
		})
		const placed = group.members.find((entry) => entry.placedEdge)?.placedEdge
		const outputs = group.members.filter((entry) => entry.side === 'output').length
		const edge: PortEdge = placed ?? (outputs * 2 >= group.members.length ? 'right' : 'left')
		const lane = byEdge.get(edge) ?? []
		lane.push(...group.members)
		byEdge.set(edge, lane)
	}

	for (const [edge, lane] of byEdge) {
		lane.forEach((entry, index) => {
			// Evenly along the edge among the ports that actually land on it,
			// leaving a margin at both corners so a socket never sits on one.
			placements.set(entry.port.id, { edge, edgeT: (index + 1) / (lane.length + 1) })
		})
	}
	return placements
}

/**
 * Rank the ports of one lane for Dataflow, when the only placement they carry
 * is a communication one.
 *
 * The inverse trip. A rail runs left→right and a lane runs top→bottom, so the
 * fraction along the edge becomes the position down the lane; a left or right
 * edge already reads top→bottom and keeps its fraction directly. Legs of one
 * interaction stay adjacent because they were adjacent on the wall.
 */
export function dataflowOrderFromCommunication(ports: readonly BlockPort[]): string[] {
	const rank = (port: BlockPort): number => {
		const t = Number.isFinite(port.commEdgeT) ? (port.commEdgeT as number) : 0.5
		switch (port.commEdge) {
			// Reading order puts the top wall first, then the sides, then the
			// bottom — the same order an eye sweeps the card.
			case 'top': return t
			case 'left':
			case 'right': return 1 + t
			case 'bottom': return 2 + t
			default: return 1.5
		}
	}
	return [...ports]
		.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
		.map((port) => port.id)
}
