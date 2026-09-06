/**
 * The Blackboard lens: every `{key}` a node touches becomes a value pill,
 * writes run into the pill's inlet and reads out of its outlet.
 *
 * Three placements, all keeping the structural layout exactly where it is:
 *
 *   rail     — one row past the far edge of the tree, evenly spaced
 *   table    — one column beside the tree, a Blackboard panel in miniature
 *   pytrees  — py_trees' `render_dot_tree(with_blackboard_variables=True)`:
 *              a sink rank past the far edge, each key pulled under the
 *              nodes that touch it, curved splines, blue writes, green reads
 *
 * The pytrees placement mirrors what Graphviz does with those edges
 * (`constraint=false`, `rank=sink`): the keys cannot change any node's rank,
 * so only their order and cross position follow their accessors.
 */
import type { BtNode, BtTree } from './btcppXml'
import {
	keyPath,
	type BtOrientation,
	type BtPoint,
	type BtRect,
	type BtScene,
	type BtSceneEdge,
	type BtSceneKey,
	type BtBlackboardLayout,
} from './behaviorTreeModel'

export type BtAccessDirection = 'read' | 'write' | 'use'

export interface BtKeyAccess {
	key: string
	global: boolean
	path: string
	portName: string
	direction: BtAccessDirection
	type: string
}

/** Every Blackboard access in one tree, in document order. Inout is two accesses. */
export function collectKeyAccesses(tree: BtTree | null): BtKeyAccess[] {
	const accesses: BtKeyAccess[] = []
	if (!tree) return accesses
	for (const node of tree.nodes) {
		for (const binding of node.ports) {
			if (!binding.key) continue
			const base = { key: binding.key, global: binding.global, path: node.path, portName: binding.name, type: binding.type }
			if (binding.direction === 'input') accesses.push({ ...base, direction: 'read' })
			else if (binding.direction === 'output') accesses.push({ ...base, direction: 'write' })
			else if (binding.direction === 'inout') accesses.push({ ...base, direction: 'read' }, { ...base, direction: 'write' })
			else accesses.push({ ...base, direction: 'use' })
		}
	}
	return accesses
}

export interface BlackboardKeySummary {
	key: string
	global: boolean
	path: string
	type: string
	reads: string[]
	writes: string[]
	uses: string[]
	/** First access in document order; the stable ordering key. */
	firstIndex: number
}

export function summarizeKeys(accesses: BtKeyAccess[]): BlackboardKeySummary[] {
	const byPath = new Map<string, BlackboardKeySummary>()
	accesses.forEach((access, index) => {
		const path = keyPath(access.key, access.global)
		let summary = byPath.get(path)
		if (!summary) {
			summary = { key: access.key, global: access.global, path, type: access.type, reads: [], writes: [], uses: [], firstIndex: index }
			byPath.set(path, summary)
		}
		if (!summary.type && access.type) summary.type = access.type
		const list = access.direction === 'read' ? summary.reads : access.direction === 'write' ? summary.writes : summary.uses
		if (!list.includes(access.path)) list.push(access.path)
	})
	return [...byPath.values()].sort((left, right) => left.firstIndex - right.firstIndex)
}

/** Pill metrics shared with the value Block: 56 tall, mono text, capsule padding. */
export const KEY_PILL_H = 56
export const KEY_PILL_MIN_W = 120
export const KEY_PILL_GAP = 44
export const KEY_RAIL_GAP = 150
export const KEY_TABLE_GAP = 170
export const KEY_TABLE_ROW_GAP = 28
export const KEY_MIN_GAP_PYTREES = 36

export function keyPillLabel(summary: Pick<BlackboardKeySummary, 'key' | 'global'>): string {
	return `${summary.global ? '@' : ''}${summary.key}`
}

export function keyPillWidth(label: string): number {
	return Math.max(KEY_PILL_MIN_W, 44 + label.length * 14.4)
}

