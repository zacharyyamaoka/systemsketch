/**
 * Pure ELK adapter for SystemSketch's one-shot node organization command.
 *
 * ELK is deliberately lazy-loaded: the engine is useful when the user asks it
 * to choose node positions, but it does not belong in the first-load bundle.
 * Only positions come back from ELK. SystemSketch's existing connection router
 * remains the sole owner of the cable geometry drawn on the board.
 */

/** Minimal shape of the elkjs API used here. */
interface ElkNode {
	id: string
	width?: number
	height?: number
	x?: number
	y?: number
	ports?: ElkNode[]
	children?: ElkNode[]
	edges?: { id: string; sources: string[]; targets: string[] }[]
	layoutOptions?: Record<string, string>
}

/**
 * Ported from Dify's production ELK options and corrected by the PyBlocks
 * evaluation: orthogonal room, the layered edge-spacing key, and children as
 * the model-order carrier.
 */
export const ORGANIZE_LAYOUT_OPTIONS: Record<string, string> = {
	'elk.algorithm': 'layered',
	'elk.direction': 'RIGHT',
	'elk.layered.spacing.nodeNodeBetweenLayers': '120',
	'elk.spacing.nodeNode': '64',
	'elk.spacing.edgeNode': '40',
	'elk.spacing.edgeEdge': '24',
	'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
	'elk.portConstraints': 'FIXED_ORDER',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
	'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
	'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
	'elk.layered.nodePlacement.favorStraightEdges': 'true',
	'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
	'elk.edgeRouting': 'ORTHOGONAL',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
	'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
	'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
	'elk.separateConnectedComponents': 'true',
	'elk.spacing.componentComponent': '96',
	'elk.layered.thoroughness': '10',
}

export interface OrganizeGraphNode {
	id: string
	x: number
	y: number
	width: number
	height: number
	/** Fixed Block-local port centres. IDs must be unique across the graph. */
	ports?: OrganizeGraphPort[]
	/** Evidence/debug label; ELK behavior comes from the actual port coordinates. */
	portLayout?: 'aligned' | 'offset'
}

export interface OrganizeGraphPort {
	id: string
	side: 'left' | 'right'
	x: number
	y: number
	width?: number
	height?: number
}

export interface OrganizeGraphEdge {
	id: string
	source: string
	target: string
	sourcePort?: string
	targetPort?: string
}

export interface OrganizedGraph {
	nodes: OrganizeGraphNode[]
	edges: OrganizeGraphEdge[]
}

/**
 * Lay out a flat graph and return node bounds anchored to the input's top-left.
 * Input arrays and objects are never mutated.
 */
export async function organizeGraph(
	nodes: readonly OrganizeGraphNode[],
	edges: readonly OrganizeGraphEdge[],
): Promise<OrganizedGraph> {
	if (nodes.length < 2) return { nodes: nodes.map((node) => ({ ...node })), edges: [...edges] }

	const ids = new Set(nodes.map((node) => node.id))
	const includedEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
	const ports = new Set(nodes.flatMap((node) => node.ports?.map((port) => port.id) ?? []))
	const ordered = [...nodes].sort(
		(a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
	)
	const graph: ElkNode = {
		id: 'root',
		layoutOptions: ORGANIZE_LAYOUT_OPTIONS,
		children: ordered.map((node) => ({
			id: node.id,
			width: node.width,
			height: node.height,
			layoutOptions: node.ports?.length
				? { 'elk.portConstraints': 'FIXED_POS' }
				: undefined,
			ports: node.ports?.map((port) => ({
				id: port.id,
				x: port.x - (port.width ?? 0) / 2,
				y: port.y - (port.height ?? 0) / 2,
				width: port.width ?? 0,
				height: port.height ?? 0,
				layoutOptions: {
					'elk.port.side': port.side === 'left' ? 'WEST' : 'EAST',
				},
			})),
		})),
		edges: includedEdges.map((edge) => ({
			id: edge.id,
			sources: [edge.sourcePort && ports.has(edge.sourcePort) ? edge.sourcePort : edge.source],
			targets: [edge.targetPort && ports.has(edge.targetPort) ? edge.targetPort : edge.target],
		})),
	}

	const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
	const laid = await new ELK().layout(graph) as ElkNode
	const positions = new Map<string, { x: number; y: number }>()
	for (const child of laid.children ?? []) {
		if (child.x === undefined || child.y === undefined) continue
		positions.set(child.id, { x: child.x, y: child.y })
	}
	if (positions.size === 0) return { nodes: nodes.map((node) => ({ ...node })), edges: includedEdges }

	const inputAnchor = {
		x: Math.min(...nodes.map((node) => node.x)),
		y: Math.min(...nodes.map((node) => node.y)),
	}
	const outputAnchor = {
		x: Math.min(...Array.from(positions.values(), (point) => point.x)),
		y: Math.min(...Array.from(positions.values(), (point) => point.y)),
	}
	return {
		nodes: nodes.map((node) => {
			const position = positions.get(node.id)
			return position
				? {
					...node,
					x: position.x + inputAnchor.x - outputAnchor.x,
					y: position.y + inputAnchor.y - outputAnchor.y,
				}
				: { ...node }
		}),
		edges: includedEdges,
	}
}
