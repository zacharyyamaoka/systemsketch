import { describe, expect, it } from 'vitest'

import { clampPillPosition, PILL_POSITION_DEFAULT, PILL_POSITION_MAX, PILL_POSITION_MIN } from './connectionModel'
import {
	ASYNC_CARRIER_PX,
	ASYNC_CADENCE_PX,
	ASYNC_PACKET_DASHARRAY,
	ASYNC_PACKET_GAP_PX,
	ASYNC_PACKET_PX,
	asyncDashOffsetForLength,
	DEFAULT_CABLE_PRESENTATION,
	delayPillLabel,
	delayPillWidth,
	fractionNearest,
	PATH_LENGTH_UNITS,
	pointAtFraction,
	polylineLength,
	readCablePresentation,
	splitDashArrays,
	writeCablePresentation,
} from './connectionPresentation'

const elbow = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 100, y: 50 },
	{ x: 200, y: 50 },
]

describe('pill position', () => {
	it('clamps to the cable, clear of both ports', () => {
		expect(clampPillPosition(0.5)).toBe(0.5)
		expect(clampPillPosition(0)).toBe(PILL_POSITION_MIN)
		expect(clampPillPosition(1)).toBe(PILL_POSITION_MAX)
		expect(clampPillPosition(-3)).toBe(PILL_POSITION_MIN)
		expect(clampPillPosition(Number.NaN)).toBe(PILL_POSITION_DEFAULT)
	})
})

describe('arc length along a polyline', () => {
	it('measures every segment', () => {
		expect(polylineLength(elbow)).toBe(250)
		expect(polylineLength([{ x: 3, y: 4 }])).toBe(0)
	})

	it('finds the point a fraction of the way along', () => {
		expect(pointAtFraction(elbow, 0)).toEqual({ x: 0, y: 0 })
		expect(pointAtFraction(elbow, 0.5)).toEqual({ x: 100, y: 25 })
		expect(pointAtFraction(elbow, 0.6)).toEqual({ x: 100, y: 50 })
		expect(pointAtFraction(elbow, 1)).toEqual({ x: 200, y: 50 })
	})

	it('maps a dragged point back to the nearest fraction', () => {
		// Straight above the vertical segment's middle.
		expect(fractionNearest(elbow, { x: 120, y: 25 })).toBeCloseTo(0.5, 6)
		// Past the end lands on the end.
		expect(fractionNearest(elbow, { x: 400, y: 50 })).toBeCloseTo(1, 6)
		// Before the start lands on the start.
		expect(fractionNearest(elbow, { x: -50, y: -50 })).toBeCloseTo(0, 6)
		// A degenerate cable has no better answer than the middle.
		expect(fractionNearest([{ x: 1, y: 1 }], { x: 9, y: 9 })).toBe(0.5)
	})
})

describe('split dash arrays', () => {
	it('encodes async V1 as equal rests around one small packet mark', () => {
		expect(ASYNC_PACKET_DASHARRAY).toBe('56 4 10 4')
		expect(ASYNC_CARRIER_PX).toBeGreaterThan(ASYNC_PACKET_PX)
		expect(ASYNC_PACKET_GAP_PX).toBeLessThan(ASYNC_PACKET_PX)
		expect(ASYNC_CADENCE_PX).toBe(74)
		expect(ASYNC_CARRIER_PX + ASYNC_PACKET_GAP_PX * 2 + ASYNC_PACKET_PX).toBe(ASYNC_CADENCE_PX)
	})

	it('centres one complete packet mark only when a run is shorter than one cadence', () => {
		expect(asyncDashOffsetForLength(96)).toBe(0)
		expect(asyncDashOffsetForLength(ASYNC_CADENCE_PX)).toBe(0)
		expect(asyncDashOffsetForLength(60)).toBe(35)
		expect(asyncDashOffsetForLength(18)).toBe(56)
	})

	it('dot up to the pill, dash after it, each pattern outlasting the path', () => {
		const { before, after } = splitDashArrays(500, 0.5)
		const b = before.split(' ').map(Number)
		const a = after.split(' ').map(Number)
		// Even counts: SVG doubles an odd pattern, which would shift every gap.
		expect(b.length % 2).toBe(0)
		expect(a.length % 2).toBe(0)
		// The dotted run covers exactly up to the pill, then a full-path gap.
		const dotted = b.slice(0, -2).reduce((sum, value) => sum + value, 0)
		expect(dotted).toBeGreaterThanOrEqual(PATH_LENGTH_UNITS * 0.5)
		expect(b.slice(-2)).toEqual([0, PATH_LENGTH_UNITS])
		// The dashed run starts with a gap to the pill.
		expect(a.slice(0, 2)).toEqual([0, PATH_LENGTH_UNITS * 0.5])
		expect(a.slice(-2)).toEqual([0, PATH_LENGTH_UNITS])
		// 8px dashes on a 500px path are 16 path units.
		expect(a[2]).toBeCloseTo(16, 3)
	})

	it('clamps the split fraction like the pill itself', () => {
		const { after } = splitDashArrays(100, 0)
		expect(after.split(' ').map(Number)[1]).toBeCloseTo(PATH_LENGTH_UNITS * PILL_POSITION_MIN, 3)
	})
})

describe('the z⁻¹ pill', () => {
	it('names the initial value in the port-default grammar', () => {
		expect(delayPillLabel('')).toBe('z⁻¹')
		expect(delayPillLabel('  ')).toBe('z⁻¹')
		expect(delayPillLabel('1.0')).toBe('z⁻¹ = 1.0')
	})

	it('grows with the label, counting glyphs rather than UTF-16 units', () => {
		expect(delayPillWidth('z⁻¹')).toBeLessThan(delayPillWidth('z⁻¹ = 1.0'))
		expect(delayPillWidth('z⁻¹')).toBe(Math.round(16 + 3 * 7.4))
	})
})

describe('cable presentation preference', () => {
	it('round-trips through storage and tolerates garbage', () => {
		const store = new Map<string, string>()
		const storage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
		}
		expect(readCablePresentation(storage)).toEqual(DEFAULT_CABLE_PRESENTATION)
		writeCablePresentation({ dashAfterPill: true }, storage)
		expect(readCablePresentation(storage)).toEqual({ dashAfterPill: true })
		store.set('systemsketch.cable-presentation.v1', '{not json')
		expect(readCablePresentation(storage)).toEqual(DEFAULT_CABLE_PRESENTATION)
		expect(readCablePresentation(null)).toEqual(DEFAULT_CABLE_PRESENTATION)
	})
})