export interface BlackboardLayoutOptions {
	layout: BtBlackboardLayout
	orientation: BtOrientation
	/**
	 * Where an access edge meets a node. Port face supplies the real dot; the
	 * simple face falls back to the far edge of the card, reads and writes
	 * spread apart so the two directions never overprint.
	 */
	anchor?: (path: string, portName: string, direction: BtAccessDirection) => BtPoint | null
	/**
	 * The real capsule's size for a key. The projection supplies the value
	 * Block's own measurement so packing never underestimates a pill that
	 * paints `name: type =`; the layout tests fall back to the estimate.
	 */
	measurePill?: (label: string, type: string) => { w: number; h: number }
}

export interface BlackboardLayoutResult {
	keys: BtSceneKey[]
	edges: BtSceneEdge[]
}

/**
 * Place the pills and route the access edges. `scene` is the structural
 * scene in canvas coordinates; nothing in it moves.
 */
export function layoutBlackboard(scene: BtScene, tree: BtTree | null, options: BlackboardLayoutOptions): BlackboardLayoutResult {
	const summaries = summarizeKeys(collectKeyAccesses(tree))
	if (summaries.length === 0) return { keys: [], edges: [] }
	const nodeRects = new Map(scene.nodes.map((entry) => [entry.path, entry.rect]))
	const down = options.orientation === 'down'
	const bounds = scene.bounds

	const accessorCenters = (summary: BlackboardKeySummary): number[] => {
		const paths = [...summary.reads, ...summary.writes, ...summary.uses]
		return paths.map((path) => nodeRects.get(path)).filter((rect): rect is BtRect => Boolean(rect))
			.map((rect) => (down ? rect.x + rect.w / 2 : rect.y + rect.h / 2))
	}
	const accessorCenter = (summary: BlackboardKeySummary): number => {
		const centers = accessorCenters(summary)
		if (centers.length === 0) return down ? bounds.x + bounds.w / 2 : bounds.y + bounds.h / 2
		return centers.reduce((sum, value) => sum + value, 0) / centers.length
	}

	const pills: BtSceneKey[] = summaries.map((summary) => {
		const label = keyPillLabel(summary)
		const size = options.measurePill?.(label, summary.type) ?? { w: keyPillWidth(label), h: KEY_PILL_H }
		return {
			key: summary.key,
			global: summary.global,
			path: summary.path,
			rect: { x: 0, y: 0, w: size.w, h: size.h },
			label,
			type: summary.type,
			reads: summary.reads,
			writes: summary.writes,
			uses: summary.uses,
		}
	})

	if (options.layout === 'table') placeTable(pills, bounds, down)
	else if (options.layout === 'rail') placeRail(pills, bounds, down)
	else placePyTrees(pills, summaries, bounds, down, accessorCenter, accessorCenters)

	const edges: BtSceneEdge[] = []
	const curve = options.layout === 'pytrees'
	for (const pill of pills) {
		const inlet: BtPoint = { x: pill.rect.x, y: pill.rect.y + pill.rect.h / 2 }
		const outlet: BtPoint = { x: pill.rect.x + pill.rect.w, y: pill.rect.y + pill.rect.h / 2 }
		const summary = summaries.find((entry) => entry.path === pill.path)!
		for (const path of summary.writes) {
			const from = anchorFor(path, summary, 'write', nodeRects, options, down)
			if (!from) continue
			edges.push({ id: `write:${path}→${pill.path}`, kind: 'write', points: routePoints(from, inlet, curve, down), curve, arrowEnd: true, from: path, to: pill.path })
		}
		for (const path of summary.reads) {
			const to = anchorFor(path, summary, 'read', nodeRects, options, down)
			if (!to) continue
			edges.push({ id: `read:${pill.path}→${path}`, kind: 'read', points: routePoints(outlet, to, curve, down), curve, arrowEnd: true, from: pill.path, to: path })
		}
		for (const path of summary.uses) {
			const at = anchorFor(path, summary, 'use', nodeRects, options, down)
			if (!at) continue
			edges.push({ id: `use:${path}↔${pill.path}`, kind: 'use', points: routePoints(at, inlet, curve, down), curve, arrowEnd: false, from: path, to: pill.path })
		}
	}
	return { keys: pills, edges }
}

