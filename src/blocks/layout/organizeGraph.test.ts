import { describe, expect, it } from 'vitest'

import { ORGANIZE_LAYOUT_OPTIONS, organizeGraph, type OrganizeGraphNode } from './organizeGraph'

function overlaps(a: OrganizeGraphNode, b: OrganizeGraphNode): boolean {
	return a.x < b.x + b.width
		&& a.x + a.width > b.x
		&& a.y < b.y + b.height
		&& a.y + a.height > b.y
}

describe('organizeGraph', () => {
	it('lays a tangled graph left-to-right without overlapping nodes', async () => {
		const nodes = [
			{ id: 'a', x: 200, y: 100, width: 120, height: 60 },
			{ id: 'b', x: 180, y: 115, width: 180, height: 80 },
			{ id: 'c', x: 210, y: 90, width: 100, height: 90 },
			{ id: 'd', x: 190, y: 120, width: 140, height: 50 },
		]
		const edges = [
			{ id: 'ab', source: 'a', target: 'b' },
			{ id: 'ac', source: 'a', target: 'c' },
			{ id: 'bd', source: 'b', target: 'd' },
			{ id: 'cd', source: 'c', target: 'd' },
		]
		const result = await organizeGraph(nodes, edges)
		const byId = new Map(result.nodes.map((node) => [node.id, node]))

		for (let i = 0; i < result.nodes.length; i += 1) {
			for (let j = i + 1; j < result.nodes.length; j += 1) {
				expect(overlaps(result.nodes[i], result.nodes[j])).toBe(false)
			}
		}
		for (const edge of edges) {
			expect(byId.get(edge.source)!.x).toBeLessThan(byId.get(edge.target)!.x)
		}
	})

	it('anchors the result where the input graph began', async () => {
		const nodes = [
			{ id: 'first', x: -240, y: 880, width: 90, height: 50 },
			{ id: 'second', x: 400, y: 920, width: 90, height: 50 },
		]
		const result = await organizeGraph(nodes, [{ id: 'edge', source: 'first', target: 'second' }])
		expect(Math.min(...result.nodes.map((node) => node.x))).toBe(-240)
		expect(Math.min(...result.nodes.map((node) => node.y))).toBe(880)
	})

	it('is pure and deterministic', async () => {
		const nodes = Array.from({ length: 8 }, (_, index) => ({
			id: `n${index}`,
			x: 100 + (index % 3) * 7,
			y: 200 + (index % 2) * 9,
			width: 80 + index * 3,
			height: 50 + (index % 3) * 4,
		}))
		const edges = Array.from({ length: 7 }, (_, index) => ({
			id: `e${index}`,
			source: `n${index}`,
			target: `n${index + 1}`,
		}))
		const snapshot = JSON.stringify({ nodes, edges })
		const first = await organizeGraph(nodes, edges)
		const second = await organizeGraph(nodes, edges)
		expect(first).toEqual(second)
		expect(JSON.stringify({ nodes, edges })).toBe(snapshot)
	})

	it('aligns exact port rows across mixed aligned and offset Blocks', async () => {
		const nodes = [
			{
				id: 'aligned-source', x: 70, y: 140, width: 120, height: 120,
				ports: [{ id: 'a-out', side: 'right' as const, x: 120, y: 20 }],
			},
			{
				id: 'offset-middle', x: 84, y: 148, width: 160, height: 130,
				ports: [
					{ id: 'b-in', side: 'left' as const, x: 0, y: 70 },
					{ id: 'b-out', side: 'right' as const, x: 160, y: 30 },
				],
			},
			{
				id: 'offset-sink', x: 90, y: 156, width: 110, height: 150,
				ports: [{ id: 'c-in', side: 'left' as const, x: 0, y: 90 }],
			},
		]
		const result = await organizeGraph(nodes, [
			{ id: 'ab', source: 'aligned-source', sourcePort: 'a-out', target: 'offset-middle', targetPort: 'b-in' },
			{ id: 'bc', source: 'offset-middle', sourcePort: 'b-out', target: 'offset-sink', targetPort: 'c-in' },
		])
		const byId = new Map(result.nodes.map((node) => [node.id, node]))
		expect(Math.abs(
			byId.get('aligned-source')!.y + 20 - (byId.get('offset-middle')!.y + 70),
		)).toBeLessThan(1)
		expect(Math.abs(
			byId.get('offset-middle')!.y + 30 - (byId.get('offset-sink')!.y + 90),
		)).toBeLessThan(1)
	})

	it('drops edges outside the supplied node scope', async () => {
		const nodes = [
			{ id: 'a', x: 0, y: 0, width: 80, height: 40 },
			{ id: 'b', x: 0, y: 0, width: 80, height: 40 },
		]
		const result = await organizeGraph(nodes, [
			{ id: 'inside', source: 'a', target: 'b' },
			{ id: 'leaves', source: 'b', target: 'outside' },
		])
		expect(result.edges.map((edge) => edge.id)).toEqual(['inside'])
	})

	it('keeps the evaluated PyBlocks spacing and orthogonal-routing corrections', () => {
		expect(ORGANIZE_LAYOUT_OPTIONS['elk.edgeRouting']).toBe('ORTHOGONAL')
		expect(ORGANIZE_LAYOUT_OPTIONS['elk.layered.spacing.edgeEdgeBetweenLayers']).toBe('14')
		expect(ORGANIZE_LAYOUT_OPTIONS['elk.spacing.edgeEdgeBetweenLayers']).toBeUndefined()
		expect(ORGANIZE_LAYOUT_OPTIONS['elk.layered.considerModelOrder.strategy']).toBe('NODES_AND_EDGES')
	})
})
