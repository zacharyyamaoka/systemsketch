import { describe, expect, it } from 'vitest'

import {
	dataflowOrderFromCommunication,
	inferCommunicationPlacements,
	portInteractionKey,
	type InferencePort,
} from './portPlacementInference'
import type { BlockPort } from '../../blocks/blockModel'

function port(id: string, name: string, extra: Partial<BlockPort> = {}): BlockPort {
	return { id, name, type: '', visible: true, ...extra }
}

function lane(
	side: 'input' | 'output',
	names: readonly string[],
): InferencePort[] {
	return names.map((name) => ({ port: port(name, name), side }))
}

describe('an inferred placement keeps an interaction together', () => {
	it('groups the legs of one Action and orders them as the protocol runs', () => {
		// Deliberately interleaved with an unrelated channel, and out of order.
		const ports: InferencePort[] = [
			...lane('output', ['move.result', 'battery.stream', 'move.feedback', 'move.cancel']),
		]
		const placements = inferCommunicationPlacements(ports)
		const order = [...placements.entries()]
			.sort((a, b) => a[1].edgeT - b[1].edgeT)
			.map(([id]) => id)
		const moveIndices = ['move.cancel', 'move.feedback', 'move.result']
			.map((id) => order.indexOf(id))
		// Contiguous...
		expect(Math.max(...moveIndices) - Math.min(...moveIndices)).toBe(2)
		// ...and in protocol order within the group.
		expect(moveIndices).toEqual([...moveIndices].sort((a, b) => a - b))
	})

	it('keeps both legs of a Service on ONE edge, though their sides differ', () => {
		// THE RULE: "all of the ports for the associated communication pattern
		// must be side by side on the same edge." By side alone these two would
		// sit on opposite walls, which is the split this rule exists to forbid.
		const placements = inferCommunicationPlacements([
			...lane('input', ['health.response']),
			...lane('output', ['health.request']),
		])
		expect(placements.get('health.request')?.edge)
			.toBe(placements.get('health.response')?.edge)
	})

	it('keeps all three legs of an Action on one edge, in protocol order', () => {
		const placements = inferCommunicationPlacements([
			...lane('input', ['move.feedback', 'move.result']),
			...lane('output', ['move.goal']),
		])
		const edges = ['move.goal', 'move.feedback', 'move.result']
			.map((id) => placements.get(id)?.edge)
		expect(new Set(edges).size).toBe(1)
		const order = ['move.goal', 'move.feedback', 'move.result']
			.map((id) => placements.get(id)!.edgeT)
		expect(order).toEqual([...order].sort((a, b) => a - b))
	})

	it('follows an edge a leg was already placed on rather than out-voting it', () => {
		// The generator puts a whole interaction on the wall facing its peer; an
		// inferred sibling must not contradict that.
		const placements = inferCommunicationPlacements([
			{ port: port('move.goal', 'move.goal', { commEdge: 'bottom' }), side: 'output', placedEdge: 'bottom' },
			{ port: port('move.result', 'move.result'), side: 'input' },
		])
		expect(placements.get('move.result')?.edge).toBe('bottom')
	})

	it('spreads an edge over only the ports that land on it', () => {
		// The bug this guards: fractions computed over the whole side, including
		// ports authored onto another wall, left visible gaps on the edge.
		const placements = inferCommunicationPlacements([
			{ port: port('a', 'a.stream', { commEdge: 'bottom' }), side: 'output', placedEdge: 'bottom' },
			{ port: port('b', 'b.stream', { commEdge: 'bottom' }), side: 'output', placedEdge: 'bottom' },
			...lane('output', ['c.stream']),
		])
		// The one remaining right-edge port is centred, not squeezed to a third.
		expect(placements.get('c.stream')?.edgeT).toBeCloseTo(0.5, 5)
	})

	it('never lands a socket exactly on a corner', () => {
		const placements = inferCommunicationPlacements(lane('input', ['a', 'b', 'c']))
		for (const placement of placements.values()) {
			expect(placement.edgeT).toBeGreaterThan(0)
			expect(placement.edgeT).toBeLessThan(1)
		}
	})

	it('still orders a component whose port names say nothing', () => {
		// The off-the-shelf case: no interaction names to group by at all.
		const placements = inferCommunicationPlacements(lane('input', ['x', 'y', 'z']))
		expect(placements.size).toBe(3)
		const values = [...placements.values()].map((placement) => placement.edgeT)
		expect(new Set(values).size).toBe(3)
	})

	it('ignores a hidden port rather than reserving a slot for it', () => {
		const placements = inferCommunicationPlacements([
			{ port: port('a', 'a'), side: 'input' },
			{ port: port('b', 'b', { visible: false }), side: 'input' },
		])
		expect(placements.has('b')).toBe(false)
		expect(placements.get('a')?.edgeT).toBeCloseTo(0.5, 5)
	})
})

describe('portInteractionKey', () => {
	it('reads the interaction a leg belongs to', () => {
		expect(portInteractionKey(port('1', 'move.goal'))).toBe('action:move')
		expect(portInteractionKey(port('2', 'move.result'))).toBe('action:move')
		expect(portInteractionKey(port('3', 'health.request'))).toBe('service:health')
	})

	it('separates two interactions that merely share a phase word', () => {
		expect(portInteractionKey(port('1', 'move.goal')))
			.not.toBe(portInteractionKey(port('2', 'dock.goal')))
	})
})

describe('the trip back to Dataflow', () => {
	it('reads the card the way an eye sweeps it: top, sides, bottom', () => {
		const order = dataflowOrderFromCommunication([
			port('bottom', 'b', { commEdge: 'bottom', commEdgeT: 0.5 }),
			port('top', 't', { commEdge: 'top', commEdgeT: 0.5 }),
			port('left', 'l', { commEdge: 'left', commEdgeT: 0.5 }),
		])
		expect(order).toEqual(['top', 'left', 'bottom'])
	})

	it('keeps two legs adjacent on the wall adjacent in the lane', () => {
		const order = dataflowOrderFromCommunication([
			port('other', 'z', { commEdge: 'right', commEdgeT: 0.9 }),
			port('feedback', 'move.feedback', { commEdge: 'right', commEdgeT: 0.4 }),
			port('result', 'move.result', { commEdge: 'right', commEdgeT: 0.5 }),
		])
		expect(Math.abs(order.indexOf('feedback') - order.indexOf('result'))).toBe(1)
	})

	it('is stable for ports carrying no communication placement at all', () => {
		const order = dataflowOrderFromCommunication([port('b', 'b'), port('a', 'a')])
		expect(order).toEqual(['a', 'b'])
	})
})