function anchorFor(
	path: string,
	summary: BlackboardKeySummary,
	direction: BtAccessDirection,
	nodeRects: Map<string, BtRect>,
	options: BlackboardLayoutOptions,
	down: boolean,
): BtPoint | null {
	const rect = nodeRects.get(path)
	if (!rect) return null
	const portName = ''
	const provided = options.anchor?.(path, portName, direction)
	if (provided) return provided
	// Simple face: leave from the far edge, writes a little after centre and
	// reads a little before it, so a node that both reads and writes one key
	// shows two distinct wires.
	const spread = direction === 'write' ? 18 : direction === 'read' ? -18 : 0
	void summary
	return down
		? { x: rect.x + rect.w / 2 + spread, y: rect.y + rect.h }
		: { x: rect.x + rect.w, y: rect.y + rect.h / 2 + spread }
}

function routePoints(from: BtPoint, to: BtPoint, curve: boolean, down: boolean): BtPoint[] {
	if (curve) return [from, to]
	// Elbow: leave along the reading direction, cross, arrive along it.
	if (down) {
		const midY = (from.y + to.y) / 2
		return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]
	}
	const midX = (from.x + to.x) / 2
	return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
}

function placeRail(pills: BtSceneKey[], bounds: BtRect, down: boolean) {
	const total = pills.reduce((sum, pill) => sum + (down ? pill.rect.w : pill.rect.h), 0) + KEY_PILL_GAP * (pills.length - 1)
	let cursor = down ? bounds.x + bounds.w / 2 - total / 2 : bounds.y + bounds.h / 2 - total / 2
	for (const pill of pills) {
		if (down) {
			pill.rect = { ...pill.rect, x: cursor, y: bounds.y + bounds.h + KEY_RAIL_GAP }
			cursor += pill.rect.w + KEY_PILL_GAP
		} else {
			pill.rect = { ...pill.rect, x: bounds.x + bounds.w + KEY_RAIL_GAP, y: cursor }
			cursor += pill.rect.h + KEY_PILL_GAP
		}
	}
}

function placeTable(pills: BtSceneKey[], bounds: BtRect, down: boolean) {
	// A column beside the tree (top-to-bottom) or a row below it (left-to-right):
	// always perpendicular to the rail placement, always aligned on the inlet.
	if (down) {
		const width = Math.max(...pills.map((pill) => pill.rect.w))
		let y = bounds.y
		for (const pill of pills) {
			pill.rect = { ...pill.rect, x: bounds.x + bounds.w + KEY_TABLE_GAP, y, w: width }
			y += KEY_PILL_H + KEY_TABLE_ROW_GAP
		}
		return
	}
	let x = bounds.x
	for (const pill of pills) {
		pill.rect = { ...pill.rect, x, y: bounds.y + bounds.h + KEY_TABLE_GAP }
		x += pill.rect.w + KEY_PILL_GAP
	}
}

/**
 * Graphviz's sink rank, as py_trees gets it. dot's Blackboard edges carry
 * `weight=0`, so they order the keys — crossing minimisation against the
 * behaviours above, which stay where the tree put them — but do not pull on
 * their positions: the sink rank is then spread evenly across the drawing.
 *
 * The order is the one-sided crossing minimum, solved exactly for up to
 * twelve keys (a subset DP over placements) and by barycentre beyond that.
 */
