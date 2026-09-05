import { describe, expect, it } from 'vitest'
import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShapeProps,
	type BlockView,
} from './blockModel'
import {
	BLOCK_EXPANDED_HEADER_HEIGHT,
	BLOCK_HEADER_HEIGHT_PX,
	HEADER_PORT_PITCH_PX,
	NODE_FOOTER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
	blockPortSlotCount,
	layoutBlock,
} from './layoutBlock'

function makeBlock(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
	const view = overrides.view ?? 'port'
	const selected = setBlockViewProps(getDefaultBlockProps(), view)
	return {
		...selected,
		title: 'build_report',
		blockType: 'call',
		description: 'what it does',
		showDescription: false,
		portLayout: 'inline',
		inputs: [
			{ id: 'in_1', name: 'rows', type: '', visible: true },
			{ id: 'in_2', name: 'window', type: 'int', visible: true },
		],
		outputs: [{ id: 'out_1', name: 'report', type: '', visible: true }],
		...overrides,
	}
}

function withBox(props: BlockShapeProps, w: number, h: number): BlockShapeProps {
	return { ...props, w, h }
}

describe('layoutBlock donor geometry', () => {
	it('uses canonical active w/h verbatim instead of silently growing to content', () => {
		const props = withBox(makeBlock({ view: 'simple' }), 417, 263)
		const layout = layoutBlock(props)
		expect(layout.bounds).toEqual({ x: 0, y: 0, w: 417, h: 263 })
		expect(layout.body).toEqual(layout.bounds)
	})

	it('puts every visible dot exactly on the outside edge in every view and lane mode', () => {
		for (const view of ['simple', 'port', 'expanded'] as const) {
			for (const portLayout of ['offset', 'inline'] as const) {
				const layout = layoutBlock(makeBlock({ view, portLayout }))
				for (const placed of layout.ports) {
					expect(placed.x).toBe(placed.side === 'input' ? 0 : layout.width)
				}
			}
		}
	})

	it('inline shares slots while offset stacks all outputs below the inputs', () => {
		const inline = makeBlock({ portLayout: 'inline' })
		const inlineLayout = layoutBlock(inline)
		expect(inlineLayout.ports.find((entry) => entry.port.id === 'out_1')?.y)
			.toBe(inlineLayout.ports.find((entry) => entry.port.id === 'in_1')?.y)
		expect(blockPortSlotCount(inline)).toBe(2)

		const offset = makeBlock({ portLayout: 'offset' })
		const offsetLayout = layoutBlock(offset)
		const outputY = offsetLayout.ports.find((entry) => entry.port.id === 'out_1')!.y
		const inputYs = offsetLayout.ports
			.filter((entry) => entry.side === 'input')
			.map((entry) => entry.y)
		expect(blockPortSlotCount(offset)).toBe(3)
		for (const y of inputYs) expect(outputY).toBeGreaterThan(y)
		expect(inputYs).not.toContain(outputY)
	})

	it('uses the donor 48px heading, 8px gap, 44px rows and 46px footer', () => {
		const layout = layoutBlock(makeBlock())
		const bodyTop = BLOCK_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX
		expect(layout.headerHeight).toBe(48)
		expect(layout.bodyTop).toBe(56)
		expect(layout.pitch).toBe(NODE_ROW_HEIGHT_PX)
		expect(layout.ports.find((entry) => entry.port.id === 'in_1')?.y)
			.toBe(bodyTop + NODE_ROW_HEIGHT_PX / 2)
		expect(layout.ports.find((entry) => entry.port.id === 'in_2')?.y)
			.toBe(bodyTop + NODE_ROW_HEIGHT_PX * 1.5)
		expect(layout.footerTop).toBe(198 - NODE_FOOTER_HEIGHT_PX)
	})

	it('compresses pitch rather than changing a too-short authored box', () => {
		const layout = layoutBlock(withBox(makeBlock({ portLayout: 'offset' }), 260, 150))
		expect(layout.height).toBe(150)
		expect(layout.pitch).toBeLessThan(NODE_ROW_HEIGHT_PX)
		for (const placed of layout.ports) {
			expect(placed.y).toBeGreaterThan(layout.bodyTop)
			expect(placed.y).toBeLessThan(layout.footerTop)
		}
	})

	it('reserves a readable description strip above the footer without resizing', () => {
		const props = makeBlock({ showDescription: true })
		const layout = layoutBlock(props)
		expect(layout.description).not.toBeNull()
		expect(layout.description?.h).toBe(16)
		expect(layout.description!.y).toBeGreaterThan(
			layout.ports.find((entry) => entry.port.id === 'in_2')!.y,
		)
		expect(layout.description!.y + layout.description!.h).toBeLessThanOrEqual(
			layout.footerTop - 4,
		)
		expect(layout.height).toBe(props.h)
		expect(layout.pitch).toBeLessThan(NODE_ROW_HEIGHT_PX)
	})

	it('simple collapses all identities onto one subtle edge-midpoint affordance per side', () => {
		const props = makeBlock({
			view: 'simple',
			showDescription: true,
			inputs: [
				{ id: 'in_1', name: 'a', type: '', visible: true },
				{ id: 'in_2', name: 'b', type: '', visible: true },
			],
		})
		const layout = layoutBlock(props)
		expect(layout.ports).toHaveLength(3)
		expect(layout.ports.map(({ side, x, y, label, subtle }) => ({
			side,
			x,
			y,
			label,
			subtle,
		}))).toEqual([
			{ side: 'input', x: 0, y: 103, label: null, subtle: true },
			{ side: 'input', x: 0, y: 103, label: null, subtle: true },
			{ side: 'output', x: 320, y: 103, label: null, subtle: true },
		])
	})

	it('discloses hidden ports by side without giving them a painted port slot', () => {
		const props = makeBlock({
			inputs: [
				{ id: 'in_1', name: 'shown', type: '', visible: true },
				{ id: 'in_2', name: 'secret', type: '', visible: false },
				{ id: 'in_3', name: 'also_secret', type: '', visible: false },
			],
			outputs: [
				{ id: 'out_1', name: 'shown_result', type: '', visible: true },
				{ id: 'out_2', name: 'secret_result', type: '', visible: false },
			],
		})
		const layout = layoutBlock(props)

		expect(layout.ports.map((entry) => entry.port.id)).toEqual(['in_1', 'out_1'])
		expect(layout.hiddenPortSummaries.map(({ side, count }) => ({ side, count }))).toEqual([
			{ side: 'input', count: 2 },
			{ side: 'output', count: 1 },
		])
		for (const summary of layout.hiddenPortSummaries) {
			expect(summary.box.y).toBeGreaterThanOrEqual(layout.bodyTop)
			expect(summary.box.y + summary.box.h).toBeLessThanOrEqual(layout.height)
		}
	})

	it('does not put a hidden-count disclosure on Simple, whose dots are intentionally anonymous', () => {
		const layout = layoutBlock(makeBlock({
			view: 'simple',
			inputs: [{ id: 'in_1', name: 'hidden', type: '', visible: false }],
		}))
		expect(layout.hiddenPortSummaries).toEqual([])
	})

	it('simple text and icon reposition the face without moving midpoint anchors', () => {
		const bare = layoutBlock(makeBlock({
			view: 'simple',
			blockType: '',
			showDescription: false,
		}))
		const full = layoutBlock(makeBlock({
			view: 'simple',
			icon: 'Database',
			title: 'a much longer block title than before',
			showDescription: true,
		}))
		expect(full.ports[0].y).toBe(bare.ports[0].y)
		expect(full.ports.at(-1)?.x).toBe(bare.ports.at(-1)?.x)
		expect(full.icon).not.toBeNull()
		expect(full.icon!.y + full.icon!.h / 2)
			.toBeCloseTo(full.title!.y + full.title!.h / 2, 5)
	})

	it('simple centres title/description above a bottom type band', () => {
		const titleOnly = layoutBlock(makeBlock({
			view: 'simple',
			title: 'run',
			blockType: '',
			showDescription: false,
		}))
		expect(titleOnly.title!.y + titleOnly.title!.h / 2)
			.toBeCloseTo(titleOnly.footerTop / 2, 5)
		expect(titleOnly.typeLabel).toBeNull()

		const complete = layoutBlock(makeBlock({ view: 'simple', title: 'run', showDescription: true }))
		expect(complete.title!.y).toBeLessThan(titleOnly.title!.y)
		expect(complete.description!.y)
			.toBeGreaterThan(complete.title!.y + complete.title!.h)
		expect(complete.typeLabel!.y).toBeGreaterThanOrEqual(complete.footerTop)
		expect(complete.typeLabel!.y + complete.typeLabel!.h).toBeLessThanOrEqual(complete.height)
	})

	it('group dividers own a full-width slot and keep corresponding lanes aligned', () => {
		const props = withBox(makeBlock({
			inputs: [
				{ id: 'in_1', name: 'a', type: '', visible: true },
				{ id: 'in_2', name: 'b', type: '', visible: true, row: 2 },
			],
			outputs: [
				{ id: 'out_1', name: 'r', type: '', visible: true },
				{ id: 'out_2', name: 's', type: '', visible: true, row: 2 },
			],
		}), 340, 48 + 8 + 3 * 44 + 8 + 46)
		expect(blockPortSlotCount(props)).toBe(3)
		const layout = layoutBlock(props)
		expect(layout.pitch).toBe(44)
		expect(layout.dividers).toHaveLength(1)
		expect(layout.dividers[0]).toMatchObject({ kind: 'group', x: 0, w: 340 })
		const in1 = layout.ports.find((entry) => entry.port.id === 'in_1')!
		const in2 = layout.ports.find((entry) => entry.port.id === 'in_2')!
		const out2 = layout.ports.find((entry) => entry.port.id === 'out_2')!
		expect(in2.y - in1.y).toBe(2 * layout.pitch)
		expect(layout.dividers[0].y).toBe((in1.y + in2.y) / 2)
		expect(out2.y).toBe(in2.y)
	})

	it('branch dividers occupy a right-half slot while the input lane continues', () => {
		const props = withBox(makeBlock({
			outputs: [
				{ id: 'out_1', name: 'ok', type: '', visible: true },
				{ id: 'out_2', name: 'err', type: '', visible: true, branch: 1 },
			],
		}), 340, 48 + 8 + 3 * 44 + 8 + 46)
		expect(blockPortSlotCount(props)).toBe(3)
		const layout = layoutBlock(props)
		expect(layout.dividers[0]).toMatchObject({ kind: 'branch', x: 170, w: 170 })
		expect(layout.dividers[0].y)
			.toBe(layout.ports.find((entry) => entry.port.id === 'in_2')!.y)
		expect(
			layout.ports.find((entry) => entry.port.id === 'out_2')!.y
			- layout.ports.find((entry) => entry.port.id === 'out_1')!.y,
		).toBe(2 * layout.pitch)
	})

	it('header inputs ride and grow the 48px heading without costing body slots', () => {
		const headerPorts = ['cond', 'iter', 'state'].map((name, index) => ({
			id: `h_${index}`,
			name,
			type: '',
			visible: true,
			row: 0,
		}))
		const props = makeBlock({
			inputs: [...headerPorts, { id: 'in_1', name: 'rows', type: '', visible: true }],
		})
		const layout = layoutBlock(props)
		expect(layout.height).toBe(198)
		expect(layout.headerHeight).toBeGreaterThan(BLOCK_HEADER_HEIGHT_PX)
		const headings = headerPorts.map((port) => (
			layout.ports.find((entry) => entry.port.id === port.id)!
		))
		expect(headings[1].y - headings[0].y).toBe(HEADER_PORT_PITCH_PX)
		expect((headings[0].y + headings[2].y) / 2).toBe(layout.headerHeight / 2)
		expect(blockPortSlotCount(props)).toBe(1)
		for (const heading of headings) expect(heading.label).toBeNull()
	})

	it('tiles the Port body into row bands meeting on the dividers, arms meeting on the half-lines', () => {
		const props = withBox(makeBlock({
			inputs: [
				{ id: 'in_1', name: 'a', type: '', visible: true },
				{ id: 'in_2', name: 'b', type: '', visible: true, row: 2 },
			],
			outputs: [
				{ id: 'out_1', name: 'r', type: '', visible: true },
				{ id: 'out_2', name: 's', type: '', visible: true, branch: 1 },
				{ id: 'out_3', name: 't', type: '', visible: true, row: 2 },
			],
		}), 340, 48 + 8 + 5 * 44 + 8 + 46)
		const layout = layoutBlock(props)
		expect(layout.headerBand).toEqual({ top: 0, bottom: layout.headerHeight })
		expect(layout.sections.map((section) => section.row)).toEqual([1, 2])
		const [first, second] = layout.sections
		const groupDivider = layout.dividers.find((divider) => divider.kind === 'group')!
		const branchDivider = layout.dividers.find((divider) => divider.kind === 'branch')!
		expect(first.band.top).toBe(layout.bodyTop)
		expect(first.band.bottom).toBe(groupDivider.y)
		expect(second.band.top).toBe(groupDivider.y)
		expect(second.band.bottom).toBe(layout.bodyTop + layout.pitch * blockPortSlotCount(props))
		expect(first.branches.map((arm) => arm.branch)).toEqual([0, 1])
		expect(first.branches[0].band).toEqual({ top: first.band.top, bottom: branchDivider.y })
		expect(first.branches[1].band).toEqual({ top: branchDivider.y, bottom: first.band.bottom })
		expect(second.branches).toEqual([{ branch: 0, band: second.band }])
	})

	it('tiles the Expanded body the same way, from the weighted sections', () => {
		const layout = layoutBlock(makeBlock({
			view: 'expanded',
			inputs: [{ id: 'in_1', name: 'a', type: '', visible: true }],
			outputs: [
				{ id: 'out_1', name: 'r', type: '', visible: true },
				{ id: 'out_2', name: 's', type: '', visible: true, row: 2 },
			],
		}))
		const region = layout.footerTop - layout.bodyTop
		expect(layout.sections).toHaveLength(2)
		expect(layout.sections[0].band.top).toBe(layout.bodyTop)
		expect(layout.sections[0].band.bottom).toBeCloseTo(layout.sections[1].band.top)
		expect(layout.sections[1].band.bottom).toBeCloseTo(layout.bodyTop + region)
		expect(layout.sections[0].band.bottom).toBe(layout.dividers[0].y)
	})

	it('projects Expanded into the same real child frame below its donor heading', () => {
		const layout = layoutBlock(makeBlock({ view: 'expanded' }))
		expect(layout.header?.h).toBe(BLOCK_EXPANDED_HEADER_HEIGHT)
		expect(layout.frameInterior).toEqual({ x: 1, y: 48, w: 558, h: 331 })
	})

	it('Expanded spreads each lane independently within the open frame', () => {
		const layout = layoutBlock(makeBlock({ view: 'expanded' }))
		const region = layout.footerTop - layout.bodyTop
		const in1 = layout.ports.find((entry) => entry.port.id === 'in_1')!
		const in2 = layout.ports.find((entry) => entry.port.id === 'in_2')!
		const output = layout.ports.find((entry) => entry.port.id === 'out_1')!
		expect(in1.y).toBeCloseTo(layout.bodyTop + region / 3)
		expect(in2.y).toBeCloseTo(layout.bodyTop + (2 * region) / 3)
		expect(output.y).toBeCloseTo(layout.bodyTop + region / 2)
		expect(output.y).not.toBeCloseTo(in1.y)
		for (const port of layout.ports) {
			expect(port.lifted).toBe(true)
			expect(port.label!.y + port.label!.h / 2).toBeLessThan(port.y)
		}
	})

	const conditional = (overrides: Partial<BlockShapeProps> = {}) => makeBlock({
		view: 'expanded',
		outputs: [
			{ id: 'out_1', name: 'a', type: '', visible: true },
			{ id: 'out_2', name: 'b', type: '', visible: true },
			{ id: 'out_3', name: 'c', type: '', visible: true, branch: 1 },
			{ id: 'out_4', name: 'd', type: '', visible: true, branch: 1 },
			{ id: 'out_5', name: 'e', type: '', visible: true, branch: 2 },
		],
		...overrides,
	})

	it('Expanded default spacing treats branch dividers exactly like port slots', () => {
		const layout = layoutBlock(conditional())
		const region = layout.footerTop - layout.bodyTop
		const at = (eighths: number) => layout.bodyTop + (region * eighths) / 8
		expect(['out_1', 'out_2', 'out_3', 'out_4', 'out_5'].map((id) => (
			layout.ports.find((entry) => entry.port.id === id)!.y
		))).toEqual([at(1), at(2), at(4), at(5), at(7)])
		const branchDividers = layout.dividers.filter((divider) => divider.kind === 'branch')
		expect(branchDividers.map((divider) => divider.y)).toEqual([at(3), at(6)])
		for (const divider of branchDividers) {
			expect(divider.x).toBe(layout.width / 2)
			expect(divider.w).toBe(layout.width / 2)
		}
	})

	it('Expanded weights reshape sections and expose exact adjacent drag metadata', () => {
		const layout = layoutBlock(conditional({ expandedWeights: { 'b:out_5': 6 } }))
		const region = layout.footerTop - layout.bodyTop
		const at = (twelfths: number) => layout.bodyTop + (region * twelfths) / 12
		const branchDividers = layout.dividers.filter((divider) => divider.kind === 'branch')
		expect(branchDividers.map((divider) => divider.y)).toEqual([at(3), at(6)])
		expect(layout.ports.find((entry) => entry.port.id === 'out_5')!.y).toBeCloseTo(at(9))
		expect(branchDividers[0].adjust).toMatchObject({
			prevKey: 'b:out_1',
			nextKey: 'b:out_3',
			prevMin: 72,
			nextMin: 72,
		})
		expect(branchDividers[1].adjust).toMatchObject({
			prevKey: 'b:out_3',
			nextKey: 'b:out_5',
			prevMin: 72,
			nextMin: 48,
		})
	})

	it('is deterministic and never mutates semantic props', () => {
		const props = conditional()
		const before = structuredClone(props)
		expect(layoutBlock(props)).toEqual(layoutBlock(props))
		expect(props).toEqual(before)
	})
})
