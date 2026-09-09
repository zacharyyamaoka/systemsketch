import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockShapeProps } from './blockModel'
import { blockInlineFieldAtPointOrNull, portLaneAtPoint, portLanePlacement } from './inlineBlockEditing'
import { layoutBlock } from './layoutBlock'

function props(): BlockShapeProps {
	return {
		...getDefaultBlockProps(),
		view: 'port',
		w: 420,
		h: 260,
		inputs: [
			{ id: 'in_1', name: 'pose', type: 'Pose', visible: true },
			{ id: 'in_2', name: 'frame', type: 'Frame', visible: true },
			{ id: 'in_3', name: 'gain', type: 'float', visible: true },
		],
		outputs: [
			{ id: 'out_1', name: 'pose', type: 'Pose', visible: true },
			{ id: 'out_2', name: 'quality', type: 'float', visible: true },
		],
	}
}

describe('port lanes', () => {
	it('opens the inputs lane on the clicked port\'s line from the left half, outputs from the right', () => {
		const layout = layoutBlock(props())
		const frame = layout.ports.find((entry) => entry.port.id === 'in_2')!
		expect(portLaneAtPoint(props(), { x: layout.bounds.w * 0.35, y: frame.y })).toEqual({ kind: 'portLane', side: 'inputs', line: 1 })
		const quality = layout.ports.find((entry) => entry.port.id === 'out_2')!
		expect(portLaneAtPoint(props(), { x: layout.bounds.w * 0.62, y: quality.y })).toEqual({ kind: 'portLane', side: 'outputs', line: 1 })
		expect(blockInlineFieldAtPointOrNull(props(), { x: layout.bounds.w * 0.35, y: frame.y }, { portLanes: true }))
			.toEqual({ kind: 'portLane', side: 'inputs', line: 1 })
		// Without the flag the same point is still the one-port editor.
		expect(blockInlineFieldAtPointOrNull(props(), { x: layout.bounds.w * 0.35, y: frame.y }))
			.toMatchObject({ portId: 'in_2' })
	})

	it('places the lane over its rows with one line per port', () => {
		const layout = layoutBlock(props())
		const placement = portLanePlacement(props(), 'inputs')!
		const [first, second] = layout.ports.filter((entry) => entry.side === 'input')
		expect(placement.linePitch).toBe(second!.y - first!.y)
		expect(placement.box.h).toBe(placement.linePitch! * 3)
		expect(placement.box.y).toBe(first!.y - placement.linePitch! / 2)
		expect(placement.align).toBe('left')
		expect(portLanePlacement(props(), 'outputs')!.align).toBe('right')
	})
})
