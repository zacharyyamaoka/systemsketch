/** Generate the deterministic evidence consumed by build_layout_comparison.py. */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
	coincidentOverlap,
	countCrossings,
	nudgeRoutes,
	routeElbow,
	type ElbowPoint,
	type ElbowRect,
	type ElbowRoute,
} from '../src/blocks/elbow'
import {
	organizeGraph,
	type OrganizeGraphEdge,
	type OrganizeGraphNode,
} from '../src/blocks/layout/organizeGraph'

interface EdgeScenario {
	id: string
	title: string
	summary: string
	expected: string
	routes: ElbowRoute[]
	locked?: boolean[]
}

interface NodeScenario {
	id: string
	title: string
	summary: string
	nodes: OrganizeGraphNode[]
	edges: OrganizeGraphEdge[]
}

const routeFromPoints = (points: ElbowPoint[]): ElbowRoute => ({
	points,
	segments: [],
	pins: [],
	droppedPins: [],
	fallback: false,
})

function routedBundle(
	count: number,
	options: {
		fromStart?: number
		toStart?: number
		fromStep?: number
		toStep?: number
		invert?: boolean
		xOffset?: number
		yOffset?: number
	} = {},
): ElbowRoute[] {
	const xOffset = options.xOffset ?? 0
	const yOffset = options.yOffset ?? 0
	const a: ElbowRect = { x: xOffset, y: yOffset, w: 220, h: Math.max(180, count * 32 + 50) }
	const b: ElbowRect = { x: xOffset + 520, y: yOffset - 80, w: 220, h: Math.max(180, count * 32 + 50) }
	const from = Array.from({ length: count }, (_, index) =>
		(options.fromStart ?? 58) + index * (options.fromStep ?? 30) + yOffset)
	const to = Array.from({ length: count }, (_, index) =>
		(options.toStart ?? -48) + index * (options.toStep ?? 30) + yOffset)
	if (options.invert) to.reverse()
	return from.map((fromY, index) => routeElbow({
		start: { point: { x: a.x + a.w, y: fromY }, side: 'right', box: a },
		end: { point: { x: b.x, y: to[index] }, side: 'left', box: b },
	}))
}

function horizontalBundle(count: number, y = 170): ElbowRoute[] {
	return Array.from({ length: count }, (_, index) => {
		const leftX = 20 + index * 22
		const rightX = 330 - index * 18
		return routeFromPoints([
			{ x: leftX, y: 30 + index * 24 },
			{ x: leftX, y },
			{ x: rightX, y },
			{ x: rightX, y: 310 - index * 20 },
		])
	})
}

function fanBundle(count: number, direction: 'out' | 'in'): ElbowRoute[] {
	const a: ElbowRect = { x: 0, y: 0, w: 220, h: Math.max(200, count * 36 + 40) }
	const b: ElbowRect = { x: 540, y: -70, w: 220, h: Math.max(240, count * 44 + 50) }
	return Array.from({ length: count }, (_, index) => routeElbow({
		start: {
			point: { x: a.x + a.w, y: direction === 'out' ? 110 : 48 + index * 34 },
			side: 'right',
			box: a,
		},
		end: {
			point: { x: b.x, y: direction === 'in' ? 80 : -35 + index * 42 },
			side: 'left',
			box: b,
		},
	}))
}

function obstacleBundle(count: number): ElbowRoute[] {
	const a: ElbowRect = { x: 0, y: 210, w: 220, h: 210 }
	const b: ElbowRect = { x: 760, y: 0, w: 220, h: 210 }
	const wall: ElbowRect = { x: 390, y: 65, w: 130, h: 390 }
	return Array.from({ length: count }, (_, index) => routeElbow({
		start: { point: { x: 220, y: 260 + index * 32 }, side: 'right', box: a },
		end: { point: { x: 760, y: 55 + index * 32 }, side: 'left', box: b },
		obstacles: [wall],
	}))
}

function translateRoutes(routes: readonly ElbowRoute[], dx: number, dy: number): ElbowRoute[] {
	return routes.map((route) => routeFromPoints(
		route.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
	))
}

