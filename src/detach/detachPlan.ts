/**
 * Turn a requested id set into an ordered detach plan.
 *
 * Planning is read-only: it walks the tree, lets composites contribute the
 * occurrences they own, resolves which cables are claimed by an endpoint, and
 * fixes the one global lowering order the invariants allow. Execution lives in
 * `detachSweep.ts`; keeping the plan pure is what lets the ordering rules be
 * unit-tested against synthetic kinds with no editor at all.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import {
	matchDetachableKind,
	type DetachableKind,
	type DetachOrigin,
} from './detachableKind'

export interface EdgeParticipant {
	id: TLShapeId
	kind: DetachableKind
	origin: DetachOrigin
	/** Skip claim resolution — lower plain no matter who touches an end. */
	forcePlain: boolean
	/** Whether the replacement joins the post-sweep selection. */
	selectable: boolean
	/** The composite that adopts the replacement, when one owns this edge. */
	ownerId: TLShapeId | null
}

export interface NodeParticipant {
	id: TLShapeId
	kind: DetachableKind
	origin: DetachOrigin
	selectable: boolean
	ownerId: TLShapeId | null
}

export interface DetachPlan {
	/** Edge participants; all lower before any node does. */
	edges: EdgeParticipant[]
	/** Node participants in lowering order — see `orderNodes`. */
	nodes: NodeParticipant[]
}

/**
 * The read surface planning needs. `Editor` satisfies it structurally; tests
 * satisfy it with a stub board.
 */
export interface PlanReader {
	getShape(id: TLShapeId): TLShape | undefined
	getSortedChildIdsForParent(id: TLShapeId): TLShapeId[]
}

