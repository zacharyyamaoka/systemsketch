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

	it('puts an interaction on the edge its side faces', () => {
		const placements = inferCommunicationPlacements([
			...lane('input', ['health.request']),
			...lane('output', ['health.response']),
		])
		expect(placements.get('health.request')?.edge).toBe('left')
		expect(placements.get('health.response')?.edge).toBe('right')
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