const EDGE_SCENARIOS: EdgeScenario[] = [
	{
		id: '01-twin-rail', title: 'Twin rail',
		summary: 'Two ordinary cables choose the same deterministic mid-channel.',
		expected: 'The shared vertical separates into two 14-unit channels.',
		routes: routedBundle(2),
	},
	{
		id: '02-offset-triple', title: 'Offset triple',
		summary: 'Three staggered sources and sinks overlap through most of one corridor.',
		expected: 'All three channels separate without a crossing.',
		routes: routedBundle(3),
	},
	{
		id: '03-tight-four', title: 'Tight four',
		summary: 'Four close port rows make the shared run dominate the drawing.',
		expected: 'Stable cable identity resolves otherwise free ordering.',
		routes: routedBundle(4, { fromStep: 20, toStep: 20 }),
	},
	{
		id: '04-wide-five', title: 'Wide five',
		summary: 'A five-cable bundle spans a larger vertical range.',
		expected: 'Every avoidable coincident interior run reaches zero.',
		routes: routedBundle(5, { fromStep: 36, toStep: 36 }),
	},
	{
		id: '05-fan-out', title: 'One-to-five fan-out',
		summary: 'Five routes leave one source point before diverging to separate sinks.',
		expected: 'The shared source trunk stays; the interior channels fan out cleanly.',
		routes: fanBundle(5, 'out'),
	},
	{
		id: '06-fan-in', title: 'Five-to-one fan-in',
		summary: 'Five sources converge on one sink while sharing the middle corridor.',
		expected: 'The shared sink trunk stays; upstream channels remain legible.',
		routes: fanBundle(5, 'in'),
	},
	{
		id: '07-inverted-pair', title: 'Inverted pair',
		summary: 'Source order and sink order disagree, so one crossing is topologically real.',
		expected: 'Overlap disappears and exactly one unavoidable crossing is reported.',
		routes: routedBundle(2, { invert: true }),
	},
	{
		id: '08-seven-port-bus', title: 'Seven-port bus',
		summary: 'Seven aligned port rows compress into a single automatic rail.',
		expected: 'Seven deterministic rails appear in source order.',
		routes: routedBundle(7, { fromStep: 28, toStep: 28 }),
	},
	{
		id: '09-short-overlaps', title: 'Short overlaps',
		summary: 'Five verticals touch the same rail only over short staggered spans.',
		expected: 'Even short overlaps above tolerance receive separate channels.',
		routes: routedBundle(5, { fromStart: 80, toStart: 40, fromStep: 22, toStep: 22 }),
	},
	{
		id: '10-long-overlaps', title: 'Long overlaps',
		summary: 'Six cables cross a tall gap with nearly complete coincident runs.',
		expected: 'The large overlap collapses to distinct 14-unit rails.',
		routes: routedBundle(6, { fromStart: 230, toStart: -150, fromStep: 18, toStep: 18 }),
	},
	{
		id: '11-horizontal-track', title: 'Horizontal shared track',
		summary: 'Four orthogonal routes collide along a horizontal interior segment.',
		expected: 'Axis-independent nudging separates the horizontal track vertically.',
		routes: horizontalBundle(4),
	},
	{
		id: '12-two-axis-grid', title: 'Two-axis grid',
		summary: 'A vertical bundle and a horizontal bundle occupy the same scene.',
		expected: 'Each axis is solved independently; transverse crossings stay explicit.',
		routes: [...routedBundle(4), ...translateRoutes(horizontalBundle(4, 220), 250, -20)],
	},
	{
		id: '13-two-components', title: 'Two independent buses',
		summary: 'Two remote block pairs each carry their own overlapping bundle.',
		expected: 'Both components tidy in one command without influencing each other.',
		routes: [...routedBundle(4), ...routedBundle(5, { xOffset: 820, yOffset: 240 })],
	},
	{
		id: '14-locked-centre', title: 'Locked centre rail',
		summary: 'The middle cable is hand-routed and therefore immovable.',
		expected: 'Free cables spread around the retained authored channel.',
		routes: routedBundle(5),
		locked: [false, false, true, false, false],
	},
	{
		id: '15-two-locked', title: 'Two authored constraints',
		summary: 'Two of seven coincident cables already carry user-authored geometry.',
		expected: 'Both authored rails stay byte-identical; five free rails move around them.',
		routes: routedBundle(7),
		locked: [false, true, false, false, false, true, false],
	},
	{
		id: '16-obstacle-three', title: 'Obstacle, three shared runs',
		summary: 'A wall forces six-point routes sharing two verticals and one horizontal.',
		expected: 'All three channel bundles separate with zero avoidable overlap.',
		routes: obstacleBundle(3),
	},
	{
		id: '17-obstacle-five', title: 'Obstacle, five cables',
		summary: 'Five six-point cables snake around the same large obstacle.',
		expected: 'Each shared run gets its own independently ordered channel set.',
		routes: obstacleBundle(5),
	},
	{
		id: '18-coincident-subpath', title: 'Coincident subpath',
		summary: 'Six routes share consecutive interior segments before their true fork.',
		expected: 'Stable identity breaks the depth-1 tie; no oscillation appears.',
		routes: Array.from({ length: 6 }, (_, index) => routeFromPoints([
			{ x: 10, y: 40 + index * 22 },
			{ x: 90, y: 40 + index * 22 },
			{ x: 90, y: 190 },
			{ x: 260, y: 190 },
			{ x: 260, y: 46 + index * 25 },
			{ x: 390, y: 46 + index * 25 },
		])),
	},
	{
		id: '19-mixed-locked-obstacle', title: 'Authored cable around an obstacle',
		summary: 'A five-route obstacle bundle contains an authored middle path.',
		expected: 'Three shared runs tidy while the authored path remains fixed.',
		routes: obstacleBundle(5),
		locked: [false, false, true, false, false],
	},
	{
		id: '20-stress-board', title: 'Sixteen-cable stress board',
		summary: 'Three dense buses, two axes, an obstacle, and retained authored routes.',
		expected: 'Every eligible shared channel is processed deterministically in one pass.',
		routes: [
			...routedBundle(6),
			...routedBundle(5, { xOffset: 780, yOffset: 240 }),
			...translateRoutes(horizontalBundle(3, 190), 430, 520),
			...translateRoutes(obstacleBundle(2), 1500, 50),
		],
		locked: [false, false, true, false, false, false, false, true],
	},
]

