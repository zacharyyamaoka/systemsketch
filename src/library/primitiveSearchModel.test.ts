import { describe, expect, it } from 'vitest'

import {
  PRIMITIVE_SEARCH_GAP,
  PRIMITIVE_SEARCH_MARGIN,
  isPrimitiveSearchKey,
  nextPrimitiveSearchIndex,
  placePrimitiveSearch,
  primitiveSearchPanelHeight,
} from './primitiveSearchModel'

describe('cursor primitive search model', () => {
  it('opens below-right of the pointer when that side has room', () => {
    const placed = placePrimitiveSearch(
      { x: 300, y: 220 },
      { w: 304, h: 260 },
      { w: 1000, h: 700 },
    )
    expect(placed).toMatchObject({
      x: 300 + PRIMITIVE_SEARCH_GAP,
      y: 220 + PRIMITIVE_SEARCH_GAP,
      horizontal: 'right',
      vertical: 'below',
    })
  })

  it('flips above-left before clamping at the bottom-right corner', () => {
    const placed = placePrimitiveSearch(
      { x: 980, y: 620 },
      { w: 304, h: 260 },
      { w: 1000, h: 700 },
      640,
    )
    expect(placed.horizontal).toBe('left')
    expect(placed.vertical).toBe('above')
    expect(placed.x).toBe(980 - PRIMITIVE_SEARCH_GAP - 304)
    expect(placed.y).toBe(620 - PRIMITIVE_SEARCH_GAP - 260)
  })

  it('stays inside narrow viewports and above a bottom toolbar obstacle', () => {
    const placed = placePrimitiveSearch(
      { x: 280, y: 500 },
      { w: 304, h: 400 },
      { w: 320, h: 620 },
      560,
    )
    expect(placed.w).toBe(320 - PRIMITIVE_SEARCH_MARGIN * 2)
    expect(placed.x).toBe(PRIMITIVE_SEARCH_MARGIN)
    expect(placed.y).toBeGreaterThanOrEqual(PRIMITIVE_SEARCH_MARGIN)
    expect(placed.y + placed.h).toBeLessThanOrEqual(560 - PRIMITIVE_SEARCH_MARGIN)
  })

  it('caps the visible result stack at six rows', () => {
    expect(primitiveSearchPanelHeight(20)).toBe(primitiveSearchPanelHeight(6))
    expect(primitiveSearchPanelHeight(0)).toBeLessThan(primitiveSearchPanelHeight(1))
  })

  it('reserves plain unmodified S for search without swallowing typing variants', () => {
    const event = (overrides: Partial<KeyboardEvent> = {}) => ({
      key: 's', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      repeat: false, isComposing: false, ...overrides,
    } as KeyboardEvent)
    expect(isPrimitiveSearchKey(event())).toBe(true)
    expect(isPrimitiveSearchKey(event({ key: 'S', shiftKey: true }))).toBe(false)
    expect(isPrimitiveSearchKey(event({ ctrlKey: true }))).toBe(false)
    expect(isPrimitiveSearchKey(event({ repeat: true }))).toBe(false)
    expect(isPrimitiveSearchKey(event({ isComposing: true }))).toBe(false)
  })

  it('wraps keyboard selection over the visible result list', () => {
    expect(nextPrimitiveSearchIndex(0, -1, 3)).toBe(2)
    expect(nextPrimitiveSearchIndex(2, 1, 3)).toBe(0)
    expect(nextPrimitiveSearchIndex(-1, 1, 3)).toBe(0)
    expect(nextPrimitiveSearchIndex(0, 1, 0)).toBe(-1)
  })
})
