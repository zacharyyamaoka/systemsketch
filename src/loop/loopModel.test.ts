/**
 * The Loop region's geometry and port projection.
 *
 * These are the facts "B solid drop" rests on: the collection lands on the
 * header as an INPUT, the element leaves the header as an OUTPUT, and the two
 * are the only ports the region has. An output port is what makes the item
 * cable an ordinary solid connection rather than a new kind of edge.
 */
import { describe, expect, it } from 'vitest'

import { getLoopConnectionPorts } from '../blocks/connections/blockPorts'
import {
	LOOP_HEADER_HEIGHT,
	LOOP_ITEM_PORT_INSET,
	LOOP_MIN_HEIGHT,
	LOOP_MIN_WIDTH,
	LOOP_SHAPE_TYPE,
	getDefaultLoopProps,
	isLoopShape,
	loopLayout,
	reconcileLoopProps,
} from './loopModel'

const shape = (props = getDefaultLoopProps()) => ({
	id: 'shape:loop' as const,
	type: LOOP_SHAPE_TYPE,
	props,
}) as never

describe('loop layout', () => {
	it('lands the collection ON the wall and emits the element from the header edge', () => {
		const layout = loopLayout(getDefaultLoopProps())
		expect(layout.iterable.x).toBe(0)
		expect(layout.iterable.side).toBe('input')
		expect(layout.item.y).toBe(LOOP_HEADER_HEIGHT)
		expect(layout.item.x).toBe(LOOP_ITEM_PORT_INSET)
		expect(layout.item.side).toBe('output')
		// ON the header's bottom edge, inside the wall — not on the wall itself.
		expect(layout.item.x).toBeGreaterThan(0)
		// And its cable leaves PERPENDICULAR to that edge: straight down.
		expect(layout.item.elbowSide).toBe('bottom')
		expect(layout.item.facesInward).toBe(true)
		// The label clears the dot's row, so the drop does not strike it through.
		expect(layout.item.label.y).toBeLessThan(layout.item.y - 8)
	})

	it('centres the title, and keeps it clear of the iterable label', () => {
		const props = getDefaultLoopProps()
		const wide = loopLayout({ ...props, w: 900 })
		expect(wide.title.x).toBe(450)
		const narrow = loopLayout({ ...props, w: LOOP_MIN_WIDTH })
		expect(narrow.title.x).toBeGreaterThan(narrow.iterable.label.x)
	})

	it('shows the turn chip only when it has something to say', () => {
		const props = getDefaultLoopProps()
		expect(loopLayout(props).turn).toBeNull()
		expect(loopLayout({ ...props, turn: '   ' }).turn).toBeNull()
		const live = loopLayout({ ...props, turn: 'iteration 3 of 7' })
		expect(live.turn).not.toBeNull()
		expect(live.turn!.x + live.turn!.w).toBeLessThanOrEqual(props.w)
	})

	it('drops the footer rather than overlapping the header when very short', () => {
		const props = getDefaultLoopProps()
		expect(loopLayout({ ...props, h: 400 }).footer).not.toBeNull()
		expect(loopLayout({ ...props, h: 60 }).footer).toBeNull()
		expect(loopLayout({ ...props, h: 60 }).body.h).toBeGreaterThanOrEqual(0)
	})

	it('keeps a resized record on its floor', () => {
		const props = getDefaultLoopProps()
		const small = reconcileLoopProps({ ...props, w: 10, h: 10 })
		expect(small.w).toBe(LOOP_MIN_WIDTH)
		expect(small.h).toBe(LOOP_MIN_HEIGHT)
		const roomy = { ...props, w: 640, h: 400 }
		expect(reconcileLoopProps(roomy)).toBe(roomy)
	})
})

describe('loop ports, as the connection layer sees them', () => {
	it('projects exactly two ports, one of each polarity', () => {
		const ports = getLoopConnectionPorts(shape())
		expect(ports.map((port) => port.id)).toEqual(['iterable', 'item'])
		expect(ports.map((port) => port.side)).toEqual(['input', 'output'])
		expect(ports.every((port) => !port.hidden)).toBe(true)
	})

	it('anchors every port inside the region, so a cable lands where it is painted', () => {
		const props = { ...getDefaultLoopProps(), w: 640, h: 400 }
		const layout = loopLayout(props)
		for (const port of getLoopConnectionPorts(shape(props))) {
			expect(port.anchor.x).toBeGreaterThanOrEqual(0)
			expect(port.anchor.x).toBeLessThanOrEqual(1)
			expect(port.anchor.y).toBeGreaterThanOrEqual(0)
			expect(port.anchor.y).toBeLessThanOrEqual(1)
			expect(port.x).toBeCloseTo(port.anchor.x * layout.w, 6)
			expect(port.y).toBeCloseTo(port.anchor.y * layout.h, 6)
		}
	})

	it('labels a header port with its TYPE, because it has no name', () => {
		// You do not name these ports: the collection's name lives on whatever
		// produces it, and the element has no name until a Block's port gives it
		// one. What the header can say is what kind of thing crosses it.
		const ports = getLoopConnectionPorts(shape())
		expect(ports.map((port) => port.type)).toEqual(['Iterable', 'Iter'])
		expect(ports.map((port) => port.name)).toEqual(ports.map((port) => port.type))
	})

	it('hands the router a perpendicular exit for the item outlet only', () => {
		const [iterable, item] = getLoopConnectionPorts(shape())
		expect(item.elbowSide).toBe('bottom')
		expect(item.facesInward).toBe(true)
		// The inlet is met from outside like any other input, so it keeps the
		// model's default and contributes its box as an obstacle.
		expect(iterable.elbowSide).toBe('left')
		expect(iterable.facesInward).toBe(false)
	})

	it('recognises only a loop record', () => {
		expect(isLoopShape(shape())).toBe(true)
		expect(isLoopShape({ type: 'block' } as never)).toBe(false)
		expect(isLoopShape(null)).toBe(false)
	})
})