function seeded(seed: number): () => number {
	let value = seed >>> 0
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0
		return value / 0x100000000
	}
}

function generatedGraph(
	id: string,
	title: string,
	summary: string,
	count: number,
	layers: number,
	edgeCount: number,
	options: {
		components?: number
		cycle?: boolean
		variable?: boolean
		topology?: 'chain' | 'diamond' | 'fan-out' | 'fan-in' | 'tree' | 'ladder'
	} = {},
): NodeScenario {
	const random = seeded(20260902 + Number(id.slice(0, 2)) * 997)
	const components = options.components ?? 1
	const nodes = Array.from({ length: count }, (_, index) => ({
		id: `${id}-n${index}`,
		x: 30 + random() * Math.max(180, 440 - count * 3),
		y: 30 + random() * Math.max(150, 340 - count),
		width: options.variable ? 72 + Math.round(random() * 88) : 100,
		height: options.variable ? 44 + Math.round(random() * 54) : 58,
	}))
	const layerOf = (index: number) => Math.floor((index % Math.ceil(count / components)) * layers / Math.ceil(count / components))
	const componentOf = (index: number) => Math.min(components - 1, Math.floor(index * components / count))
	const pairs: [number, number][] = []
	const seen = new Set<string>()
	const add = (source: number, target: number) => {
		if (source === target) return
		const key = `${source}:${target}`
		if (seen.has(key)) return
		seen.add(key)
		pairs.push([source, target])
	}
	if (options.topology === 'diamond' && count >= 4) {
		add(0, 1); add(0, 2); add(1, 3); add(2, 3)
	} else if (options.topology === 'fan-out') {
		for (let index = 1; index < count; index += 1) add(0, index)
	} else if (options.topology === 'fan-in') {
		for (let index = 0; index + 1 < count; index += 1) add(index, count - 1)
	} else if (options.topology === 'tree') {
		for (let index = 1; index < count; index += 1) add(Math.floor((index - 1) / 2), index)
	} else if (options.topology === 'ladder') {
		const half = Math.floor(count / 2)
		for (let index = 0; index + 1 < half; index += 1) {
			add(index, index + 1)
			add(index + half, index + half + 1)
			add(index, index + half + 1)
		}
	} else {
		for (let index = 0; index + 1 < count && pairs.length < edgeCount; index += 1) {
			if (componentOf(index) === componentOf(index + 1) && layerOf(index) < layerOf(index + 1)) {
				add(index, index + 1)
			}
		}
	}
	let guard = 0
	while (pairs.length < edgeCount && guard < edgeCount * 100) {
		guard += 1
		const source = Math.floor(random() * count)
		const candidates = nodes.map((_, index) => index).filter((target) =>
			componentOf(source) === componentOf(target) && layerOf(source) < layerOf(target))
		if (candidates.length === 0) continue
		add(source, candidates[Math.floor(random() * candidates.length)])
	}
	if (options.cycle && count > 2) add(count - 1, 0)
	if (id === '01-overlap-pair') {
		nodes[0].x = 120; nodes[0].y = 100
		nodes[1].x = 145; nodes[1].y = 118
	}
	if (id === '02-reversed-chain') {
		nodes[0].x = 460; nodes[0].y = 90
		nodes[1].x = 270; nodes[1].y = 170
		nodes[2].x = 80; nodes[2].y = 250
	}
	if (id === '03-diamond') {
		nodes.forEach((node, index) => {
			node.x = 130 + (index % 2) * 28
			node.y = 110 + Math.floor(index / 2) * 24
		})
	}
	return {
		id,
		title,
		summary,
		nodes,
		edges: pairs.map(([source, target], index) => ({
			id: `${id}-e${index}`,
			source: nodes[source].id,
			target: nodes[target].id,
		})),
	}
}

