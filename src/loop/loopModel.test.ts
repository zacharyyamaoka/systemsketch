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

	it('never lets the three header tenants overlap, at any width', () => {
		// The QA sweep found the title running through the turn chip at 300px and
		// the chip crossing the region's right edge with a long turn string. This
		// is that defect as a property rather than a screenshot: labels, title
		// and chip each get a band, and the bands never intersect.
		const turns = ['', 'iteration 3 of 7', 'iteration 128 of 4096 · 31 ms/turn']
		const types = ['Iterable', 'Sequence[Mapping[str, Pose]]']
		for (const w of [LOOP_MIN_WIDTH, 340, 420, 640, 900, 1400]) {
			for (const turn of turns) {
				for (const type of types) {
					const layout = loopLayout({
						...getDefaultLoopProps(),
						w,
						turn,
						iterable: { id: 'iterable', type },
					})
					const labelsEnd = layout.iterable.label.x + layout.labelMax
					const titleStart = layout.title.x - layout.title.w / 2
					const titleEnd = layout.title.x + layout.title.w / 2
					const where = `w=${w} turn=${JSON.stringify(turn)} type=${type}`
					expect(titleStart, `title starts after the labels · ${where}`)
						.toBeGreaterThanOrEqual(labelsEnd)
					if (layout.turn) {
						expect(titleEnd, `title ends before the chip · ${where}`)
							.toBeLessThanOrEqual(layout.turn.x)
						expect(layout.turn.x + layout.turn.w, `chip stays inside · ${where}`)
							.toBeLessThanOrEqual(w)
					}
					expect(layout.title.w, `title keeps a readable band · ${where}`)
						.toBeGreaterThanOrEqual(0)
				}
			}
		}
	})

	it('centres the operator title once expansion gives its complete text a safe lane', () => {
		const props = {
			...getDefaultLoopProps(),
			title: 'For each pose',
			iterable: { id: 'iterable', type: 'Poses' },
			item: { id: 'item', type: 'Pose' },
		}
		const compact = loopLayout({ ...props, w: LOOP_MIN_WIDTH })
		// This width keeps the full title out of the labels' protected lane.
		expect(compact.title.x).not.toBe(LOOP_MIN_WIDTH / 2)

		const expanded = loopLayout({ ...props, w: 520, turn: 'iteration 3 of 7' })
		expect(expanded.title.x).toBe(260)
		// The threshold is the whole title, not a conveniently ellipsized part.
		expect(expanded.title.w).toBeGreaterThanOrEqual('For each pose'.length * 10.8)
	})

	it('drops the turn chip rather than squeezing the title out', () => {
		const props = { ...getDefaultLoopProps(), w: LOOP_MIN_WIDTH, turn: 'iteration 3 of 7' }
		// At the floor width there is no room for both, and the chip is the one
		// that yields: it reports a live state, the title identifies the region.
		const layout = loopLayout(props)
		expect(layout.turn === null || layout.title.w >= 60).toBe(true)
	})

	it('keeps the two type labels on separate rows', () => {
		const layout = loopLayout(getDefaultLoopProps())
		expect(layout.item.label.y - layout.iterable.label.y).toBeGreaterThanOrEqual(18)
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
