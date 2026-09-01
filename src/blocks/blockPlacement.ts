import type { BlockView } from './blockModel'

export const BLOCK_PORT_PLACEMENT_W = 280
export const BLOCK_PORT_PLACEMENT_H = 170
export const BLOCK_EXPANDED_PLACEMENT_W = 520
export const BLOCK_EXPANDED_PLACEMENT_H = 340

/** Interpret a stock box-tool gesture as one of the Block's three views. */
export function blockViewForPlacement(
	w: number,
	h: number,
	enclosesShapes: boolean,
): BlockView {
	if (enclosesShapes) return 'expanded'
	if (w >= BLOCK_EXPANDED_PLACEMENT_W && h >= BLOCK_EXPANDED_PLACEMENT_H) {
		return 'expanded'
	}
	if (w >= BLOCK_PORT_PLACEMENT_W && h >= BLOCK_PORT_PLACEMENT_H) return 'port'
	return 'simple'
}
