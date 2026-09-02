/**
 * FigJam's palette, as a stock tldraw theme.
 *
 * tldraw ships thirteen colours; FigJam shows twenty-one in an 11x2 grid. The
 * supported way to change that set is a theme: `<Tldraw themes={...}>` runs
 * `registerColorsFromThemes` before any effect or store load, and that function
 * calls `DefaultColorStyle.addValues(...)` for every colour a theme names. The
 * colour style is therefore *derived from the theme*, not fixed by the library
 * — no shape util is replaced and no schema is forked.
 *
 * The theme is built by spreading `DEFAULT_THEME` rather than replacing it,
 * which matters for a reason that is easy to miss: `registerColorsFromThemes`
 * also *removes* any registered colour absent from every theme. A palette of
 * only FigJam's names would unregister tldraw's `grey`, and a board that had
 * ever stored a grey shape would fail validation on load. Spreading keeps all
 * thirteen registered; the menu simply shows FigJam's twenty-one.
 *
 * Hexes were sampled from FigJam's own colour popover — the centre pixel of
 * each 24px swatch, located from the panel geometry rather than by eye. See
 * `docs/figjam-appearance-menu-spec-2026-09-01.html`.
 */
import { DEFAULT_THEME, type TLDefaultColor, type TLTheme } from 'tldraw'

/** The nine names FigJam has that tldraw does not ship. */
declare module '@tldraw/tlschema' {
  interface TLThemeDefaultColors {
    'dark-gray': TLDefaultColor
    teal: TLDefaultColor
    pink: TLDefaultColor
    gray: TLDefaultColor
    'light-gray': TLDefaultColor
    'light-orange': TLDefaultColor
    'light-yellow': TLDefaultColor
    'light-teal': TLDefaultColor
    'light-pink': TLDefaultColor
  }
}

/**
 * FigJam's grid, read left-to-right then top-to-bottom: eleven saturated
 * colours, then their light twins. The order is FigJam's own, not sorted.
 */
export const FIGJAM_PALETTE = [
  ['black', '#1e1e1e', 'Black'],
  ['dark-gray', '#757575', 'Dark gray'],
  ['red', '#f24822', 'Red'],
  ['orange', '#ff9e42', 'Orange'],
  ['yellow', '#ffc943', 'Yellow'],
  ['green', '#66d575', 'Green'],
  ['teal', '#5ad8cc', 'Teal'],
  ['blue', '#3dadff', 'Blue'],
  ['violet', '#874fff', 'Violet'],
  ['pink', '#f849c1', 'Pink'],
  ['white', '#ffffff', 'White'],
  ['gray', '#b3b3b3', 'Gray'],
  ['light-gray', '#d9d9d9', 'Light gray'],
  ['light-red', '#ffc7c2', 'Light red'],
  ['light-orange', '#ffe0c2', 'Light orange'],
  ['light-yellow', '#ffecbd', 'Light yellow'],
  ['light-green', '#cdf4d3', 'Light green'],
  ['light-teal', '#c6faf6', 'Light teal'],
  ['light-blue', '#c2e5ff', 'Light blue'],
  ['light-violet', '#dcccff', 'Light violet'],
  ['light-pink', '#ffc2ec', 'Light pink'],
] as const satisfies readonly (readonly [string, string, string])[]

/** FigJam lays the palette out eleven to a row. */
export const FIGJAM_PALETTE_COLUMNS = 11

export const FIGJAM_COLOR_NAMES = FIGJAM_PALETTE.map(([name]) => name)

/** The one hex FigJam publishes per colour, by name. */
export const FIGJAM_COLOR_HEX: Record<string, string> = Object.fromEntries(
  FIGJAM_PALETTE.map(([name, hex]) => [name, hex]),
)

/** FigJam's own word for a colour, for the tooltip on its swatch. */
export const FIGJAM_COLOR_LABELS: Record<string, string> = Object.fromEntries(
  FIGJAM_PALETTE.map(([name, , label]) => [name, label]),
)

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** Mix towards white, the way tldraw derives its own tints from a solid. */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = channels(hex)
  return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount])
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = channels(hex)
  return toHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)])
}

