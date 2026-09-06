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
}

/**
 * Place every port that has no authored communication placement.
 *
 * Ports are grouped by interaction, each group is kept contiguous, and groups
 * are laid along the edge their side faces — inputs left, outputs right, which
 * is the reading direction the signature already established. A port whose name
 * says nothing about an interaction is simply appended, so an off-the-shelf
 * component still gets an orderly card rather than a pile.
 */
export function inferCommunicationPlacements(
	ports: readonly InferencePort[],
): Map<string, InferredPlacement> {
	const placements = new Map<string, InferredPlacement>()
	for (const side of ['input', 'output'] as const) {
		const lane = ports.filter((entry) => entry.side === side && entry.port.visible)
		if (lane.length === 0) continue

		// Group by interaction, preserving first-appearance order so a card's
		// layout does not reshuffle when an unrelated port is added.
		const groups: { key: string; members: InferencePort[] }[] = []
		for (const entry of lane) {
			const key = portInteractionKey(entry.port) ?? `solo:${entry.port.id}`
			const existing = groups.find((group) => group.key === key)
			if (existing) existing.members.push(entry)
			else groups.push({ key, members: [entry] })
		}
		for (const group of groups) {
			group.members.sort((a, b) => {
				const phaseA = portPhase(a.port)
				const phaseB = portPhase(b.port)
				const orderA = phaseA ? PHASE_ORDER[phaseA] : 0
				const orderB = phaseB ? PHASE_ORDER[phaseB] : 0
				return orderA - orderB || a.port.name.localeCompare(b.port.name)
			})
		}

		const ordered = groups.flatMap((group) => group.members)
		const edge: PortEdge = side === 'input' ? 'left' : 'right'
		ordered.forEach((entry, index) => {
			// Evenly along the edge, leaving a margin at both corners so a socket
			// never lands exactly on one.
			const edgeT = (index + 1) / (ordered.length + 1)
			placements.set(entry.port.id, { edge, edgeT })
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
