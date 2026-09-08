/**
 * Vendored from tldraw's own shipped icon set —
 * `node_modules/@tldraw/assets/icons/icon/geo-*.svg` (pinned via this repo's
 * `tldraw` dependency version; this app already bundles and depends on that
 * whole SDK under the same license — see that package's LICENSE.md — so
 * using more of its own asset pack introduces no new provenance question).
 * Do not hand-edit a path; re-copy verbatim from that source instead.
 *
 * WHY this file exists: tldraw ships a real, correct, distinct icon for
 * every one of its 20 geo shapes — including `geo-oval.svg`, genuinely a
 * stadium/capsule shape distinct from `geo-ellipse.svg` — but this app's
 * shape picker used to draw from three different sources of uneven fidelity:
 * 8 shapes traced from FigJam's own app, one hand-drawn concentric-ellipse
 * ring standing in for Oval, and the other 11 falling through to a function
 * literally commented "a rough outline per geo kind — enough to tell a
 * diamond from an ellipse." Zach, after finding tldraw already has a clean,
 * complete set: "switch to the actual ones" (2026-09-08). This is that
 * single, uniform, correct replacement for all 20 — `AppearanceGlyph.tsx`'s
 * `GeoGlyph` renders from here now, and the old FigJam-traced `geo` map
 * entries and the oval-ring special case are retired, not layered under it.
 *
 * Each source SVG had its own `stroke`/`stroke-width`/`stroke-linecap`/
 * `stroke-linejoin` attributes (black, weight 2, mostly round joins) —
 * stripped here so every path inherits `.systemsketch-appearance__glyph`'s
 * shared `currentColor` / 1.5 weight / round caps instead, the same as every
 * other icon in this pill ("all the icons by construction must be the
 * same" — Zach, on the connector Line-style row).
 */
import type { ReactNode } from 'react'

/** tldraw draws every geo icon in a 30x30 box; the viewBox scales it into
 * whatever CSS size `.systemsketch-appearance__glyph` sets. */
function GeoIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 30 30" className="systemsketch-appearance__glyph" aria-hidden="true">
      {children}
    </svg>
  )
}

