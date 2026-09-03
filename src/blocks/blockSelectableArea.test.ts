/**
 * Geometry-level proof for where an Expanded Block can be grabbed. The real
 * pointer lifecycle is covered by `tests/block_footer_drag_smoke.mjs`.
 */
import { createShapeId, Group2d, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { BlockShapeUtil } from './BlockShapeUtil'
import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShape,
	type BlockShapeProps,
	type BlockView,
} from './blockModel'
import {
	BLOCK_PORT_RADIUS,
	layoutBlock,
	portLabelHitArea,
	PORT_LABEL_HIT_PAD_PX,
} from './layoutBlock'

function mergeProps(view: BlockView = 'expanded'): BlockShapeProps {
	return {
		...setBlockViewProps(getDefaultBlockProps(), view),
		w: 560,
		h: 380,
		title: 'merge()',
		blockType: '',
		inputs: [
			{ id: 'in_1', name: 'pose', type: 'Pose', visible: true },
			{ id: 'in_2', name: 'other', type: 'Pose', visible: true, row: 2 },
		],
		outputs: [{ id: 'out_1', name: '', type: 'Pose', visible: true }],
	}
}

function blockShape(props: BlockShapeProps): BlockShape {
	return {
		id: createShapeId('merge'),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props,
	}
}

function geometryOf(props: BlockShapeProps): Group2d {
	const geometry = new BlockShapeUtil(null as unknown as Editor).getGeometry(blockShape(props))
	expect(geometry).toBeInstanceOf(Group2d)
	return geometry
}

/** tldraw's frame-like label-bounds rule, transcribed for a pure unit test. */
function hitsChrome(geometry: Group2d, point: { x: number; y: number }): boolean {
	return geometry.children.some((child) => child.isLabel && child.isPointInBounds(point))
}

const port = (props: BlockShapeProps, id: string) => {
	const placed = layoutBlock(props).ports.find((candidate) => candidate.port.id === id)
	if (!placed) throw new Error(`No laid-out port ${id}`)
	return placed
}

describe('Expanded Block selectable area', () => {
	it('measures a port label down to the flex-row content it paints', () => {
		const props = mergeProps()
		const layout = layoutBlock(props)
		const input = port(props, 'in_1')
		const output = port(props, 'out_1')

		expect(input.label!.w).toBeCloseTo(layout.width / 2 - 20, 5)
		expect(input.labelContent!.w).toBeLessThan(input.label!.w / 2)
		expect(input.labelContent!.x).toBe(input.label!.x)
		expect(output.labelContent!.x + output.labelContent!.w)
			.toBeCloseTo(output.label!.x + output.label!.w, 5)
		expect(input.labelContent!.y).toBe(input.label!.y)
		expect(input.labelContent!.h).toBe(input.label!.h)
	})

	it('grows the target with a longer name and with a default chip', () => {
		const bare = port(mergeProps(), 'in_1')
		const long = port({
			...mergeProps(),
			inputs: [{
				id: 'in_1',
				name: 'pose_in_world_frame',
				type: 'Pose',
				visible: true,
				defaultValue: 'identity',
			}],
		}, 'in_1')
		expect(long.labelContent!.w).toBeGreaterThan(bare.labelContent!.w)
	})

	it('clamps long content to the positioned label rectangle', () => {
		const placed = port({
			...mergeProps(),
			inputs: [{
				id: 'in_1',
				name: 'a_port_name_far_longer_than_half_of_this_block',
				type: 'SomeVeryLongTypeName',
				visible: true,
			}],
		}, 'in_1')
		expect(placed.labelContent!.w).toBe(placed.label!.w)
	})

	it('joins each text target to its Block edge without swallowing the middle', () => {
		const props = mergeProps()
		const layout = layoutBlock(props)
		const input = port(props, 'in_1')
		const output = port(props, 'out_1')

		const inputHit = portLabelHitArea(input, layout.width)!
		expect(inputHit.x).toBe(0)
		expect(inputHit.w).toBeCloseTo(
			input.labelContent!.x + input.labelContent!.w + PORT_LABEL_HIT_PAD_PX,
			5,
		)

		const outputHit = portLabelHitArea(output, layout.width)!
		expect(outputHit.x + outputHit.w).toBe(layout.width)
		expect(outputHit.x).toBeCloseTo(output.labelContent!.x - PORT_LABEL_HIT_PAD_PX, 5)
		expect(inputHit.w).toBeLessThan(layout.width / 3)
		expect(outputHit.w).toBeLessThan(layout.width / 3)
	})

	it('uses one footer rectangle for paint and pointer geometry', () => {
		const layout = layoutBlock(mergeProps())
		expect(layout.footer).toEqual({
			x: 0,
			y: layout.footerTop,
			w: layout.width,
			h: layout.height - layout.footerTop,
		})
		expect(layoutBlock(mergeProps('simple')).footer).toBeNull()
		expect(layoutBlock(mergeProps('value')).footer).toBeNull()
	})

	it('answers on header, footer, dots and text but leaves the child canvas alone', () => {
		const props = mergeProps()
		const layout = layoutBlock(props)
		const geometry = geometryOf(props)
		const input = port(props, 'in_1')
		const output = port(props, 'out_1')

		for (const [what, point] of Object.entries({
			header: { x: layout.width / 2, y: layout.headerHeight / 2 },
			footer: { x: layout.width / 2, y: layout.footerTop + layout.footer!.h / 2 },
			'input dot': { x: input.x, y: input.y },
			'output dot': { x: output.x, y: output.y },
			'input text': {
				x: input.labelContent!.x + input.labelContent!.w / 2,
				y: input.labelContent!.y + input.labelContent!.h / 2,
			},
			'output text': {
				x: output.labelContent!.x + output.labelContent!.w / 2,
				y: output.labelContent!.y + output.labelContent!.h / 2,
			},
			'edge-to-words gap': { x: 4, y: input.labelContent!.y + input.labelContent!.h / 2 },
		})) {
			expect(hitsChrome(geometry, point), `${what} is grabbable`).toBe(true)
		}

		for (const [what, point] of Object.entries({
			'middle of child canvas': { x: layout.width / 2, y: layout.height / 2 },
			'empty half of label box': {
				x: input.label!.x + input.label!.w - 4,
				y: input.label!.y + input.label!.h / 2,
			},
			'just above footer': { x: layout.width / 2, y: layout.footerTop - 8 },
		})) {
			expect(hitsChrome(geometry, point), `${what} stays drawable`).toBe(false)
		}
	})

	it('keeps the added label geometry out of brush hits and the shape bounds', () => {
		const props = mergeProps()
		const layout = layoutBlock(props)
		const geometry = geometryOf(props)
		for (const point of [
			{ x: layout.width / 2, y: layout.headerHeight / 2 },
			{ x: layout.width / 2, y: layout.footerTop + 8 },
			{ x: 20, y: layout.ports[0].y },
		]) {
			expect(geometry.hitTestPoint(point, 0, false)).toBe(false)
		}
		expect(geometry.bounds.w).toBe(layout.width)
		expect(geometry.bounds.h).toBe(layout.height)
	})

	it('adds no chrome bands to views whose face is already solid', () => {
		for (const view of ['simple', 'port', 'value'] as const) {
			const geometry = geometryOf(mergeProps(view))
			expect(geometry.children[0].isFilled).toBe(true)
			const labels = geometry.children.filter((child) => child.isLabel)
			expect(labels.every((child) => child.bounds.w <= BLOCK_PORT_RADIUS * 2)).toBe(true)
		}
	})
})