type NodeConfigOptions = {
	components?: number
	cycle?: boolean
	variable?: boolean
	topology?: 'chain' | 'diamond' | 'fan-out' | 'fan-in' | 'tree' | 'ladder'
}

const NODE_CONFIGS: Array<[string, string, string, number, number, number, NodeConfigOptions?]> = [
	['01-overlap-pair', 'Overlapping pair', 'Two connected nodes begin almost directly on top of each other.', 2, 2, 1, { topology: 'chain' }],
	['02-reversed-chain', 'Reversed chain', 'Three logical stages are placed in reverse reading order.', 3, 3, 2, { topology: 'chain' }],
	['03-diamond', 'Tangled diamond', 'A split and join begin as one compact knot.', 4, 3, 4, { topology: 'diamond' }],
	['04-fan-out', 'Five-way fan-out', 'One source drives four successors packed into the same patch.', 5, 2, 4, { topology: 'fan-out' }],
	['05-fan-in', 'Five-way fan-in', 'Four producers converge on one consumer from arbitrary positions.', 5, 2, 4, { topology: 'fan-in' }],
	['06-fork-join', 'Fork and join', 'Seven nodes make a two-sided fork with a final merge.', 7, 4, 9],
	['07-zigzag', 'Zigzag pipeline', 'Eight stages have the right topology but a noisy spatial order.', 8, 5, 10],
	['08-two-chains', 'Two disconnected chains', 'Independent flows overlap each other before component separation.', 8, 4, 7, { components: 2 }],
	['09-cycle', 'Small feedback cycle', 'A cyclic graph must break one edge while arranging the remaining flow.', 8, 4, 10, { cycle: true }],
	['10-variable-blocks', 'Mixed Block sizes', 'Widths and heights vary while ten nodes share a cramped area.', 10, 5, 14, { variable: true }],
	['11-dense-dag', 'Dense ten-node DAG', 'Extra cross-layer dependencies obscure a short core pipeline.', 10, 5, 20],
	['12-three-components', 'Three components', 'Three independent subsystems start interleaved.', 12, 4, 12, { components: 3, variable: true }],
	['13-wide-star', 'Wide star', 'A broad one-to-many topology needs vertical distribution.', 12, 3, 18, { topology: 'fan-out' }],
	['14-ladder', 'Cross-braced ladder', 'Two logical rails carry cross-links between successive stages.', 14, 6, 24, { topology: 'ladder' }],
	['15-binary-tree', 'Binary tree', 'Fifteen nodes need breadth without losing left-to-right depth.', 15, 4, 20, { topology: 'tree' }],
	['16-feedback-network', 'Feedback network', 'A larger DAG carries one explicit back edge.', 16, 6, 28, { cycle: true, variable: true }],
	['17-mixed-density', 'Mixed-density pipeline', 'Sparse early stages feed a dense central transform.', 18, 6, 34, { variable: true }],
	['18-tangled-twenty-four', 'Twenty-four-node knot', 'A realistic mid-size graph is compressed into a small square.', 24, 7, 46, { variable: true }],
	['19-five-subsystems', 'Five interleaved subsystems', 'Thirty nodes from five components begin spatially indistinguishable.', 30, 6, 50, { components: 5, variable: true }],
	['20-fifty-eighty', '50 nodes / 80 edges', 'The measured PyBlocks stress scale, deliberately seeded as a pile.', 50, 8, 80, { variable: true }],
]

