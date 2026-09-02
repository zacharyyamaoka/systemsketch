/**
 * FigJam's own values, read out of the running editor rather than eyeballed.
 *
 * Every number and colour here came from `getComputedStyle` on FigJam's
 * selection menu, or from sampling the rendered pixels of a 2x capture. They are
 * exported so the CSS and the icon components cannot drift apart, and so a
 * reviewer can check the copy against the source rather than against taste.
 *
 * Captured 2026-09-01; see `docs/figjam-appearance-menu-spec-2026-09-01.html`.
 */

/** The pill and every popover share one surface. */
export const SURFACE = '#1e1e1e'
/** Hairline between control groups in the pill, and between popover sections. */
export const DIVIDER = '#383838'
/** Selected state: the mode chip's fill and the ring around the chosen swatch. */
export const ACCENT = '#9747ff'

/** The pill is 40px tall and its triggers fill that height. */
export const PILL_HEIGHT = 40
export const PILL_RADIUS = 13
/** Triggers are square-ish, full height, and only lightly rounded. */
export const TRIGGER_RADIUS = 5
/** Popovers open this far above the pill. */
export const POPOVER_GAP = 8
export const POPOVER_PADDING = 8

/** Control icons: filled paths on a 24x24 viewBox, not stroked outlines. */
export const ICON_VIEWBOX = '0 0 24 24'
export const ICON_SIZE = 24
/** The dropdown chevron: a filled 16x16 path, identical on every trigger. */
export const CHEVRON_VIEWBOX = '0 0 16 16'
export const CHEVRON_SIZE = 16
export const CHEVRON_PATH =
  'M9.768 6.768a.5.5 0 0 1 .707.707l-2.12 2.121a.5.5 0 0 1-.708 0L5.525 7.475a.5.5 0 0 1 .708-.707l1.768 1.767z'

/** Colour swatches: 24px circles on a 32px pitch, 12px in from the panel edge. */
export const SWATCH_SIZE = 24
export const SWATCH_PITCH = 32
/** The colour shown on a trigger is smaller than one in the grid. */
export const TRIGGER_SWATCH_SIZE = 18
/** Every swatch carries this inner hairline so white reads as a disc. */
export const SWATCH_INNER_RING = 'inset 0 0 0 1px rgb(255 255 255 / 20%)'
/**
 * The chosen swatch gets a ring held two pixels off its edge — measured by
 * scanning a row of pixels through the selected swatch: 24px of colour, a 2px
 * gap of surface, then 2px of accent.
 */
export const SWATCH_SELECTED_RING = `0 0 0 2px ${SURFACE}, 0 0 0 4px ${ACCENT}`

/** The three-layer shadow every floating surface uses. */
export const SHADOW = [
  '0 0 0.5px rgb(0 0 0 / 12%)',
  '0 10px 16px rgb(0 0 0 / 12%)',
  '0 2px 5px rgb(0 0 0 / 15%)',
].join(', ')
