import { describe, expect, it } from 'vitest'

import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockPort,
	type BlockShapeProps,
} from '../blockModel'
import {
	NODE_ROW_HEIGHT_PX,
	blockPortSlotCount,
	blockPortViewHeightForSlots,
	layoutBlock,
} from '../layoutBlock'
import {
	PORT_ADD_ZONE_INSET_PX,
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

function portY(props: BlockShapeProps, portId: string): number {
	const placed = layoutBlock(props).ports.find((entry) => entry.port.id === portId)
	if (!placed) throw new Error(`no laid-out port ${portId}`)
	return placed.y
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
	it('offers one bead per lane, each in its own gutter and clear of the edge', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')!
		const outputs = blockPortAddAffordance(props, 'outputs')!
		// Clear of the 2px selection box tldraw paints on the edge above the
		// shape's HTML, which would otherwise slice the bead's glyph in half.
		expect(inputs.x).toBeGreaterThan(2)
		expect(inputs.x).toBeLessThan(props.w / 2)
		expect(props.w - outputs.x).toBe(inputs.x)
	})

	it('starts the hover strip clear of the last port hit halo', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')
		expect(inputs?.zone.x).toBe(PORT_ADD_ZONE_INSET_PX)
		expect(inputs?.zone.y).toBeGreaterThan(portY(props, 'in_2'))
		expect(inputs?.zone.w).toBe(props.w / 2 - PORT_ADD_ZONE_INSET_PX)
	})

	it('keeps the two lanes on opposite halves so a hover is never ambiguous', () => {
		const props = block()
		const inputs = blockPortAddAffordance(props, 'inputs')!
		const outputs = blockPortAddAffordance(props, 'outputs')!
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