const NODE_SCENARIOS = NODE_CONFIGS.map(([id, title, summary, nodes, layers, edges, options]) =>
	generatedGraph(id, title, summary, nodes, layers, edges, options))

function round(value: number): number {
	return Math.round(value * 10) / 10
}

function orthogonal(routes: readonly ElbowRoute[]): boolean {
	return routes.every((route) => route.points.every((point, index) => {
		if (index === 0) return true
		const previous = route.points[index - 1]
		return Math.abs(previous.x - point.x) < 1e-6 || Math.abs(previous.y - point.y) < 1e-6
	}))
}

function nodeOverlap(nodes: readonly OrganizeGraphNode[]): { pairs: number; area: number } {
	let pairs = 0
	let area = 0
	for (let i = 0; i < nodes.length; i += 1) {
		for (let j = i + 1; j < nodes.length; j += 1) {
			const width = Math.min(nodes[i].x + nodes[i].width, nodes[j].x + nodes[j].width)
				- Math.max(nodes[i].x, nodes[j].x)
			const height = Math.min(nodes[i].y + nodes[i].height, nodes[j].y + nodes[j].height)
				- Math.max(nodes[i].y, nodes[j].y)
			if (width <= 0 || height <= 0) continue
			pairs += 1
			area += width * height
		}
	}
	return { pairs, area: round(area) }
}

function routesForGraph(nodes: readonly OrganizeGraphNode[], edges: readonly OrganizeGraphEdge[]): ElbowRoute[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	return edges.flatMap((edge) => {
		const source = byId.get(edge.source)
		const target = byId.get(edge.target)
		if (!source || !target) return []
		const sourceBox = { x: source.x, y: source.y, w: source.width, h: source.height }
		const targetBox = { x: target.x, y: target.y, w: target.width, h: target.height }
		const obstacles = nodes
			.filter((node) => node.id !== source.id && node.id !== target.id)
			.map((node) => ({ x: node.x, y: node.y, w: node.width, h: node.height }))
		return [routeElbow({
			start: {
				point: { x: source.x + source.width, y: source.y + source.height / 2 },
				side: 'right',
				box: sourceBox,
			},
			end: {
				point: { x: target.x, y: target.y + target.height / 2 },
				side: 'left',
				box: targetBox,
			},
			obstacles,
		})]
	})
}

function graphMetrics(nodes: readonly OrganizeGraphNode[], edges: readonly OrganizeGraphEdge[], routes: readonly ElbowRoute[]) {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	const overlap = nodeOverlap(nodes)
	const backwards = edges.filter((edge) => {
		const source = byId.get(edge.source)!
		const target = byId.get(edge.target)!
		return target.x + target.width / 2 <= source.x + source.width / 2
	}).length
	const minX = Math.min(...nodes.map((node) => node.x))
	const minY = Math.min(...nodes.map((node) => node.y))
	const maxX = Math.max(...nodes.map((node) => node.x + node.width))
	const maxY = Math.max(...nodes.map((node) => node.y + node.height))
	return {
		nodeOverlapPairs: overlap.pairs,
		nodeOverlapArea: overlap.area,
		backwardsEdges: backwards,
		edgeCrossings: countCrossings(routes),
		edgeOverlap: round(coincidentOverlap(routes)),
		width: round(maxX - minX),
		height: round(maxY - minY),
	}
}

