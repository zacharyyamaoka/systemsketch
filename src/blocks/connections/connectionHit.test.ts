import { describe, expect, it } from 'vitest'
import {
	HIT_PROFILES,
	MAX_HIT_TARGET_PAGE,
	PORT_OUTER_DIAMETER,
	PORT_OUTER_RADIUS,
	cableHitPadPageUnits,
	cableHitTargetPageUnits,
	controlPointProximityPageUnits,
	getHitProfileId,
	portSnapPageUnits,
	reconnectPageUnits,
	setHitProfileId,
	targetPageUnits,
} from './connectionHit'

describe('connection hit profile', () => {
	it('derives the port dot from the CSS that draws it', () => {
		// 12px dot with a 3px outer ring spread — a box-shadow spread measures from
		// the border box and does NOT stack on the shadow before it, so this is
		// 6 + 3, not 6 + 2 + 3.
		expect(PORT_OUTER_RADIUS).toBe(9)
		expect(PORT_OUTER_DIAMETER).toBe(18)
	})

	it('scales a screen-px target with zoom and leaves a page-unit one alone', () => {
		expect(targetPageUnits({ screenPx: 3 }, 1)).toBe(3)
		expect(targetPageUnits({ screenPx: 3 }, 3)).toBe(1)
		expect(targetPageUnits({ pageUnits: 10 }, 3)).toBe(10)
	})

	it('caps a screen-px target so zooming out cannot swallow the board', () => {
		expect(targetPageUnits({ screenPx: 3 }, 0.01)).toBe(MAX_HIT_TARGET_PAGE)
	})

	it('is bit-for-bit stock on the kit profile', () => {
		setHitProfileId('kit')
		expect(getHitProfileId()).toBe('kit')
		// The target IS tldraw's own margin, so nothing is hidden from the engine.
		expect(cableHitPadPageUnits(1, 3)).toBe(0)
		expect(reconnectPageUnits(1)).toBe(0)
	})

	it('widens the corridor to the port dot on the SystemSketch profile', () => {
		setHitProfileId('systemsketch')
		expect(cableHitTargetPageUnits(1)).toBe(PORT_OUTER_RADIUS)
		expect(portSnapPageUnits(1)).toBe(PORT_OUTER_DIAMETER)
		expect(reconnectPageUnits(1)).toBe(10)
		// The pad is exactly what has to be hidden from tldraw for the boundary to
		// land on the target rather than target + engine margin.
		expect(cableHitPadPageUnits(1, 3)).toBe(PORT_OUTER_RADIUS - 3)
	})

	it('falls back to the SystemSketch profile for an unknown id', () => {
		expect(setHitProfileId('nonsense')).toBe('systemsketch')
		expect(setHitProfileId(undefined)).toBe('systemsketch')
	})

	it('offers control points before the pointer is exactly on the stroke', () => {
		setHitProfileId('systemsketch')
		expect(controlPointProximityPageUnits(1)).toBeGreaterThan(cableHitTargetPageUnits(1))
	})

	it('every profile cites where its numbers come from', () => {
		for (const profile of Object.values(HIT_PROFILES)) {
			expect(profile.source.length).toBeGreaterThan(20)
		}
	})
})
