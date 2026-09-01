import { describe, expect, it } from 'vitest'
import {
	BLOCK_EXPANDED_PLACEMENT_H,
	BLOCK_EXPANDED_PLACEMENT_W,
	BLOCK_PORT_PLACEMENT_H,
	BLOCK_PORT_PLACEMENT_W,
	blockViewForPlacement,
} from './blockPlacement'

describe('Block placement grammar', () => {
	it('uses simple for a click or a small drag', () => {
		expect(blockViewForPlacement(0, 0, false)).toBe('simple')
		expect(blockViewForPlacement(BLOCK_PORT_PLACEMENT_W - 1, 900, false)).toBe('simple')
		expect(blockViewForPlacement(900, BLOCK_PORT_PLACEMENT_H - 1, false)).toBe('simple')
	})

	it('uses port only when both dimensions clear its threshold', () => {
		expect(blockViewForPlacement(BLOCK_PORT_PLACEMENT_W, BLOCK_PORT_PLACEMENT_H, false)).toBe('port')
		expect(blockViewForPlacement(BLOCK_EXPANDED_PLACEMENT_W - 1, BLOCK_EXPANDED_PLACEMENT_H, false)).toBe('port')
	})

	it('uses expanded for a very large box or any enclosing box', () => {
		expect(blockViewForPlacement(BLOCK_EXPANDED_PLACEMENT_W, BLOCK_EXPANDED_PLACEMENT_H, false)).toBe('expanded')
		expect(blockViewForPlacement(1, 1, true)).toBe('expanded')
	})
})