/** Black text on a pale colour, white on a deep one. */
function readableInk(hex: string): string {
  const [r, g, b] = channels(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000000' : '#ffffff'
}

/**
 * A full `TLDefaultColor` from the one hex FigJam shows.
 *
 * FigJam publishes a single swatch per colour; tldraw wants fourteen related
 * values (the semi-transparent fill, the note body, the frame chrome, the
 * highlighter). Each is derived from the swatch by the same rule for every
 * colour, so the family stays internally consistent and a reviewer can check
 * one relationship rather than 294 hand-picked hexes.
 */
export function colorFromSwatch(hex: string): TLDefaultColor {
  return {
    solid: hex,
    fill: hex,
    linedFill: lighten(hex, 0.2),
    frameHeadingStroke: lighten(hex, 0.15),
    frameHeadingFill: lighten(hex, 0.94),
    frameStroke: lighten(hex, 0.15),
    frameFill: lighten(hex, 0.96),
    frameText: '#000000',
    noteFill: hex,
    noteText: readableInk(hex),
    semi: lighten(hex, 0.82),
    pattern: lighten(hex, 0.1),
    highlightSrgb: lighten(hex, 0.35),
    highlightP3: lighten(hex, 0.35),
  }
}

type ColorTable = Record<string, TLDefaultColor>

/**
 * tldraw's own default theme also has to carry every colour this app can
 * store — and this is the trap under the trap.
 *
 * `registerColorsFromThemes` registers the colours of *whichever* themes a
 * store is created with and removes the rest. `parseTldrawJsonFile`, which
 * every load path uses, creates a store of its own with no themes at all, so
 * opening a file resets the enum to tldraw's thirteen — and any FigJam-only
 * or custom name in that file fails validation on the very parse that would
 * load it. The one object every such path resolves through is
 * `DEFAULT_THEME` (`resolveThemes(undefined)` is `{ default: DEFAULT_THEME }`),
 * so a colour is added *there* as well as to the theme this app paints with.
 * Only names missing from it are added: tldraw's own entries are left alone,
 * because the default theme is what a themeless store would paint with, and
 * `FIGJAM_THEME` below is the one that actually paints here.
 */
function extendDefaultTheme(name: string, color: TLDefaultColor): void {
  const light = DEFAULT_THEME.colors.light as unknown as ColorTable
  const dark = DEFAULT_THEME.colors.dark as unknown as ColorTable
  if (!(name in light)) light[name] = color
  if (!(name in dark)) dark[name] = color
}

for (const [name, hex] of FIGJAM_PALETTE) extendDefaultTheme(name, colorFromSwatch(hex))

const LIGHT_COLORS = Object.fromEntries(
  FIGJAM_PALETTE.map(([name, hex]) => [name, colorFromSwatch(hex)]),
)

/**
 * Dark mode keeps FigJam's hues but lifts the two colours that would vanish:
 * black on a dark canvas, and the deep greys.
 */
const DARK_COLORS = Object.fromEntries(
  FIGJAM_PALETTE.map(([name, hex]) => [
    name,
    colorFromSwatch(name === 'black' ? lighten(hex, 0.86) : name === 'dark-gray' ? lighten(hex, 0.3) : hex),
  ]),
)

/**
 * The theme SystemSketch mounts. `DEFAULT_THEME` is spread first so tldraw's
 * own thirteen colours stay registered and stored boards keep validating; the
 * UI colours (selection stroke, brush fill, cursor) are tldraw's untouched.
 */
export const FIGJAM_THEME: TLTheme = {
  ...DEFAULT_THEME,
  colors: {
    light: { ...DEFAULT_THEME.colors.light, ...LIGHT_COLORS },
    dark: { ...DEFAULT_THEME.colors.dark, ...DARK_COLORS },
  },
}

/** What `<Tldraw themes={...}>` takes. Keyed by theme id, hence `default`. */
export const SYSTEMSKETCH_THEMES = { default: FIGJAM_THEME }

/**
 * Give the theme one more colour, in place.
 *
 * In place is the point. `TldrawEditor` re-runs `registerColorsFromThemes`
 * on the `themes` prop every time it renders, and that call *unregisters*
 * any colour absent from every theme it is handed. A custom colour kept in a
 * side table would therefore be registered by the picker and silently
 * removed by the next re-render, and the first shape edit after that would
 * fail validation. Adding it to the very object the prop points at means
 * every re-registration sees it. Returns false when the name was already there.
 */
export function addThemeColor(name: string, hex: string): boolean {
  const light = FIGJAM_THEME.colors.light as unknown as ColorTable
  const dark = FIGJAM_THEME.colors.dark as unknown as ColorTable
  if (name in light && name in dark) return false
  const color = colorFromSwatch(hex)
  light[name] = color
  dark[name] = color
  // And into tldraw's default theme, so the file parser's themeless store
  // keeps the name registered — see `extendDefaultTheme`.
  extendDefaultTheme(name, color)
  return true
}
