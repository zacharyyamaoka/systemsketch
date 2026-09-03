import { describe, expect, it } from 'vitest'

import {
	TUNNEL_MIN_PATH_LENGTH,
	TUNNEL_STUB_LENGTH,
	tunnelPathPresentation,
	tunnelRouteIsRevealed,
	tunnelVisualForPoints,
} from './tunnelEdge'

describe('tunnel reveal contract', () => {
	it('keeps ordinary cables visible and hides an idle tunnel route', () => {
		expect(tunnelRouteIsRevealed({
			enabled: false,
			layerFocused: false,
			edgeFocused: false,
			endpointFocused: false,
			reattaching: false,
		})).toBe(true)
		expect(tunnelRouteIsRevealed({
			enabled: true,
			layerFocused: false,
			edgeFocused: false,
			endpointFocused: false,
			reattaching: false,
		})).toBe(false)
	})

	it.each(['layerFocused', 'edgeFocused', 'endpointFocused', 'reattaching'] as const)(
		'reveals for %s',
		(trigger) => {
			expect(tunnelRouteIsRevealed({
				enabled: true,
				layerFocused: false,
				edgeFocused: false,
				endpointFocused: false,
				reattaching: false,
				[trigger]: true,
			})).toBe(true)
		},
	)
})

describe('tunnel path presentation', () => {
	it('draws equal endpoint stubs and places one via at each inner end', () => {
		expect(tunnelPathPresentation(300, false)).toEqual({
			dashArray: `${TUNNEL_STUB_LENGTH} ${300 - TUNNEL_STUB_LENGTH * 2} ${TUNNEL_STUB_LENGTH} 0`,
			viaDistances: [TUNNEL_STUB_LENGTH, 300 - TUNNEL_STUB_LENGTH],
		})
		expect(tunnelVisualForPoints([{ x: 0, y: 0 }, { x: 300, y: 0 }], false)).toMatchObject({
			startVia: { x: 34, y: 0 },
			endVia: { x: 266, y: 0 },
		})
	})

	it('leaves focused, invalid, and short routes fully visible', () => {
		expect(tunnelPathPresentation(300, true)).toBeNull()
		expect(tunnelPathPresentation(Number.NaN, false)).toBeNull()
		expect(tunnelPathPresentation(TUNNEL_MIN_PATH_LENGTH, false)).toBeNull()
		expect(tunnelVisualForPoints([{ x: 0, y: 0 }], false)).toBeNull()
	})
})
