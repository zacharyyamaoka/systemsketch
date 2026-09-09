import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockPort, type BlockShapeProps } from './blockModel'
import { formatPortLane, laneLineOfPort, lanePorts, reconcilePortLane } from './portLane'

function block(inputs: BlockPort[]): BlockShapeProps {
	return { ...getDefaultBlockProps(), view: 'port', inputs, outputs: [] }
}

const pose: BlockPort = { id: 'in_1', name: 'pose', type: 'Pose', visible: true, defaultValue: 'None' }
const frame: BlockPort = { id: 'in_2', name: 'frame', type: 'Frame', visible: true }
const gain: BlockPort = { id: 'in_3', name: 'gain', type: 'float', visible: true, defaultValue: '1.0' }

describe('port lane', () => {
	it('spells the lane one port per line, and finds a port\'s line', () => {
		const props = block([pose, frame, gain])
		expect(formatPortLane(lanePorts(props, 'inputs'))).toBe('pose: Pose = None\nframe: Frame\ngain: float = 1.0')
		expect(laneLineOfPort(props, 'inputs', 'in_3')).toBe(2)
	})

	it('leaves header and hidden ports out of the lane but keeps them on the Block', () => {
		const header: BlockPort = { id: 'in_9', name: 'fn', type: 'Callable', visible: true, row: 0 }
		const hidden: BlockPort = { id: 'in_8', name: 'debug', type: 'bool', visible: false }
		const props = block([header, pose, hidden, frame])
		expect(lanePorts(props, 'inputs').map((port) => port.id)).toEqual(['in_1', 'in_2'])
		const next = reconcilePortLane(props, 'inputs', 'frame: Frame\npose: Pose = None')
		expect(next.inputs.map((port) => port.id)).toEqual(['in_9', 'in_2', 'in_1', 'in_8'])
	})

	it('is a no-op when the text still spells the lane', () => {
		const props = block([pose, frame])
		expect(reconcilePortLane(props, 'inputs', 'pose: Pose = None\nframe: Frame')).toBe(props)
	})

	it('keeps a port\'s id when its line is edited in place', () => {
		const next = reconcilePortLane(block([pose, frame, gain]), 'inputs', 'pose: Pose = None\nframes: list[Frame]\ngain: float = 1.0')
		expect(next.inputs.map((port) => [port.id, port.name, port.type])).toEqual([
			['in_1', 'pose', 'Pose'], ['in_2', 'frames', 'list[Frame]'], ['in_3', 'gain', 'float'],
		])
	})

	it('keeps ids across a moved line, so cables follow the port', () => {
		const next = reconcilePortLane(block([pose, frame, gain]), 'inputs', 'frame: Frame\npose: Pose = None\ngain: float = 1.0')
		expect(next.inputs.map((port) => port.id)).toEqual(['in_2', 'in_1', 'in_3'])
		expect(next.inputs[1]!.defaultValue).toBe('None')
	})

	it('makes a new port from a new line and a copy from a duplicated one', () => {
		const next = reconcilePortLane(block([pose, frame]), 'inputs', 'pose: Pose = None\npose: Pose = None\nframe: Frame\n')
		expect(next.inputs.map((port) => [port.id, port.name])).toEqual([
			['in_1', 'pose'], ['in_3', 'pose'], ['in_2', 'frame'], ['in_4', ''],
		])
		expect(next.inputs[1]!.defaultValue).toBe('None')
	})

	it('never re-parses a line that was not edited, so a legacy name keeps its colon', () => {
		const legacy: BlockPort = { id: 'in_9', name: 'step 1: grab', type: '', visible: true }
		const props = block([legacy, frame])
		const next = reconcilePortLane(props, 'inputs', 'step 1: grab\nframes: Frame')
		expect(next.inputs[0]).toBe(legacy)
		expect(next.inputs[1]).toMatchObject({ id: 'in_2', name: 'frames', type: 'Frame' })
	})

	it('keeps a derived effect output out of the lane and in place through an edit', () => {
		const effect: BlockPort = { id: 'effect:in_1', name: 'buf', type: 'list', visible: true, effect: true }
		const ok: BlockPort = { id: 'out_1', name: 'ok', type: 'bool', visible: true }
		const props: BlockShapeProps = { ...getDefaultBlockProps(), view: 'port', inputs: [{ id: 'in_1', name: 'buf', type: 'list', visible: true, mutates: true } as BlockPort], outputs: [effect, ok] }
		expect(lanePorts(props, 'outputs').map((port) => port.id)).toEqual(['out_1'])
		const next = reconcilePortLane(props, 'outputs', 'ok: boolX')
		expect(next.outputs.map((port) => [port.id, port.type])).toEqual([['out_1', 'boolX'], ['effect:in_1', 'list']])
	})

	it('reads an empty document as an empty lane', () => {
		const next = reconcilePortLane(block([pose, frame]), 'inputs', '')
		expect(next.inputs).toEqual([])
	})

	it('removes the port whose line is gone and clears a deleted default', () => {
		const next = reconcilePortLane(block([pose, frame, gain]), 'inputs', 'pose: Pose\ngain: float = 1.0')
		expect(next.inputs.map((port) => port.id)).toEqual(['in_1', 'in_3'])
		expect('defaultValue' in next.inputs[0]!).toBe(false)
	})
})
