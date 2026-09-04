/**
 * The small, deliberately boring graph behind the propagation lens.
 *
 * It is kept independent of tldraw so a reading lens can be tested against
 * branches and cycles without needing a rendered board.  `edgeId` is carried
 * separately from a node because the lens must illuminate the actual cable
 * that led to a neighbour, never synthesize a relationship from labels.
 */
export interface DirectedPropagationEdge {
  edgeId: string
  sourceId: string
  sinkId: string
}

export interface PropagationWalk {
  nodes: ReadonlySet<string>
  edges: ReadonlySet<string>
}

function addAdjacent(
  edges: readonly DirectedPropagationEdge[],
  frontier: ReadonlySet<string>,
  direction: 'upstream' | 'downstream',
  nodes: Set<string>,
  includedEdges: Set<string>,
): Set<string> {
  const next = new Set<string>()
  for (const edge of edges) {
    const from = direction === 'upstream' ? edge.sinkId : edge.sourceId
    const to = direction === 'upstream' ? edge.sourceId : edge.sinkId
    if (!frontier.has(from)) continue
    // A cable is a first-class canvas object.  Keeping it in the result means
    // branching still reads as real flow rather than a set of glowing cards.
    includedEdges.add(edge.edgeId)
    const wasSeen = nodes.has(to)
    nodes.add(from)
    nodes.add(to)
    if (!wasSeen && !frontier.has(to)) next.add(to)
  }
  return next
}

/**
 * Walk independently in both directions, with a hard caller-supplied bound.
 *
 * A visited node is never expanded twice. That terminates cycles while still
 * retaining the closing cable, which is the useful evidence that a cycle
 * exists.  Fan-in and fan-out remain sets, rather than being arbitrarily
 * reduced to one "primary" route.
 */
export function walkPropagationGraph({
  edges,
  upstreamStarts,
  downstreamStarts,
  upstreamSteps,
  downstreamSteps,
  initialNodes = [],
  initialEdges = [],
}: {
  edges: readonly DirectedPropagationEdge[]
  upstreamStarts: readonly string[]
  downstreamStarts: readonly string[]
  upstreamSteps: number
  downstreamSteps: number
  initialNodes?: readonly string[]
  initialEdges?: readonly string[]
}): PropagationWalk {
  const nodes = new Set(initialNodes)
  const includedEdges = new Set(initialEdges)
  const walk = (starts: readonly string[], steps: number, direction: 'upstream' | 'downstream') => {
    let frontier = new Set(starts)
    const expanded = new Set<string>()
    for (let step = 0; step < Math.max(0, steps) && frontier.size > 0; step++) {
      for (const id of frontier) nodes.add(id)
      const expandable = new Set([...frontier].filter((id) => !expanded.has(id)))
      if (expandable.size === 0) break
      for (const id of expandable) expanded.add(id)
      const next = addAdjacent(edges, expandable, direction, nodes, includedEdges)
      frontier = new Set([...next].filter((id) => !expanded.has(id)))
    }
  }
  walk(upstreamStarts, upstreamSteps, 'upstream')
  walk(downstreamStarts, downstreamSteps, 'downstream')
  return { nodes, edges: includedEdges }
}