export function planDetach(
	editor: Editor,
	requestedIds: readonly TLShapeId[],
	kinds: readonly DetachableKind[],
): DetachPlan {
	const reader = editor as unknown as PlanReader
	const requested = new Set(requestedIds)
	const edges = new Map<TLShapeId, EdgeParticipant>()
	const nodes = new Map<TLShapeId, NodeParticipant>()
	/** Shapes already visited by discovery or expansion, whatever the outcome. */
	const seen = new Set<TLShapeId>()

	const addEdge = (
		id: TLShapeId,
		kind: DetachableKind,
		origin: DetachOrigin,
		options: { forcePlain: boolean; selectable: boolean; ownerId: TLShapeId | null },
	) => {
		const existing = edges.get(id)
		if (!existing) {
			edges.set(id, { id, kind, origin, ...options })
			return
		}
		// A cable can arrive twice — selected directly and contributed by a
		// wired container. One lowering, with the stricter flags: a forced-plain
		// contribution stays plain, and an owned cable's replacement belongs to
		// its owner's adoption, not to the selection.
		existing.forcePlain = existing.forcePlain || options.forcePlain
		existing.selectable = existing.selectable && options.selectable
		existing.ownerId = existing.ownerId ?? options.ownerId
	}

	const expandComposite = (participant: NodeParticipant, shape: TLShape) => {
		const ownerId = participant.ownerId ?? participant.id
		participant.kind.expand?.(editor, shape, {
			addEdge: (contribution) => {
				const edgeShape = reader.getShape(contribution.shapeId)
				if (!edgeShape) return
				// Contribution bypasses refusal: a region's projected cables are
				// stamped, and the stamp is exactly what refuses them to discovery.
				const kind = kinds.find((candidate) => candidate.matches(edgeShape))
				if (!kind || kind.role !== 'edge') return
				addEdge(contribution.shapeId, kind, 'contributed', {
					forcePlain: contribution.forcePlain ?? false,
					selectable: false,
					ownerId,
				})
			},
			addNode: (contribution) => {
				visit(contribution.shapeId, 'contributed', ownerId, { bypassRefusal: true })
			},
		})
	}

	/**
	 * One shape enters the plan at most once. Contribution outranks discovery
	 * for ownership, so composites expand before generic descent reaches their
	 * insides — the planner expands each composite the moment it joins.
	 * Refusal is bypassed only for the shape a composite hands in directly;
	 * descent below it is gated again.
	 */
	const visit = (
		id: TLShapeId,
		origin: DetachOrigin,
		ownerId: TLShapeId | null,
		options: { bypassRefusal?: boolean } = {},
	) => {
		if (seen.has(id)) return
		seen.add(id)
		const shape = reader.getShape(id)
		if (!shape) return
		const kind = options.bypassRefusal
			? kinds.find((candidate) => candidate.matches(shape)) ?? null
			: matchDetachableKind(kinds, shape)
		const childOrigin = origin === 'contributed' ? 'contributed' : 'discovered'
		if (kind) {
			if (kind.role === 'edge') {
				addEdge(id, kind, origin, {
					forcePlain: false,
					selectable: origin !== 'contributed',
					ownerId,
				})
				return
			}
			const participant: NodeParticipant = {
				id,
				kind,
				origin,
				selectable: origin !== 'contributed',
				ownerId,
			}
			nodes.set(id, participant)
			expandComposite(participant, shape)
			if (kind.discoversChildren === false) return
			for (const childId of reader.getSortedChildIdsForParent(id)) {
				visit(childId, childOrigin, ownerId)
			}
			return
		}
		// Unmatched (or refused) shapes are not participants, but their subtree
		// may hold some — a group's members, a frame's children.
		for (const childId of reader.getSortedChildIdsForParent(id)) {
			visit(childId, childOrigin, ownerId)
		}
	}

	for (const id of requestedIds) visit(id, 'requested', null)
	// Requested ids re-marked: a shape reached as a descendant first still
	// counts as requested for selection purposes.
	for (const participant of nodes.values()) {
		if (requested.has(participant.id) && participant.origin === 'discovered') {
			participant.origin = 'requested'
		}
	}

	// A wired node's cables must lower while the node exists, but discovery
	// cannot see them — a cable to an unselected neighbour lives outside the
	// selected subtree. Each node names its incident cables; claim resolution
	// below decides plain-versus-deferred.
	for (const participant of nodes.values()) {
		const shape = reader.getShape(participant.id)
		if (!shape || !participant.kind.incidentEdgeIds) continue
		for (const edgeId of participant.kind.incidentEdgeIds(editor, shape)) {
			const edgeShape = reader.getShape(edgeId)
			if (!edgeShape) continue
			const kind = matchDetachableKind(kinds, edgeShape)
			if (!kind || kind.role !== 'edge') continue
			addEdge(edgeId, kind, 'contributed', {
				forcePlain: false,
				selectable: false,
				ownerId: participant.ownerId,
			})
		}
	}

	// Claim resolution: a cable touching a participant whose kind lowers its
	// own incident cables is left to that participant. It will lower the cable
	// while creating its replacement card, binding the arrow port-precisely
	// and keeping the Block-rebuild promise — a plain lowering here would
	// break that promise. Forced-plain contributions are exempt: a region's
	// projected cables must never promise a Block rebuild.
	const claimed = new Set<TLShapeId>()
	for (const participant of edges.values()) {
		if (participant.forcePlain) continue
		const shape = reader.getShape(participant.id)
		if (!shape) continue
		const endpointIds = participant.kind.edgeEndpointIds?.(editor, shape) ?? []
		const isClaimed = endpointIds.some((endpointId) => {
			const endpoint = nodes.get(endpointId)
			return endpoint?.kind.claimsIncidentEdges === true
		})
		if (isClaimed) claimed.add(participant.id)
	}
	for (const id of claimed) edges.delete(id)

	return {
		edges: [...edges.values()],
		nodes: orderNodes([...nodes.values()]),
	}
}

/**
 * The one lowering order the invariants allow.
 *
 * Leaf kinds go before container kinds: a leaf may lower its own incident
 * cables, whose far endpoints must still stand. Within a rank, a composite's
 * contributions lower before the composite itself — its wrapper reduction
 * deletes whatever is still inside — while discovered nesting keeps its
 * top-down order, so an outer region's replacement group still encloses an
 * inner one the way the live shapes did.
 */
export function orderNodes(participants: readonly NodeParticipant[]): NodeParticipant[] {
	const byId = new Map(participants.map((participant) => [participant.id, participant]))
	const contributions = new Map<TLShapeId, NodeParticipant[]>()
	const roots: NodeParticipant[] = []
	for (const participant of participants) {
		const owner = participant.ownerId !== null ? byId.get(participant.ownerId) : undefined
		if (owner && owner !== participant) {
			const bucket = contributions.get(owner.id) ?? []
			bucket.push(participant)
			contributions.set(owner.id, bucket)
		} else {
			roots.push(participant)
		}
	}
	const sequence: NodeParticipant[] = []
	const emit = (participant: NodeParticipant) => {
		for (const contribution of contributions.get(participant.id) ?? []) emit(contribution)
		sequence.push(participant)
	}
	for (const root of roots) emit(root)
	const rank = (participant: NodeParticipant) =>
		participant.kind.nodePhase === 'container' ? 1 : 0
	// Stable by construction: Array.prototype.sort is stable, so within a rank
	// the ownership post-order (and discovery order between trees) survives.
	return sequence.sort((left, right) => rank(left) - rank(right))
}