async function main() {
	const edgeCases = EDGE_SCENARIOS.map((scenario, index) => {
		const locked = Array.from({ length: scenario.routes.length }, (_, routeIndex) =>
			Boolean(scenario.locked?.[routeIndex]))
		const report = nudgeRoutes(scenario.routes, {}, locked)
		if (!orthogonal(report.routes)) {
			throw new Error(`${scenario.id}: nudge made a non-orthogonal route ${JSON.stringify(report.routes.map((route) => route.points))}`)
		}
		if (scenario.routes.some((route, routeIndex) => {
			const after = report.routes[routeIndex]
			return route.points[0].x !== after.points[0].x
				|| route.points[0].y !== after.points[0].y
				|| route.points.at(-1)!.x !== after.points.at(-1)!.x
				|| route.points.at(-1)!.y !== after.points.at(-1)!.y
		})) throw new Error(`${scenario.id}: nudge moved an endpoint`)
		return {
			id: scenario.id,
			difficulty: index + 1,
			title: scenario.title,
			summary: scenario.summary,
			expected: scenario.expected,
			locked,
			before: {
				routes: scenario.routes.map((route) => route.points),
				metrics: {
					overlap: round(report.overlapBefore),
					crossings: countCrossings(scenario.routes),
				},
			},
			after: {
				routes: report.routes.map((route) => route.points),
				metrics: {
					overlap: round(report.overlapAfter),
					crossings: countCrossings(report.routes),
					bundles: report.bundles.length,
					forcedCrossings: report.forcedCrossings.length,
				},
			},
		}
	})

	const nodeCases = []
	for (let index = 0; index < NODE_SCENARIOS.length; index += 1) {
		const scenario = NODE_SCENARIOS[index]
		const beforeRoutes = routesForGraph(scenario.nodes, scenario.edges)
		const started = performance.now()
		const organized = await organizeGraph(scenario.nodes, scenario.edges)
		const layoutMs = performance.now() - started
		const repeated = await organizeGraph(scenario.nodes, scenario.edges)
		if (JSON.stringify(organized) !== JSON.stringify(repeated)) {
			throw new Error(`${scenario.id}: ELK output was not deterministic`)
		}
		const afterRoutes = routesForGraph(organized.nodes, scenario.edges)
		const beforeMetrics = graphMetrics(scenario.nodes, scenario.edges, beforeRoutes)
		const afterMetrics = graphMetrics(organized.nodes, scenario.edges, afterRoutes)
		if (afterMetrics.nodeOverlapPairs !== 0) throw new Error(`${scenario.id}: organized nodes still overlap`)
		nodeCases.push({
			id: scenario.id,
			difficulty: index + 1,
			title: scenario.title,
			summary: scenario.summary,
			before: { nodes: scenario.nodes, edges: scenario.edges, routes: beforeRoutes.map((route) => route.points), metrics: beforeMetrics },
			after: { nodes: organized.nodes, edges: scenario.edges, routes: afterRoutes.map((route) => route.points), metrics: afterMetrics },
			layoutMs: round(layoutMs),
		})
	}

	const data = {
		generatedAt: new Date().toISOString(),
		seed: 20260902,
		edgeCases,
		nodeCases,
		summary: {
			edgeCases: edgeCases.length,
			nodeCases: nodeCases.length,
			totalBeforeAfterCanvases: (edgeCases.length + nodeCases.length) * 2,
			edgeOverlapBefore: round(edgeCases.reduce((sum, item) => sum + item.before.metrics.overlap, 0)),
			edgeOverlapAfter: round(edgeCases.reduce((sum, item) => sum + item.after.metrics.overlap, 0)),
			nodeOverlapPairsBefore: nodeCases.reduce((sum, item) => sum + item.before.metrics.nodeOverlapPairs, 0),
			nodeOverlapPairsAfter: nodeCases.reduce((sum, item) => sum + item.after.metrics.nodeOverlapPairs, 0),
			maxLayoutMs: Math.max(...nodeCases.map((item) => item.layoutMs)),
		},
	}
	if (data.summary.edgeCases !== 20 || data.summary.nodeCases !== 20) {
		throw new Error('comparison suite must contain exactly 20 cases per command')
	}
	const output = resolve(process.env.SYSTEMSKETCH_LAYOUT_DATA ?? 'docs/assets/layout-comparison-cases.json')
	await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
	process.stdout.write(`${output}\n`)
}

await main()
