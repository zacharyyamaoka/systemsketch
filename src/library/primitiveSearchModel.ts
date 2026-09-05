export const PRIMITIVE_SEARCH_WIDTH = 304
export const PRIMITIVE_SEARCH_MARGIN = 12
export const PRIMITIVE_SEARCH_GAP = 14
export const PRIMITIVE_SEARCH_MAX_RESULTS = 6
export const PRIMITIVE_SEARCH_INPUT_HEIGHT = 44
export const PRIMITIVE_SEARCH_ROW_HEIGHT = 43
export const PRIMITIVE_SEARCH_FOOTER_HEIGHT = 29
export const PRIMITIVE_SEARCH_EMPTY_HEIGHT = 42
export const PRIMITIVE_SEARCH_RESULTS_PADDING = 8
export const PRIMITIVE_SEARCH_BORDER_HEIGHT = 2

export interface PrimitiveSearchPoint {
  x: number
  y: number
}

export interface PrimitiveSearchViewport {
  w: number
  h: number
}

export interface PrimitiveSearchPanelSize {
  w: number
  h: number
}

export interface PrimitiveSearchPlacement extends PrimitiveSearchPanelSize {
  x: number
  y: number
  horizontal: 'left' | 'right'
  vertical: 'above' | 'below'
}

export function primitiveSearchPanelHeight(resultCount: number): number {
  const rows = Math.min(Math.max(0, resultCount), PRIMITIVE_SEARCH_MAX_RESULTS)
  return PRIMITIVE_SEARCH_BORDER_HEIGHT + PRIMITIVE_SEARCH_INPUT_HEIGHT
    + (rows > 0
      ? PRIMITIVE_SEARCH_RESULTS_PADDING + rows * PRIMITIVE_SEARCH_ROW_HEIGHT + PRIMITIVE_SEARCH_FOOTER_HEIGHT
      : PRIMITIVE_SEARCH_EMPTY_HEIGHT)
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.max(minimum, Math.min(value, maximum))
}

/**
 * Place the search against a frozen pointer point, then flip before clamping.
 *
 * WHY: the pointer is also the insertion target. Letting the panel chase its
 * result height would make the eventual placement feel slippery; the target
 * stays fixed while only the chrome chooses the side with room.
 */
export function placePrimitiveSearch(
  point: PrimitiveSearchPoint,
  requested: PrimitiveSearchPanelSize,
  viewport: PrimitiveSearchViewport,
  bottomObstacleTop = viewport.h,
): PrimitiveSearchPlacement {
  const safeWidth = Math.max(0, viewport.w - PRIMITIVE_SEARCH_MARGIN * 2)
  const safeHeight = Math.max(0, bottomObstacleTop - PRIMITIVE_SEARCH_MARGIN * 2)
  const w = Math.min(requested.w, safeWidth)
  const h = Math.min(requested.h, safeHeight)

  const fitsRight = point.x + PRIMITIVE_SEARCH_GAP + w <= viewport.w - PRIMITIVE_SEARCH_MARGIN
  const horizontal = fitsRight ? 'right' : 'left'
  const proposedX = horizontal === 'right'
    ? point.x + PRIMITIVE_SEARCH_GAP
    : point.x - PRIMITIVE_SEARCH_GAP - w

  const fitsBelow = point.y + PRIMITIVE_SEARCH_GAP + h <= bottomObstacleTop - PRIMITIVE_SEARCH_MARGIN
  const vertical = fitsBelow ? 'below' : 'above'
  const proposedY = vertical === 'below'
    ? point.y + PRIMITIVE_SEARCH_GAP
    : point.y - PRIMITIVE_SEARCH_GAP - h

  return {
    x: Math.round(clamp(proposedX, PRIMITIVE_SEARCH_MARGIN, viewport.w - PRIMITIVE_SEARCH_MARGIN - w)),
    y: Math.round(clamp(proposedY, PRIMITIVE_SEARCH_MARGIN, bottomObstacleTop - PRIMITIVE_SEARCH_MARGIN - h)),
    w: Math.round(w),
    h: Math.round(h),
    horizontal,
    vertical,
  }
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest([
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="textbox"]',
  ].join(',')))
}

export function isChromeShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest([
    '[data-systemsketch-chrome]',
    'button',
    'a[href]',
    '[role="menuitem"]',
    '[role="dialog"]',
  ].join(',')))
}

export function isPrimitiveSearchKey(event: Pick<KeyboardEvent,
  'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat' | 'isComposing'>): boolean {
  return event.key.toLocaleLowerCase() === 's'
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.repeat
    && !event.isComposing
}

export function nextPrimitiveSearchIndex(current: number, direction: 1 | -1, count: number): number {
  if (count <= 0) return -1
  if (current < 0) return direction === 1 ? 0 : count - 1
  return (current + direction + count) % count
}
