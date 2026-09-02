import { describe, expect, it } from 'vitest'

import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockPort,
	type BlockShapeProps,
} from '../blockModel'
import {
	NODE_ROW_HEIGHT_PX,
	PORT_LABEL_HEIGHT_PX,
	blockPortSlotCount,
	blockPortViewHeightForSlots,
	layoutBlock,
} from '../layoutBlock'
import {
	PORT_ADD_ZONE_HALF_WIDTH_PX,
	blockPortAddAffordance,
	blockPortDropTarget,
	growBlockPortViewToFit,
} from './portAffordances'

function port(id: string, overrides: Partial<BlockPort> = {}): BlockPort {
	return { id, name: id, type: '', visible: true, ...overrides }
}

function block(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
	const view = overrides.view ?? 'port'
	return {
		...setBlockViewProps(getDefaultBlockProps(), view),
		title: 'refine',
		showDescription: false,
		portLayout: 'inline',
		inputs: [port('in_1'), port('in_2')],
		outputs: [port('out_1')],
		...overrides,
	}
}

function placedPort(props: BlockShapeProps, portId: string) {
	const placed = layoutBlock(props).ports.find((entry) => entry.port.id === portId)
	if (!placed) throw new Error(`no laid-out port ${portId}`)
	return placed
}

function portY(props: BlockShapeProps, portId: string): number {
	return placedPort(props, portId).y
}

function portX(props: BlockShapeProps, portId: string): number {
	return placedPort(props, portId).x
}

describe('growBlockPortViewToFit', () => {
	it('grows a full Port Block so every row keeps the full pitch', () => {
		const props = block({ inputs: [port('in_1'), port('in_2'), port('in_3')] })
		expect(layoutBlock(props).pitch).toBeLessThan(NODE_ROW_HEIGHT_PX)

		const grown = growBlockPortViewToFit(props)
		expect(grown.h).toBeGreaterThan(props.h)
		expect(layoutBlock(grown).pitch).toBe(NODE_ROW_HEIGHT_PX)
		expect(grown.h).toBe(blockPortViewHeightForSlots(props, blockPortSlotCount(props)))
	})

	it('keeps the active view box and the canonical box in lockstep', () => {
		const grown = growBlockPortViewToFit(block({ inputs: [port('in_1'), port('in_2'), port('in_3')] }))
		expect(grown.views.port).toEqual({ w: grown.w, h: grown.h })
	})

	it('never shrinks a box the user already made roomy', () => {
		const roomy = block({ h: 600, views: { ...block().views, port: { w: 340, h: 600 } } })
		expect(growBlockPortViewToFit(roomy)).toBe(roomy)
	})

	it('leaves Simple and Expanded alone — neither sits on the row grid', () => {
		for (const view of ['simple', 'expanded'] as const) {
			const props = block({ view, inputs: [port('in_1'), port('in_2'), port('in_3')] })
			expect(growBlockPortViewToFit(props)).toBe(props)
		}
	})
})

