/**
 * Ported from Excalidraw's `createIcon` helper (`components/icons.tsx`, source
 * line 27) — the wrapper nearly every vendored glyph in `./icons.tsx` renders
 * through. See `./NOTICE.md` for full provenance.
 *
 * WHY currentColor, not `var(--icon-fill-color)`: Excalidraw's own source
 * (source line 16, `iconFillColor`) paints stroked glyphs from a CSS variable
 * its own theme stylesheet defines. This app has no such variable — its ink
 * tokens are `--ss-*`, resolved on `.tl-container` (see
 * `theme-tokens-live-on-the-container` in memory). Every stroke/fill in
 * `./icons.tsx` is ported to `currentColor` instead, so a glyph simply
 * inherits the `color` of whatever wraps it (the pill's existing ink) in both
 * light and dark — no second token to keep in sync. `icons.test.tsx` asserts
 * no rendered markup contains the string `icon-fill-color`.
 *
 * react only: no tldraw import, no DOM helpers, no app module. This file (and
 * `./icons.tsx`) must stay consumable by a plain `renderToStaticMarkup` test
 * and, later, by the wave-2 glyph dispatcher without dragging in the editor.
 */
import type { ReactNode, SVGProps } from 'react'

export interface CreateIconOpts extends SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  /** Mirror the glyph horizontally — Excalidraw uses this for RTL layouts. */
  mirror?: true
}

/**
 * Wrap an SVG path (or arbitrary child markup) in Excalidraw's standard icon
 * shell: a square `viewBox`, `aria-hidden`, and (for a bare path string) a
 * `currentColor` fill.
 *
 * `opts` may be a bare number (Excalidraw's `width` shorthand, defaulting
 * `height` to match) or a full options object — same calling convention as
 * the source.
 */
export function createIcon(d: string | ReactNode, opts: number | CreateIconOpts = 512): ReactNode {
  const { width = 512, height = width, mirror, style, ...rest } =
    typeof opts === 'number' ? ({ width: opts } as CreateIconOpts) : opts

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      className={mirror ? 'rtl-mirror' : undefined}
      style={style}
      {...rest}
    >
      {typeof d === 'string' ? <path fill="currentColor" d={d} /> : d}
    </svg>
  )
}

/** Excalidraw's Tabler-derived stroke icons: 24-unit grid, no fill, round caps. */
export const tablerIconProps: CreateIconOpts = {
  width: 24,
  height: 24,
  fill: 'none',
  strokeWidth: 2,
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/** Excalidraw's own hand-drawn icon set: 20-unit grid, no default fill. */
export const modifiedTablerIconProps: CreateIconOpts = {
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/** The wide preview strip an arrowhead swatch draws itself on. */
export const arrowheadPreviewIconProps: CreateIconOpts = {
  width: 40,
  height: 20,
}