function placePyTrees(
	pills: BtSceneKey[],
	summaries: BlackboardKeySummary[],
	bounds: BtRect,
	down: boolean,
	accessorCenter: (summary: BlackboardKeySummary) => number,
	accessorCenters: (summary: BlackboardKeySummary) => number[],
) {
	const ordered = orderForFewestCrossings(pills, summaries, accessorCenter, accessorCenters)
	const extent = (pill: BtSceneKey) => (down ? pill.rect.w : pill.rect.h)
	const span = down ? bounds.w : bounds.h
	const spanStart = down ? bounds.x : bounds.y
	const total = ordered.reduce((sum, pill) => sum + extent(pill), 0)
	const evenGap = ordered.length > 1 ? (span - total) / (ordered.length - 1) : 0
	const gap = Math.max(KEY_MIN_GAP_PYTREES, evenGap)
	const packed = total + gap * Math.max(0, ordered.length - 1)
	let cursor = spanStart + (span - packed) / 2
	for (const pill of ordered) {
		pill.rect = down
			? { ...pill.rect, x: cursor, y: bounds.y + bounds.h + KEY_RAIL_GAP }
			: { ...pill.rect, x: bounds.x + bounds.w + KEY_RAIL_GAP, y: cursor }
		cursor += extent(pill) + gap
	}
}

/** One-sided crossing minimisation: the behaviours are fixed, the keys are free. */
export function orderForFewestCrossings(
	pills: BtSceneKey[],
	summaries: BlackboardKeySummary[],
	accessorCenter: (summary: BlackboardKeySummary) => number,
	accessorCenters: (summary: BlackboardKeySummary) => number[],
): BtSceneKey[] {
	const count = pills.length
	if (count <= 1) return pills.slice()
	const centers = summaries.map(accessorCenters)
	// crossings[a][b]: edge crossings when key a is placed left of key b.
	const crossings = centers.map((left) => centers.map((right) => {
		let total = 0
		for (const x of left) for (const y of right) if (x > y) total += 1
		return total
	}))
	if (count > 12) {
		const wishes = summaries.map(accessorCenter)
		return pills.map((pill, index) => ({ pill, wish: wishes[index] })).sort((a, b) => a.wish - b.wish).map((entry) => entry.pill)
	}
	const costOf = (order: number[]) => {
		let total = 0
		for (let i = 0; i < order.length; i += 1) for (let j = i + 1; j < order.length; j += 1) total += crossings[order[i]][order[j]]
		return total
	}
	if (count <= 8) {
		// Every permutation in document order, so a tie resolves to the order
		// the keys first appear in the XML — deterministic and explainable.
		let best: number[] | null = null
		let bestCost = Infinity
		const visit = (prefix: number[], remaining: number[]) => {
			if (remaining.length === 0) {
				const cost = costOf(prefix)
				if (cost < bestCost) {
					bestCost = cost
					best = prefix.slice()
				}
				return
			}
			for (let i = 0; i < remaining.length; i += 1) {
				visit([...prefix, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)])
			}
		}
		visit([], pills.map((_, index) => index))
		return (best ?? pills.map((_, index) => index)).map((index) => pills[index])
	}
	const full = (1 << count) - 1
	const bestCost = new Float64Array(1 << count).fill(Infinity)
	const choice = new Int8Array(1 << count).fill(-1)
	bestCost[0] = 0
	for (let subset = 0; subset < full; subset += 1) {
		if (!Number.isFinite(bestCost[subset])) continue
		for (let next = 0; next < count; next += 1) {
			if (subset & (1 << next)) continue
			let cost = bestCost[subset]
			for (let placed = 0; placed < count; placed += 1) {
				if (subset & (1 << placed)) cost += crossings[placed][next]
			}
			const grown = subset | (1 << next)
			if (cost < bestCost[grown] - 1e-9) {
				bestCost[grown] = cost
				choice[grown] = next
			}
		}
	}
	const order: number[] = []
	for (let subset = full; subset !== 0;) {
		const index = choice[subset]
		order.unshift(index)
		subset &= ~(1 << index)
	}
	return order.map((index) => pills[index])
}

export function keyAccessesForNode(node: BtNode): BtKeyAccess[] {
	return collectKeyAccesses({ id: '', root: node, nodes: [node] })
}