describe('blockPortAddAffordance', () => {
	it('puts each bead on the very edge its own lane of dots stands on', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')!
		const outputs = blockPortAddAffordance(props, 'outputs')!
		// The promise the bead makes: click here and a dot appears *here*. The
		// laid-out dots are the only witness that can hold the two together.
		expect(inputs.x).toBe(portX(props, 'in_1'))
		expect(outputs.x).toBe(portX(props, 'out_1'))
		expect(inputs.x).toBe(0)
		expect(outputs.x).toBe(props.w)
	})

	it('keeps the bead on the edge in Expanded, where the rows are not on a grid', () => {
		const props = block({ view: 'expanded' })
		expect(blockPortAddAffordance(props, 'inputs')!.x).toBe(portX(props, 'in_1'))
		expect(blockPortAddAffordance(props, 'outputs')!.x).toBe(portX(props, 'out_1'))
	})

	it('bands the hover strip across the edge rather than beside it', () => {
		const props = block()
		for (const side of ['inputs', 'outputs'] as const) {
			const affordance = blockPortAddAffordance(props, side)!
			expect(affordance.zone.w).toBe(PORT_ADD_ZONE_HALF_WIDTH_PX * 2)
			expect(affordance.zone.x + affordance.zone.w / 2).toBe(affordance.x)
		}
	})

	it('starts the hover strip below the last row, whose label owns its own clicks', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')
		expect(inputs?.zone.y).toBeGreaterThanOrEqual(
			portY(props, 'in_2') + PORT_LABEL_HEIGHT_PX / 2,
		)
	})

	it('keeps the two lanes on opposite halves so a hover is never ambiguous', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')!
		const outputs = blockPortAddAffordance(props, 'outputs')!
		expect(inputs.zone.x + inputs.zone.w).toBeLessThanOrEqual(outputs.zone.x)
	})

	it('narrows both bands rather than letting them meet on a narrow Block', () => {
		const narrow = block({ w: 24, views: { ...block().views, port: { w: 24, h: 198 } } })
		const inputs = blockPortAddAffordance(narrow, 'inputs')!
		const outputs = blockPortAddAffordance(narrow, 'outputs')!
		expect(inputs.zone.x + inputs.zone.w).toBeLessThanOrEqual(outputs.zone.x)
	})

	it('reports the height the Block would grow to, without growing it', () => {
		const props = block()
		const affordance = blockPortAddAffordance(props, 'inputs')!
		expect(affordance.grownHeight).toBeGreaterThan(props.h)
		expect(props.h).toBe(block().h)
	})

	it('paints the bead inside the body even when the promised row is below it', () => {
		const props = block()
		const layout = layoutBlock(props)
		const affordance = blockPortAddAffordance(props, 'inputs')!
		expect(affordance.y).toBeGreaterThan(affordance.zone.y)
		expect(affordance.y).toBeLessThan(layout.footerTop)
	})

	it('offers an empty lane the first row of the body', () => {
		const props = block({ outputs: [] })
		const affordance = blockPortAddAffordance(props, 'outputs')!
		const layout = layoutBlock(props)
		expect(affordance.zone.y).toBe(layout.bodyTop)
		expect(affordance.y).toBeCloseTo(portY(props, 'in_1'), 5)
	})

	// A Block with nothing on either side has no dot to copy an anchor from, and
	// it is the state every freshly drawn Block starts in — so both views are
	// checked against the row the *first* port actually lands on.
	it('offers a Block with no ports at all the edge and row its first port would take', () => {
		const empty = block({ inputs: [], outputs: [] })
		const first = block({ inputs: [port('in_1')], outputs: [port('out_1')] })
		const inputs = blockPortAddAffordance(empty, 'inputs')!
		const outputs = blockPortAddAffordance(empty, 'outputs')!
		expect(inputs.x).toBe(portX(first, 'in_1'))
		expect(inputs.y).toBeCloseTo(portY(first, 'in_1'), 5)
		expect(outputs.x).toBe(portX(first, 'out_1'))
		expect(outputs.y).toBeCloseTo(portY(first, 'out_1'), 5)
	})

	it('offers an Expanded Block with no ports the edge and row its first port would take', () => {
		const empty = block({ view: 'expanded', inputs: [], outputs: [] })
		const first = block({ view: 'expanded', inputs: [port('in_1')], outputs: [port('out_1')] })
		const inputs = blockPortAddAffordance(empty, 'inputs')!
		const outputs = blockPortAddAffordance(empty, 'outputs')!
		expect(inputs.x).toBe(portX(first, 'in_1'))
		expect(inputs.y).toBeCloseTo(portY(first, 'in_1'), 5)
		expect(outputs.x).toBe(portX(first, 'out_1'))
		expect(outputs.y).toBeCloseTo(portY(first, 'out_1'), 5)
	})

	it('has nothing to offer in Simple view, which paints no rows', () => {
		expect(blockPortAddAffordance(block({ view: 'simple' }), 'inputs')).toBeNull()
	})

	it('withdraws when the rows already reach the footer', () => {
		const short = block({ h: 150, views: { ...block().views, port: { w: 340, h: 150 } } })
		expect(blockPortAddAffordance(short, 'inputs')).toBeNull()
	})
})

describe('blockPortDropTarget', () => {
	const props = block()

	it('drops above the first row when held over the top of the body', () => {
		expect(blockPortDropTarget(props, 'inputs', portY(props, 'in_1') - 12).insertIndex).toBe(0)
	})

	it('drops between two rows when held between them', () => {
		const between = (portY(props, 'in_1') + portY(props, 'in_2')) / 2
		expect(blockPortDropTarget(props, 'inputs', between + 1).insertIndex).toBe(1)
	})

	it('drops at the end when held below the last row', () => {
		const target = blockPortDropTarget(props, 'inputs', portY(props, 'in_2') + 40)
		expect(target.insertIndex).toBe(props.inputs.length)
	})

	it('paints the rule between the two rows it would split', () => {
		const between = (portY(props, 'in_1') + portY(props, 'in_2')) / 2
		expect(blockPortDropTarget(props, 'inputs', between + 1).indicatorY).toBeCloseTo(between, 5)
	})

	it('keeps the rule inside the body however far the pointer travels', () => {
		const layout = layoutBlock(props)
		for (const y of [-500, 5000]) {
			const { indicatorY } = blockPortDropTarget(props, 'inputs', y)
			expect(indicatorY).toBeGreaterThanOrEqual(layout.bodyTop)
			expect(indicatorY).toBeLessThanOrEqual(layout.footerTop)
		}
	})

	it('reads each lane on its own, so an input never lands among outputs', () => {
		expect(blockPortDropTarget(props, 'outputs', portY(props, 'out_1') + 40).insertIndex).toBe(1)
	})

	it('skips hidden ports as targets but keeps their index intact', () => {
		const withHidden = block({
			inputs: [port('in_1'), port('in_2', { visible: false }), port('in_3')],
		})
		const target = blockPortDropTarget(withHidden, 'inputs', portY(withHidden, 'in_3') - 4)
		// in_3 is the second row painted, but the third entry in the lane.
		expect(target.insertIndex).toBe(2)
	})

	it('offers the end of an empty lane', () => {
		expect(blockPortDropTarget(block({ outputs: [] }), 'outputs', 100).insertIndex).toBe(0)
	})
})
