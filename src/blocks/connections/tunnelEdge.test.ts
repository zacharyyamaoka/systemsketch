import { describe, expect, it } from 'vitest'

import {
	TUNNEL_MIN_PATH_LENGTH,
	TUNNEL_STUB_LENGTH,
	tunnelDisplayState,
	tunnelPathPresentation,
	tunnelVisualForPoints,
} from './tunnelEdge'

describe('tunnel display contract', () => {
	it('keeps an ordinary edge visible and an idle configured tunnel underground', () => {
		expect(tunnelDisplayState({
			enabled: false,
			layer: '',
			focusedLayer: null,
			contextFocused: false,
		})).toBe('off')
		expect(tunnelDisplayState({
			enabled: true,
			layer: 'Diagnostics',
			focusedLayer: null,
			contextFocused: false,
		})).toBe('hidden')
	})

	it('previews the whole route on hover or selection without removing its mouths', () => {
		expect(tunnelDisplayState({
			enabled: true,
			layer: 'Diagnostics',
			focusedLayer: null,
			contextFocused: true,
		})).toBe('preview')
	})

	it('reveals the active layer and tunnels every edge outside it', () => {
		expect(tunnelDisplayState({
			enabled: true,
			layer: 'Diagnostics',
			focusedLayer: 'Diagnostics',
			contextFocused: false,
		})).toBe('revealed')
		expect(tunnelDisplayState({
			enabled: false,
			layer: '',
			focusedLayer: 'Diagnostics',
			contextFocused: false,
		})).toBe('hidden')
		expect(tunnelDisplayState({
			enabled: false,
			layer: '',
			focusedLayer: 'Diagnostics',
			contextFocused: true,
		})).toBe('preview')
	})
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
