/**
 * Where the selection menu goes, as a pure function of measured rectangles.
 *
 * The policy is FigJam's, measured from the running editor on 2026-09-01 and
 * recorded in `docs/figjam-contextual-menu-spec-2026-09-01.html`. It lives here
 * rather than inside the component so "the menu appeared in the wrong place"
 * can be a failing assertion instead of a screenshot.
 *
 * Every value is in **viewport space** — pixels relative to the editor
 * container's top-left corner, which is the space tldraw documents for DOM
 * overlays rendered by `InFrontOfTheCanvas`. Convert with
 * `editor.getSelectionRotatedScreenBounds()` minus
 * `editor.getViewportScreenBounds()`'s point, exactly as tldraw's own
 * `TldrawUiContextualToolbar` does internally.
 */

/** Clearance between the menu and the selection overlay. Measured: 16px. */
export const SELECTION_MENU_GAP = 16

/**
 * Inset kept clear at the top, left and right edges of the viewport. Measured:
 * 20px. tldraw's own primitive uses 16; FigJam's slightly larger margin is what
 * keeps a clamped menu from touching the floating title and share bars.
 */
export const SELECTION_MENU_MARGIN = 20

/**
 * How far the selection chrome is drawn outside the shape's bounding box.
 *
 * FigJam reads as 40px above a shape because it draws mid-edge grab dots ~20px
 * outside the box and then leaves the 16px gap above *those*. tldraw draws its
 * handles on the box corners instead, so the equivalent stand-off is just the
 * handle's own half-size: measured at 5px in the running app, where a selected
 * 240x140 rectangle at (700, 380) paints selection blue from (695, 375) to
 * (944, 524). Keeping the gap measured from the overlay is what makes the
 * 16px constant mean the same thing in both apps.
 */
export const SELECTION_OVERLAY_INSET = 5

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  w: number
  h: number
}

export type SelectionMenuSide = 'above' | 'below'

export interface SelectionMenuPlacementInput {
  /** The selection's bounding box in viewport space. */
  selection: Rect
  /** The rendered menu's measured size. Never scaled by the camera. */
  menu: Size
  /** The editor container's size. */
  viewport: Size
  /**
   * Top edge of any chrome the menu must stay above, in viewport space —
   * SystemSketch's bottom toolbar. Defaults to the bottom of the viewport.
   */
  bottomObstacleTop?: number
  /** Overrides {@link SELECTION_OVERLAY_INSET}, mostly for tests. */
  overlayInset?: number
}

export interface SelectionMenuPlacement {
  x: number
  y: number
  /** Which side of the selection the menu ended up on, for styling and tests. */
  side: SelectionMenuSide
}

/** Width left after reserving FigJam's measured margin on both sides. */
export function selectionMenuSafeWidth(viewport: Size): number {
  return Math.max(0, viewport.w - SELECTION_MENU_MARGIN * 2)
}

/** Layout width required to produce that safe painted width after CSS scale. */
export function selectionMenuLayoutWidth(viewport: Size, paintScale = 1): number {
  return paintScale > 0 ? selectionMenuSafeWidth(viewport) / paintScale : 0
}

function clamp(value: number, min: number, max: number): number {
  // A menu wider or taller than its safe area would invert the range; pinning
  // to `min` keeps it on screen instead of flinging it off the far edge.
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Whether the selection is close enough to the viewport to be worth annotating.
 *
 * FigJam drops the menu once the selection leaves the screen. Testing for
 * *intersection* rather than for the selection's midpoint — which is what
 * tldraw's primitive does — matters here, because an Expanded Block routinely
 * fills the whole viewport with its centre far outside it.
 */
export function isSelectionOnScreen(selection: Rect, viewport: Size): boolean {
  return (
    selection.x < viewport.w
    && selection.y < viewport.h
    && selection.x + selection.w > 0
    && selection.y + selection.h > 0
  )
}

/**
 * Centre on the selection, offset above it, flip below when there is no room,
 * then clamp into the safe area — in that order.
 */
export function placeSelectionMenu({
  selection,
  menu,
  viewport,
  bottomObstacleTop,
  overlayInset = SELECTION_OVERLAY_INSET,
}: SelectionMenuPlacementInput): SelectionMenuPlacement {
  const overlayTop = selection.y - overlayInset
  const overlayBottom = selection.y + selection.h + overlayInset
  const centreX = selection.x + selection.w / 2

  let side: SelectionMenuSide = 'above'
  let y = overlayTop - menu.h - SELECTION_MENU_GAP
  if (y < SELECTION_MENU_MARGIN) {
    side = 'below'
    y = overlayBottom + SELECTION_MENU_GAP
  }

  const floor = bottomObstacleTop ?? viewport.h
  const x = clamp(
    centreX - menu.w / 2,
    SELECTION_MENU_MARGIN,
    viewport.w - menu.w - SELECTION_MENU_MARGIN,
  )
  y = clamp(y, SELECTION_MENU_MARGIN, floor - SELECTION_MENU_MARGIN - menu.h)

  return { x: Math.round(x), y: Math.round(y), side }
}
