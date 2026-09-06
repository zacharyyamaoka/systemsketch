/**
 * The contract one detachable shape kind signs with the generic sweep.
 *
 * Detach-to-primitives used to be a hand-ordered sequence in `detachBlock.ts`
 * that named every kind — adding a shape meant editing the dispatcher in two
 * places and teaching every composite the full list of things it might
 * contain. This contract inverts that: each kind declares *how it reduces
 * itself* and *which phase it needs*, and `detachSweep.ts` runs the phases in
 * the one global order the invariants allow. A composite never enumerates
 * child kinds; it contributes its owned occurrences and adopts whatever
 * replacements the sweep hands back.
 *
 * The two invariants the phases exist to protect (breaking either corrupts
 * rebuild fidelity, which is why a naive depth-first recursion was rejected):
 *
 *   1. A cable lowers while BOTH endpoint shapes still stand — its stock
 *      arrow must bind to live geometry, and deleting an endpoint first would
 *      take the binding down with it.
 *   2. A container's wrapper reduces only after its contents have lowered or
 *      escaped — deleting the container removes its whole remaining subtree.
 */
import type { Editor, TLShape, TLShapeId } from 'tldraw'

/** How a participant entered the sweep. */
export type DetachOrigin =
	/** Named in the requested id set (the selection, or an explicit list). */
	| 'requested'
	/** Found by walking down from a requested shape. */
	| 'discovered'
	/** Handed in by a composite that owns it (a region's projected occurrence). */
	| 'contributed'

/**
 * When a node kind lowers.
 *
 * `leaf` kinds may lower their own incident cables, so they run while every
 * other participant still stands. `container` kinds host children and edge
 * endpoints, so they reduce last — after contents escaped or lowered.
 */
export type DetachNodePhase = 'leaf' | 'container'

export interface DetachEdgeContribution {
	shapeId: TLShapeId
	/**
	 * Lower in the edge phase even when a claiming endpoint could take it.
	 * A region's projected cables must become plain arrows — a Block-rebuild
	 * promise on them would resurrect occurrences whose truth is the XML.
	 */
	forcePlain?: boolean
}

export interface DetachNodeContribution {
	shapeId: TLShapeId
}

/** What a composite's `expand` may hand to the planner. */
export interface DetachExpandContext {
	addEdge(contribution: DetachEdgeContribution): void
	addNode(contribution: DetachNodeContribution): void
}

export interface LoweredEdge {
	/** The stock arrow that replaced the cable. */
	arrowId: TLShapeId
	/** Outermost created record — the edge group when a pill or frozen line rides along. */
	rootId: TLShapeId
}

export interface LoweredNode {
	/**
	 * The stock record that stands where the shape stood and takes over its
	 * arrow bindings, or null when the kind keeps none. The finalize phase
	 * clears Block-rebuild promises on arrows bound here when the kind is not
	 * `rebuildable`.
	 */
	bindingTargetId: TLShapeId | null
	/** What the selection should hold afterwards, for requested/discovered participants. */
	selectionId: TLShapeId | null
	/**
	 * Top-level replacement records, for an owning composite to adopt. A
	 * detached Block reports its group plus the arrow roots of the cables it
	 * lowered itself; nested primitives ride inside and are not repeated.
	 */
	rootIds: readonly TLShapeId[]
	/**
	 * Kind-specific detail for callers that know what they asked for (the
	 * portable export reads a Block's DetachResult back out to freeze Value
	 * pills). The sweep itself never looks inside.
	 */
	detail?: unknown
}

export interface LowerNodeContext {
	/**
	 * Ports of this shape that carried a cable, surveyed before anything in
	 * the sweep mutated — including cables that a claiming endpoint lowered
	 * earlier in this same sweep, and stock arrows left by an earlier detach.
	 */
	connectedPortIds: ReadonlySet<string>
	/**
	 * Replacement roots produced by the participants this composite
	 * contributed, in lowering order. The composite adopts them; it never
	 * needs to know which kinds they were.
	 */
	contributedRootIds: readonly TLShapeId[]
}

export interface DetachableKind {
	/** Diagnostic name; also the dedup key for registration sanity checks. */
	readonly kind: string
	/** Edge kinds lower in the edge phase; node kinds carry a `nodePhase`. */
	readonly role: 'edge' | 'node'
	readonly nodePhase?: DetachNodePhase
	/**
	 * Whether arrows bound to this kind's replacement may keep a Block-rebuild
	 * promise. Only a detached Block can come back; everything else clears the
	 * promise so a rebuild does not half-resurrect a cable.
	 */
	readonly rebuildable?: boolean
	/**
	 * Leaf kinds that lower their own incident semantic cables (the Block: it
	 * binds each arrow to its replacement card with port-precise anchors and a
	 * rebuild promise). A discovered cable touching such a participant is
	 * deferred to it rather than lowered plain in the edge phase.
	 */
	readonly claimsIncidentEdges?: boolean
	/**
	 * Whether the generic planner walks this shape's children looking for more
	 * participants. A Behavior Tree region says no: its children are
	 * projection, contributed by `expand`, never discovered as authored work.
	 */
	readonly discoversChildren?: boolean

	matches(shape: TLShape): boolean
	/**
	 * Veto discovery of a shape any kind would otherwise match. A projected
	 * region child is refused — its truth is the region's XML, and lowering
	 * the occurrence alone would compile an XML delete. Contribution bypasses
	 * refusal: the owning region hands its occurrences in itself.
	 */
	refuses?(shape: TLShape): boolean
	/** Contribute owned participants before any phase runs. Read-only. */
	expand?(editor: Editor, shape: TLShape, contribute: DetachExpandContext): void
	/** Read facts that die during the sweep. Runs before any mutation. */
	surveyConnectedPortIds?(editor: Editor, shape: TLShape): ReadonlySet<string>
	/**
	 * Wrap the whole sweep. A kind with reactive repair machinery suppresses
	 * it here — dismantling a region is not a gesture *on* the region.
	 */
	aroundSweep?<T>(editor: Editor, body: () => T): T
	lowerEdge?(editor: Editor, shape: TLShape): LoweredEdge | null
	lowerNode?(editor: Editor, shape: TLShape, context: LowerNodeContext): LoweredNode | null
	/** Endpoint shape ids of an edge, for claim resolution. */
	edgeEndpointIds?(editor: Editor, shape: TLShape): TLShapeId[]
	/**
	 * Semantic cables this node is wired to, for the planner to include as
	 * edge participants. Discovery cannot find them — a cable to an unselected
	 * neighbour lives outside the selected subtree — but it must still lower
	 * while this node exists.
	 */
	incidentEdgeIds?(editor: Editor, shape: TLShape): TLShapeId[]
}

/** The kind that matches a shape, unless any kind refuses it. */
export function matchDetachableKind(
	kinds: readonly DetachableKind[],
	shape: TLShape,
): DetachableKind | null {
	for (const kind of kinds) {
		if (kind.refuses?.(shape)) return null
	}
	return kinds.find((kind) => kind.matches(shape)) ?? null
}