export const TLDRAW_GEO_ICONS: Readonly<Record<string, ReactNode>> = {
  rectangle: (
    <GeoIcon>
      <path d="M25 3a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    </GeoIcon>
  ),
  ellipse: (
    <GeoIcon>
      <path d="M27 15c0 6.627-5.373 12-12 12S3 21.627 3 15 8.373 3 15 3s12 5.373 12 12Z" />
    </GeoIcon>
  ),
  triangle: (
    <GeoIcon>
      <path d="M27.55 26H2.45L15 4z" />
    </GeoIcon>
  ),
  diamond: (
    <GeoIcon>
      <path d="M16.414 1.97 28.03 13.587a2 2 0 0 1 0 2.828L16.414 28.03a2 2 0 0 1-2.828 0L1.97 16.414a2 2 0 0 1 0-2.828L13.586 1.97a2 2 0 0 1 2.828 0Z" />
    </GeoIcon>
  ),
  pentagon: (
    <GeoIcon>
      <path d="M13.824 3.84a2 2 0 0 1 2.352 0L26.2 11.124a2 2 0 0 1 .727 2.236l-3.83 11.787a2 2 0 0 1-1.902 1.382H8.804a2 2 0 0 1-1.902-1.383L3.072 13.36a2 2 0 0 1 .727-2.236z" />
    </GeoIcon>
  ),
  hexagon: (
    <GeoIcon>
      <path d="M14.009 3.217a2 2 0 0 1 1.983 0l8.825 5.038a2 2 0 0 1 1.009 1.737v10.016a2 2 0 0 1-1.009 1.737l-8.825 5.038a2 2 0 0 1-1.983 0l-8.826-5.038a2 2 0 0 1-1.009-1.737V9.992a2 2 0 0 1 1.009-1.737z" />
    </GeoIcon>
  ),
  octagon: (
    <GeoIcon>
      <path d="M14.242 3.224a2 2 0 0 1 1.516 0l7.082 2.9a2 2 0 0 1 1.087 1.079l2.915 6.957a2 2 0 0 1 0 1.546l-2.915 6.957a2 2 0 0 1-1.087 1.078l-7.082 2.9a2 2 0 0 1-1.516 0l-7.082-2.9a2 2 0 0 1-1.087-1.078l-2.915-6.957a2 2 0 0 1 0-1.546l2.915-6.957A2 2 0 0 1 7.16 6.125z" />
    </GeoIcon>
  ),
  star: (
    <GeoIcon>
      <path d="m7.347 17.74-.81.587.81-.588-4.113-5.66 6.654-2.161a2 2 0 0 0 1-.727L15 3.531l4.112 5.66.809-.588-.81.588a2 2 0 0 0 1.001.727l6.654 2.161-4.113 5.66a2 2 0 0 0-.382 1.176v6.996l-6.653-2.162-.309.95.31-.95a2 2 0 0 0-1.237 0l.309.95-.31-.95-6.653 2.162v-6.996a2 2 0 0 0-.381-1.176Z" />
    </GeoIcon>
  ),
  rhombus: (
    <GeoIcon>
      <path d="M24.229 3a2 2 0 0 1 1.949 2.45l-4.616 20A2 2 0 0 1 19.613 27H5.771a2 2 0 0 1-1.949-2.45l4.616-20A2 2 0 0 1 10.386 3z" />
    </GeoIcon>
  ),
  'rhombus-2': (
    <GeoIcon>
      <path d="M5.771 3a2 2 0 0 0-1.949 2.45l4.616 20A2 2 0 0 0 10.386 27H24.23a2 2 0 0 0 1.949-2.45l-4.616-20A2 2 0 0 0 19.613 3z" />
    </GeoIcon>
  ),
  oval: (
    <GeoIcon>
      <path d="M15 3c4.852 0 8 3.821 8 8.817v6.366C23 23.18 19.852 27 15 27c-4.82 0-7.948-3.771-8-8.723v-6.46C7 6.82 10.148 3 15 3Z" />
    </GeoIcon>
  ),
  trapezoid: (
    <GeoIcon>
      <path d="M19.614 3a2 2 0 0 1 1.948 1.55l4.616 20a2 2 0 0 1-1.95 2.45H5.772a2 2 0 0 1-1.949-2.45l4.616-20A2 2 0 0 1 10.386 3z" />
    </GeoIcon>
  ),
  cloud: (
    <GeoIcon>
      <path d="m22.324 12.395.02.863.857.105a5.861 5.861 0 0 1-.724 11.676H7.524a5.86 5.86 0 0 1-.725-11.676l.857-.105.02-.863a7.326 7.326 0 0 1 14.648 0Z" />
    </GeoIcon>
  ),
  heart: (
    <GeoIcon>
      <path d="M2 10.118C2 .954 14.025.954 15 8.31c.975-7.355 13-7.355 13 1.81C28 17.955 18.25 20.97 15 27c-3.25-6.03-13-9.044-13-16.882" />
    </GeoIcon>
  ),
  'x-box': (
    <GeoIcon>
      <path d="M25 3a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 3l24 24M27 3 3 27" />
    </GeoIcon>
  ),
  'check-box': (
    <GeoIcon>
      <path d="M25 3a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="m8 15 5 7M22 8l-9 14" />
    </GeoIcon>
  ),
  'arrow-right': (
    <GeoIcon>
      <path d="M27 14.823 12.835 3.168a1 1 0 0 0-1.635.772v4.083H3v13.6h8.2v4.082a1 1 0 0 0 1.635.772z" />
    </GeoIcon>
  ),
  'arrow-left': (
    <GeoIcon>
      <path d="m3 14.823 14.165 11.654a1 1 0 0 0 1.635-.772v-4.082H27v-13.6h-8.2V3.94a1 1 0 0 0-1.635-.772z" />
    </GeoIcon>
  ),
  'arrow-up': (
    <GeoIcon>
      <path d="M15 2.823 3.346 16.987a1 1 0 0 0 .772 1.636H8.2v8.2h13.6v-8.2h4.082a1 1 0 0 0 .772-1.636z" />
    </GeoIcon>
  ),
  'arrow-down': (
    <GeoIcon>
      <path d="m15 26.823 11.654-14.165a1 1 0 0 0-.772-1.635H21.8v-8.2H8.2v8.2H4.118a1 1 0 0 0-.772 1.635z" />
    </GeoIcon>
  ),
}
