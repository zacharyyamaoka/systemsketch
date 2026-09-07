import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockPort, type BlockShapeProps } from './blockModel'
import { layoutBlock } from './layoutBlock'

/**
 * The rule the whole two-lens design rests on.
 *
 * Dataflow is the signature and reads down two lanes; a socket that wandered
 * onto the top edge there stops reading as a signature at all. Communication is
 * the topology and needs all four walls. Both are computed from the SAME stored
 * props, so this is the only thing standing between the two lenses and a
 * position that leaks across.
 */
function props(ports: readonly Partial<BlockPort>[]): BlockShapeProps {
	const base = getDefaultBlockProps()
	return {
		...base,
		view: 'port',
		w: 340,
		h: 220,
		inputs: ports
			.filter((port) => port.id?.startsWith('in'))
			.map((port) => ({ id: '', name: '', type: '', visible: true, ...port } as BlockPort)),
		outputs: ports
			.filter((port) => port.id?.startsWith('out'))
			.map((port) => ({ id: '', name: '', type: '', visible: true, ...port } as BlockPort)),
	}
}

describe('a port has one position per lens', () => {
	// Protocol-shaped names throughout: the communication lens shows SUMMARY
	// ports only, so a plain name like `config` is classified `undefined` and
	// would not be placed there at all — which is the right behaviour and the
	// wrong fixture for testing placement.
	const stored = props([
		{ id: 'in_rail', name: 'camera.stream', commEdge: 'top', commEdgeT: 0.3 },
		{ id: 'in_lane', name: 'config.stream' },
		{ id: 'out_rail', name: 'telemetry.stream', commEdge: 'bottom', commEdgeT: 0.8 },
		{ id: 'out_lane', name: 'result.stream' },
	])

	it('Dataflow puts every port on the left or right lane', () => {
		const layout = layoutBlock(stored, { lens: 'dataflow' })
		expect(layout.ports.length).toBeGreaterThan(0)
		for (const placed of layout.ports) {
			expect(['left', 'right']).toContain(placed.edge)
		}
	})

	it('Dataflow is the default, so no existing caller can grow a rail port', () => {
		for (const placed of layoutBlock(stored).ports) {
			expect(['left', 'right']).toContain(placed.edge)
		}
	})

	it('the communication lens honours the stored edge', () => {
		const layout = layoutBlock(stored, { lens: 'communication' })
		const byId = new Map(layout.ports.map((placed) => [placed.port.id, placed]))
		expect(byId.get('in_rail')?.edge).toBe('top')
		expect(byId.get('out_rail')?.edge).toBe('bottom')
		// A port with no authored placement keeps its side-derived rail.
		expect(byId.get('in_lane')?.edge).toBe('left')
		expect(byId.get('out_lane')?.edge).toBe('right')
	})

	it('a rail port still gets a Dataflow row, which is the best-effort reposition', () => {
		const layout = layoutBlock(stored, { lens: 'dataflow' })
		const railInput = layout.ports.find((placed) => placed.port.id === 'in_rail')
		expect(railInput).toBeDefined()
		expect(railInput?.edge).toBe('left')
		expect(railInput?.x).toBe(0)
		// It occupies a real row rather than stacking on the port beside it.
		const laneInput = layout.ports.find((placed) => placed.port.id === 'in_lane')
		expect(railInput?.y).not.toBe(laneInput?.y)
	})

	it('moving a port in one lens does not move it in the other', () => {
		const before = layoutBlock(stored, { lens: 'dataflow' }).ports
			.map((placed) => `${placed.port.id}:${placed.edge}:${Math.round(placed.y)}`)
		const moved = props([
			{ id: 'in_rail', name: 'camera.stream', commEdge: 'left', commEdgeT: 0.9 },
			{ id: 'in_lane', name: 'config' },
			{ id: 'out_rail', name: 'telemetry.stream', commEdge: 'bottom', commEdgeT: 0.8 },
			{ id: 'out_lane', name: 'result' },
		])
		const after = layoutBlock(moved, { lens: 'dataflow' }).ports
			.map((placed) => `${placed.port.id}:${placed.edge}:${Math.round(placed.y)}`)
		expect(after).toEqual(before)
	})

	it('sorts a crowded rail left to right and keeps the sockets apart', () => {
		const crowded = props([
			{ id: 'out_c', name: 'c.stream', commEdge: 'top', commEdgeT: 0.9 },
			{ id: 'out_a', name: 'a.stream', commEdge: 'top', commEdgeT: 0.1 },
			{ id: 'out_b', name: 'b.stream', commEdge: 'top', commEdgeT: 0.5 },
		])
		const rail = layoutBlock(crowded, { lens: 'communication' }).ports
			.filter((placed) => placed.edge === 'top')
			.sort((a, b) => a.x - b.x)
		expect(rail.map((placed) => placed.port.id)).toEqual(['out_a', 'out_b', 'out_c'])
		for (let index = 1; index < rail.length; index += 1) {
			expect(rail[index].x).toBeGreaterThan(rail[index - 1].x)
		}
	})
})

describe('what each lens shows', () => {
	// "In communication view only ... summary ports should show."
	// "In the dataflow view, all ports should show, period."
	const mixed = props([
		{ id: 'in_summary', name: 'move.goal' },
		{ id: 'in_split', name: 'move.result' },
		{ id: 'in_undefined', name: 'config' },
		{ id: 'out_summary', name: 'health.request' },
		{ id: 'out_split', name: 'health.response' },
		{ id: 'out_undefined', name: 'frame' },
	])

	it('Dataflow shows every port, period', () => {
		const ids = layoutBlock(mixed, { lens: 'dataflow' }).ports.map((placed) => placed.port.id)
		for (const id of ['in_summary', 'in_split', 'in_undefined', 'out_summary', 'out_split', 'out_undefined']) {
			expect(ids).toContain(id)
		}
	})

	it('communication shows the summary ports and nothing else', () => {
		const ids = layoutBlock(mixed, { lens: 'communication' }).ports.map((placed) => placed.port.id)
		expect([...ids].sort()).toEqual(['in_summary', 'out_summary'])
	})

	it('shows a summary port whether or not anything is wired to it', () => {
		// Wiring is not part of the rule: an un-wired interaction stays visible,
		// which is what makes it something you can see and wire FROM.
		const unwired = props([{ id: 'out_summary', name: 'dock.goal' }])
		const ids = layoutBlock(unwired, { lens: 'communication' }).ports.map((placed) => placed.port.id)
		expect(ids).toEqual(['out_summary'])
	})
})
