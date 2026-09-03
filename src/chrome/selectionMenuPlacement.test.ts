import { describe, expect, it } from 'vitest'

import {
  SELECTION_MENU_GAP,
  SELECTION_MENU_MARGIN,
  isSelectionOnScreen,
  placeSelectionMenu,
  selectionMenuLayoutWidth,
  selectionMenuSafeWidth,
} from './selectionMenuPlacement'

/**
 * The FigJam capture ran at this viewport, so the numbers below can be checked
 * directly against docs/figjam-contextual-menu-spec-2026-09-01.html.
 */
const VIEWPORT = { w: 1680, h: 857 }
const MENU = { w: 183, h: 40 }
const TOOL_BELT_TOP = 797

const place = (selection: { x: number; y: number; w: number; h: number }, extra = {}) =>
  placeSelectionMenu({ selection, menu: MENU, viewport: VIEWPORT, overlayInset: 0, ...extra })

describe('selection menu placement', () => {
  it('centres the menu on the selection and sits one gap above it', () => {
    const selection = { x: 703, y: 355, w: 238, h: 147 }
    const { x, y, side } = place(selection)

    expect(side).toBe('above')
    // Whole-pixel placement, so an odd-width menu can be half a pixel off centre.
    expect(Math.abs((x + MENU.w / 2) - (selection.x + selection.w / 2))).toBeLessThanOrEqual(0.5)
    expect(selection.y - (y + MENU.h)).toBe(SELECTION_MENU_GAP)
  })

  it('keeps the gap constant as the selection grows, because the menu is not in the scene', () => {
    const gapFor = (w: number, h: number) => {
      const selection = { x: 840 - w / 2, y: 500, w, h }
      const { y } = place(selection)
      return selection.y - (y + MENU.h)
    }

    expect(gapFor(72, 45)).toBe(SELECTION_MENU_GAP)
    expect(gapFor(784, 485)).toBe(SELECTION_MENU_GAP)
  })

  it('measures the gap from the selection overlay, not the shape box', () => {
    const selection = { x: 700, y: 400, w: 200, h: 120 }
    const { y } = placeSelectionMenu({
      selection,
      menu: MENU,
      viewport: VIEWPORT,
      overlayInset: 8,
    })

    expect(selection.y - (y + MENU.h)).toBe(SELECTION_MENU_GAP + 8)
  })

  it('stays above while the menu clears the top margin', () => {
    // Menu top lands exactly on the margin: the last position that still fits.
    const top = SELECTION_MENU_MARGIN + MENU.h + SELECTION_MENU_GAP
    const { y, side } = place({ x: 700, y: top, w: 240, h: 120 })

    expect(side).toBe('above')
    expect(y).toBe(SELECTION_MENU_MARGIN)
  })

  it('flips below rather than clamping down onto the shape', () => {
    const top = SELECTION_MENU_MARGIN + MENU.h + SELECTION_MENU_GAP - 1
    const selection = { x: 700, y: top, w: 240, h: 120 }
    const { y, side } = place(selection)

    expect(side).toBe('below')
    expect(y - (selection.y + selection.h)).toBe(SELECTION_MENU_GAP)
  })

  it('clamps to the left margin instead of running off the edge', () => {
    const { x } = place({ x: -60, y: 400, w: 140, h: 140 })
    expect(x).toBe(SELECTION_MENU_MARGIN)
  })

  it('clamps to the right margin instead of running off the edge', () => {
    const { x } = place({ x: 1600, y: 400, w: 140, h: 140 })
    expect(x + MENU.w).toBe(VIEWPORT.w - SELECTION_MENU_MARGIN)
  })

  it('treats the bottom toolbar as the floor, not the window edge', () => {
    // Selection taller than the viewport: neither above nor below fits.
    const { y } = place(
      { x: 700, y: -400, w: 240, h: 1600 },
      { bottomObstacleTop: TOOL_BELT_TOP },
    )

    expect(y + MENU.h).toBe(TOOL_BELT_TOP - SELECTION_MENU_MARGIN)
  })

  it('pins a menu wider than its safe area to the left margin', () => {
    const { x } = placeSelectionMenu({
      selection: { x: 100, y: 400, w: 200, h: 100 },
      menu: { w: 2000, h: 40 },
      viewport: VIEWPORT,
      overlayInset: 0,
    })

    expect(x).toBe(SELECTION_MENU_MARGIN)
  })

  it('reserves both margins for overflow at narrow widths and every interface scale', () => {
    const narrow = { w: 320, h: 720 }

    expect(selectionMenuSafeWidth(narrow)).toBe(280)
    expect(selectionMenuLayoutWidth(narrow, 1)).toBe(280)
    expect(selectionMenuLayoutWidth(narrow, 1.6)).toBe(175)
    expect(selectionMenuLayoutWidth(narrow, 1.6) * 1.6).toBe(280)

    const { x } = placeSelectionMenu({
      selection: { x: 100, y: 300, w: 120, h: 100 },
      menu: { w: selectionMenuSafeWidth(narrow), h: 40 },
      viewport: narrow,
      overlayInset: 0,
    })
    expect(x).toBe(SELECTION_MENU_MARGIN)
    expect(x + selectionMenuSafeWidth(narrow)).toBe(narrow.w - SELECTION_MENU_MARGIN)
  })

  it('rounds to whole pixels so the menu never lands on a half pixel', () => {
    const { x, y } = place({ x: 100.5, y: 400.25, w: 201, h: 100 })
    expect(Number.isInteger(x)).toBe(true)
    expect(Number.isInteger(y)).toBe(true)
  })
})

describe('selection visibility', () => {
  it('hides once the selection has left the viewport', () => {
    expect(isSelectionOnScreen({ x: -400, y: 400, w: 200, h: 100 }, VIEWPORT)).toBe(false)
    expect(isSelectionOnScreen({ x: 1800, y: 400, w: 200, h: 100 }, VIEWPORT)).toBe(false)
    expect(isSelectionOnScreen({ x: 400, y: -300, w: 200, h: 100 }, VIEWPORT)).toBe(false)
  })

  it('keeps showing for a selection that surrounds the viewport', () => {
    // An Expanded Block filling the screen: its centre is off-screen, but the
    // user is looking straight at it.
    expect(isSelectionOnScreen({ x: -2000, y: -2000, w: 6000, h: 6000 }, VIEWPORT)).toBe(true)
  })

  it('keeps showing while any part of the selection is still on screen', () => {
    expect(isSelectionOnScreen({ x: -190, y: 400, w: 200, h: 100 }, VIEWPORT)).toBe(true)
  })
})
