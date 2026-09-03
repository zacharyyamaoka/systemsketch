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
/** Selected state of a labelled chip: the Fill / Transparent / No fill row. */
export const ACCENT = '#9747ff'
/**
 * Selected state of an icon-only cell, and the ring around the chosen swatch.
 * FigJam uses a second, deeper purple here — read as `rgb(138, 56, 245)` from
 * the radio cells in every icon row and from the swatch ring's border — and a
 * first pass had painted both with the chip's `#9747ff`.
 */
export const ACCENT_RADIO = '#8a38f5'

/** The pill is 40px tall and its triggers fill that height. */
export const PILL_HEIGHT = 40
export const PILL_RADIUS = 13
/** Triggers are square-ish, full height, and only lightly rounded. */
export const TRIGGER_RADIUS = 5
/**
 * A trigger is 56px: the 24px icon butted against the 16px chevron, with 8px
 * either side (4px on the button, 4px on the span inside it). The colour
 * trigger is 54px because its 18px swatch sits in a 22px ring box instead.
 */
export const TRIGGER_WIDTH = 56
export const TRIGGER_PADDING = 8
export const SWATCH_RING_BOX = 22
/** Font size is a combobox: 144px wide, the size's name at 11px, chevron at the end. */
export const TEXT_TRIGGER_WIDTH = 144
/** Between control groups: a 1px hairline with 4px clear on each side. */
export const SEPARATOR_MARGIN = 4
/** Popovers open this far above the pill. */
export const POPOVER_GAP = 8
export const POPOVER_PADDING = 8
/**
 * How close a popover may come to the window edge before Radix stops sliding
 * it. Not a FigJam measurement — it is the same 12px the rest of the app's
 * popovers already pass, and without it the 455px colour palette opened flush
 * at x=0 with its first swatch column cut in half.
 */
export const POPOVER_COLLISION_PADDING = 12

/** Control icons: filled paths on a 24x24 viewBox, not stroked outlines. */
export const ICON_VIEWBOX = '0 0 24 24'
export const ICON_SIZE = 24
/**
 * An option cell in an icon row is the icon itself — 24px square, 5px radius,
 * on a 32px pitch — so a popover of N cells is `8 + 32N - 8 + 8` wide: Start
 * point's seven come to 232, Text alignment's three to 104.
 */
export const CELL_SIZE = 24
export const CELL_RADIUS = 5
export const CELL_GAP = 8
/**
 * A labelled chip — Fill / Transparent / No fill, or Solid / Dashed / None on
 * a shape — is 24px tall with a 5px radius, in a 32px row (4px clear each side).
 */
export const CHIP_HEIGHT = 24
export const CHIP_RADIUS = 5
export const CHIP_ROW_PADDING = 4
/** A list row (Typeface, Font size): 24px tall, the check in a 16px slot, then the value. */
export const LIST_ROW_HEIGHT = 24
export const LIST_CHECK_SIZE = 16
/**
 * FigJam draws each Font size row at its own size: 12 / 13 / 14 / 16 / 18px
 * for Small through Huge. tldraw has four rungs, so Huge has no row.
 */
export const FONT_SIZE_LADDER: Readonly<Record<string, number>> = { s: 12, m: 13, l: 14, xl: 16 }
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
export const SWATCH_SELECTED_RING = `0 0 0 2px ${SURFACE}, 0 0 0 4px ${ACCENT_RADIO}`

/**
 * The 22nd cell. A 32px box on the same 32px pitch as the swatches (so it
 * overhangs its slot by 4px on every side), holding a 24px disc. Idle, the
 * disc is this conic wheel under a white radial highlight; once the selection
 * carries a custom colour the disc is that colour and the wheel becomes a 2px
 * ring around it — the same border-box trick FigJam uses, read from its DOM.
 */
export const CUSTOM_CELL_SIZE = 32
export const CUSTOM_WHEEL =
  'conic-gradient(#ff0000, #ffa800 47.73deg, #ffff00 79.56deg, #00ff00 121.33deg, '
  + '#00ffff 180.99deg, #0000ff 238.67deg, #ff00ff 294.36deg, #ff0000 360deg)'
export const CUSTOM_WHEEL_HIGHLIGHT = 'radial-gradient(50% 50%, #ffffff 0%, rgb(255 255 255 / 0%) 100%)'

/**
 * The picker behind Custom: 184 x 310, opened flush under the palette and
 * centred on the Custom cell. Three bands — the eyedropper and hex field
 * (64px), the hue and opacity sliders (62px), and the 184px saturation /
 * value square that runs to the bottom edge.
 */
export const PICKER_WIDTH = 184
export const PICKER_HEIGHT = 310
export const PICKER_HEAD_HEIGHT = 64
export const PICKER_SLIDERS_HEIGHT = 62
export const PICKER_FIELD_HEIGHT = 32
export const PICKER_FIELD = '#383838'
export const PICKER_FIELD_BORDER = '#444444'
export const PICKER_FIELD_FOCUS = '#0c8ce9'
/** The slider's thumb travels 152px; its track paints 8px past each end, rounded. */
export const SLIDER_TRAVEL = 152
export const SLIDER_HEIGHT = 16
export const SLIDER_OVERHANG = 8
export const THUMB_SIZE = 16
export const THUMB_BORDER = 4
export const HUE_TRACK =
  'linear-gradient(90deg, #ff0000 8px, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000 calc(100% - 8px))'
/** A 2x2 checker, scaled so two cells fill two thirds of the track's height. */
export const CHECKER_TILE =
  'url("data:image/svg+xml;utf8,%3Csvg%20width%3D%222%22%20height%3D%222%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%200h1v2h1V1H0%22%20fill-rule%3D%22nonzero%22%20fill%3D%22%23e1e1e1%22%2F%3E%3C%2Fsvg%3E")'
export const CHECKER_SIZE = 'auto 66.67%'

/** The three-layer shadow every floating surface uses. */
export const SHADOW = [
  '0 0 0.5px rgb(0 0 0 / 12%)',
  '0 10px 16px rgb(0 0 0 / 12%)',
  '0 2px 5px rgb(0 0 0 / 15%)',
].join(', ')
