/**
 * Tunnel-edge presentation, kept independent of React and tldraw's renderer.
 *
 * A tunnel is still one ordinary connection. Only its idle presentation
 * changes: the long run leaves the surface while a short stub and outlined
 * via remain at both endpoints. Hover and selection preview the complete run
 * without removing those mouths; focusing a layer reveals only that layer and
 * tunnels every other semantic edge.
 */
import type { VecLike } from 'tldraw'

import { pointAtFraction, polylineLength } from './connectionPresentation'

/** Visible cable between a port and its tunnel via, in page units. */
export const TUNNEL_STUB_LENGTH = 34

/** Two readable stubs plus a real hidden middle. Shorter cables stay visible. */
export const TUNNEL_MIN_PATH_LENGTH = TUNNEL_STUB_LENGTH * 2 + 16

export type TunnelDisplayState = 'off' | 'hidden' | 'preview' | 'revealed'

export interface TunnelDisplayContext {
	enabled: boolean
	layer: string
	focusedLayer: string | null
	contextFocused: boolean
}

/**
 * Resolve the four paint states without changing the semantic connection.
 * Hover/selection previews the complete route but keeps its tunnel mouths.
 * A focused layer alone removes its own mouths and tunnels every other edge.
 */
export function tunnelDisplayState(context: TunnelDisplayContext): TunnelDisplayState {
	if (context.focusedLayer) {
		if (context.layer === context.focusedLayer) return 'revealed'
		return context.contextFocused ? 'preview' : 'hidden'
	}
	if (!context.enabled) return 'off'
	return context.contextFocused ? 'preview' : 'hidden'
}

export interface TunnelPathPresentation {
	/** SVG dash pattern that draws `stub / hidden middle / stub`. */
	dashArray: string
	/** Arc-length positions of the two visible via dots. */
	viaDistances: readonly [number, number]
}

/** `null` means the route should remain fully visible. */
export function tunnelPathPresentation(
	pathLength: number,
	revealed: boolean,
): TunnelPathPresentation | null {
	if (revealed || !Number.isFinite(pathLength) || pathLength <= TUNNEL_MIN_PATH_LENGTH) {
		return null
	}
	const hiddenMiddle = pathLength - TUNNEL_STUB_LENGTH * 2
	return {
		dashArray: `${TUNNEL_STUB_LENGTH} ${hiddenMiddle} ${TUNNEL_STUB_LENGTH} 0`,
		viaDistances: [TUNNEL_STUB_LENGTH, pathLength - TUNNEL_STUB_LENGTH],
	}
}

export interface TunnelVisual extends TunnelPathPresentation {
	startVia: { x: number; y: number }
	endVia: { x: number; y: number }
}

/** Resolve the idle stubs and vias on the same routed points the cable paints. */
export function tunnelVisualForPoints(
	points: readonly VecLike[],
	revealed: boolean,
): TunnelVisual | null {
	const length = polylineLength(points)
	const presentation = tunnelPathPresentation(length, revealed)
	if (!presentation) return null
	const [startDistance, endDistance] = presentation.viaDistances
	return {
		...presentation,
		startVia: pointAtFraction(points, startDistance / length),
		endVia: pointAtFraction(points, endDistance / length),
	}
}
