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
 * Does a summary arrow actually attach to this port?
 *
 * WHY the communication lens shows nothing else (Zach, 2026-09-06): "do not
 * create any other ports in the communication view apart from the ports that
 * the summary arrows connect to." An Action's feedback and result sockets have
 * no arrow touching them there — the one summary arrow rides the goal — so
 * painting them added three dots and three labels per card that nothing led to,
 * which is what made the view crowded and hard to read.
 *
 * Pure, and deliberately so: the carrier phase is fixed per family, so this
 * needs only the port's own name. No editor, no relationship graph, and no
 * import back into the projection.
 *
 * A port whose name says nothing about a protocol parses as a Topic publish and
 * therefore stays — an ordinary data port is not hidden by this rule.
 */
export function isSummaryCarrierPort(
	port: BlockPort,
	/**
	 * Every phase this port's interaction actually has on this card.
	 *
	 * WHY it must be passed in: the carrier is the initiating leg WHEN THERE IS
	 * ONE. `chooseCommunicationRepresentative` falls back to whatever leg exists
	 * — a response-only Service rides its response, a cancel-only Action its
	 * cancel — and judging a port in isolation hid exactly those, so the lens
	 * drew a summary arrow spanning two cards with no port dot at either end.
	 * An adversarial audit found four such shapes. Omit it and the answer
	 * degrades to the isolated reading, which is right only for complete
	 * interactions.
	 */
	siblingPhases?: ReadonlySet<CommunicationPhase>,
): boolean {
	const parsed = inspectCommunicationChannel(port.name, port.name).parsed
	if (!parsed) return true
	const preferred = CARRIER_PHASE[parsed.family]
	if (parsed.phase === preferred) return true
	if (!siblingPhases || siblingPhases.has(preferred)) return false
	// The initiating leg is absent, so the summary arrow rides the first leg
	// that IS here — the same order `chooseCommunicationRepresentative` uses.
	return firstPresentPhase(parsed.family, siblingPhases) === parsed.phase
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
