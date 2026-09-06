/**
 * What the three fills actually paint.
 *
 * The menu says Solid / Transparent / No fill, and until this they did not
 * mean that. tldraw maps `solid` to a pale 18% wash of the colour and `semi`
 * to the theme's flat canvas colour — measured on a blue rectangle: `#dcf0ff`
 * and `#fcfffe`. On a white canvas Transparent is indistinguishable from No
 * fill, on a white swatch all three collapse to the same white box, and
 * nothing about `semi` is transparent: it is an opaque near-white that hides
 * whatever it overlaps.
 *
 * FigJam is the reference, so the three read the way FigJam's three read:
 *
 * - **Solid** — the swatch colour, fully painted.
 * - **Transparent** — the same colour at {@link TRANSPARENT_FILL_ALPHA}, so
 *   what is behind it genuinely shows through.
 * - **No fill** — nothing, which tldraw already had right.
 *
 * WHY this is a display value and not a change of what a shape stores: the
 * stored `fill` stays a legal tldraw enum, so a `.tldr` written here still
 * opens in plain tldraw and still paints a fill there. Only the colour these
 * two states resolve to moves, through the same `getCustomDisplayValues` seam
 * the edge colour uses.
 */
import { readableInk } from './figjamPalette'

/** FigJam's transparent fill is a wash, not a ghost: enough to read as paint. */
export const TRANSPARENT_FILL_ALPHA = 0.25

/** The two fills this repaints. `none` and tldraw's other three are untouched. */
const REPAINTED = new Set(['solid', 'semi'])

type ThemeColors = Record<string, { fill?: string; solid?: string } | string | undefined>

export interface FillPaint {
	fillColor?: string
	labelColor?: string
}

function hexWithAlpha(hex: string, alpha: number): string {
	const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
	return `${hex}${value.toString(16).padStart(2, '0')}`
}

/** The swatch's own hex, which is what `fill` carries in the FigJam palette. */
function swatchHex(colors: ThemeColors, color: string): string | undefined {
	const entry = colors?.[color]
	if (typeof entry !== 'object' || !entry) return undefined
	const hex = entry.fill ?? entry.solid
	return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : undefined
}

/**
 * The fill and label colours for a shape, or an empty record when the fill is
 * one this does not speak for.
 *
 * A solid fill also carries the label's ink, because a fully painted black or
 * violet box would otherwise keep tldraw's black label and swallow it. Nothing
 * in the menu writes `labelColor`, so this is the only opinion on it.
 */
export function fillPaintFor(
	colors: ThemeColors,
	fill: string,
	color: string,
): FillPaint {
	if (!REPAINTED.has(fill)) return {}
	const hex = swatchHex(colors, color)
	if (!hex) return {}
	if (fill === 'semi') return { fillColor: hexWithAlpha(hex, TRANSPARENT_FILL_ALPHA) }
	return { fillColor: hex, labelColor: readableInk(hex) }
}
