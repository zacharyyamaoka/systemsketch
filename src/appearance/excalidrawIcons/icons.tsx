// Vendored glyphs — see ./NOTICE.md for full attribution (Excalidraw MIT,
// Font Awesome, Tabler Icons). Do not hand-edit a path; re-copy from the
// upstream source referenced in NOTICE.md instead.
//
// Ported from /home/bam/excalidraw-reference/packages/excalidraw/components/icons.tsx
// (only the exports the floating toolbar needs — verbatim SVG paths, `theme`
// plumbing dropped, `var(--icon-fill-color)` replaced with `currentColor`).
import { createIcon, modifiedTablerIconProps, tablerIconProps, arrowheadPreviewIconProps } from './createIcon'

// -----------------------------------------------------------------------------
// Fill (source L1058-1157)
// -----------------------------------------------------------------------------

export const FillZigZagIcon = createIcon(
  <g strokeWidth={1.25}>
    <path d="M5.879 2.625h8.242a3.27 3.27 0 0 1 3.254 3.254v8.242a3.27 3.27 0 0 1-3.254 3.254H5.88a3.27 3.27 0 0 1-3.254-3.254V5.88A3.27 3.27 0 0 1 5.88 2.626l-.001-.001ZM4.518 16.118l7.608-12.83m.198 13.934 5.051-9.897M2.778 9.675l9.348-6.387m-7.608 12.83 12.857-8.793" />
  </g>,
  modifiedTablerIconProps,
)

export const FillHachureIcon = createIcon(
  <>
    <path
      d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
      stroke="currentColor"
      strokeWidth="1.25"
    />
    <mask
      id="FillHachureIcon"
      style={{ maskType: 'alpha' }}
      maskUnits="userSpaceOnUse"
      x={2}
      y={2}
      width={16}
      height={16}
    >
      <path
        d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </mask>
    <g mask="url(#FillHachureIcon)">
      <path
        d="M2.258 15.156 15.156 2.258M7.324 20.222 20.222 7.325m-20.444 5.35L12.675-.222m-8.157 18.34L17.416 5.22"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </>,
  modifiedTablerIconProps,
)

export const FillCrossHatchIcon = createIcon(
  <>
    <g clipPath="url(#FillCrossHatchIconClip)">
      <path
        d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <mask
        id="FillCrossHatchIcon"
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x={-1}
        y={-1}
        width={22}
        height={22}
      >
        <path
          d="M2.426 15.044 15.044 2.426M7.383 20 20 7.383M0 12.617 12.617 0m-7.98 17.941L17.256 5.324m-2.211 12.25L2.426 4.956M20 12.617 7.383 0m5.234 20L0 7.383m17.941 7.98L5.324 2.745"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <g mask="url(#FillCrossHatchIcon)">
        <path
          d="M14.121 2H5.88A3.879 3.879 0 0 0 2 5.879v8.242A3.879 3.879 0 0 0 5.879 18h8.242A3.879 3.879 0 0 0 18 14.121V5.88A3.879 3.879 0 0 0 14.121 2Z"
          fill="currentColor"
        />
      </g>
    </g>
    <defs>
      <clipPath id="FillCrossHatchIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const FillSolidIcon = createIcon(
  <>
    <g clipPath="url(#FillSolidIconClip)">
      <path
        d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </g>
    <defs>
      <clipPath id="FillSolidIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  { ...modifiedTablerIconProps, fill: 'currentColor' },
)

// -----------------------------------------------------------------------------
// Stroke width (source L1160-1192)
// -----------------------------------------------------------------------------

export const StrokeWidthBaseIcon = createIcon(
  <path
    d="M4.167 10h11.666"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  modifiedTablerIconProps,
)

export const StrokeWidthBoldIcon = createIcon(
  <path
    d="M5 10h10"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  modifiedTablerIconProps,
)

export const StrokeWidthExtraBoldIcon = createIcon(
  <path
    d="M5 10h10"
    stroke="currentColor"
    strokeWidth="3.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  modifiedTablerIconProps,
)

// -----------------------------------------------------------------------------
// Stroke style (source L1195-1232)
//
// WHY StrokeStyleSolidIcon is an alias, not a fourth glyph: upstream
// Excalidraw ships a dedicated `StrokeStyleSolidIcon` (a themed React.memo
// drawing a bare line at source L1195), but its own solid-stroke-style radio
// button (actionProperties.tsx L865) reuses `StrokeWidthBaseIcon` instead —
// confirmed by reading that call site directly. This module follows what
// Excalidraw actually draws for "solid", not the unused sibling export, so
// the alias below is Excalidraw's own choice, not an invented shortcut.
// -----------------------------------------------------------------------------

export const StrokeStyleSolidIcon = StrokeWidthBaseIcon

export const StrokeStyleDashedIcon = createIcon(
  <g strokeWidth="2">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 12h2" />
    <path d="M17 12h2" />
    <path d="M11 12h2" />
  </g>,
  tablerIconProps,
)

// tabler-icons: line-dotted
export const StrokeStyleDottedIcon = createIcon(
  <g strokeWidth="2">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 12v.01" />
    <path d="M8 12v.01" />
    <path d="M12 12v.01" />
    <path d="M16 12v.01" />
    <path d="M20 12v.01" />
  </g>,
  tablerIconProps,
)

// -----------------------------------------------------------------------------
// Sloppiness — Excalidraw's three-level "roughness". Vendored for completeness
// per the icon-vendoring plan; tldraw@5.3.2 has exactly one 'draw' mode, so
// only one of these three is expected to see use (wave 2's call, not this
// module's). Source L1234-1256.
// -----------------------------------------------------------------------------

export const SloppinessArchitectIcon = createIcon(
  <path
    d="M2.5 12.038c1.655-.885 5.9-3.292 8.568-4.354 2.668-1.063.101 2.821 1.32 3.104 1.218.283 5.112-1.814 5.112-1.814"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
)

export const SloppinessArtistIcon = createIcon(
  <path
    d="M2.5 12.563c1.655-.886 5.9-3.293 8.568-4.355 2.668-1.062.101 2.822 1.32 3.105 1.218.283 5.112-1.814 5.112-1.814m-13.469 2.23c2.963-1.586 6.13-5.62 7.468-4.998 1.338.623-1.153 4.11-.132 5.595 1.02 1.487 6.133-1.43 6.133-1.43"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
)

export const SloppinessCartoonistIcon = createIcon(
  <path
    d="M2.5 11.936c1.737-.879 8.627-5.346 10.42-5.268 1.795.078-.418 5.138.345 5.736.763.598 3.53-1.789 4.235-2.147M2.929 9.788c1.164-.519 5.47-3.28 6.987-3.114 1.519.165 1 3.827 2.121 4.109 1.122.281 3.839-2.016 4.606-2.42"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
)

// -----------------------------------------------------------------------------
// Edges — vendored for completeness per the plan (geo-shape roundness is out
// of scope for this track: tldraw@5.3.2 geo has no roundness prop). Source
// L1326-1362.
// -----------------------------------------------------------------------------

export const EdgeSharpIcon = createIcon(
  <svg strokeWidth="1.5">
    <path d="M3.33334 9.99998V6.66665C3.33334 6.04326 3.33403 4.9332 3.33539 3.33646C4.95233 3.33436 6.06276 3.33331 6.66668 3.33331H10" />
    <path d="M13.3333 3.33331V3.34331" />
    <path d="M16.6667 3.33331V3.34331" />
    <path d="M16.6667 6.66669V6.67669" />
    <path d="M16.6667 10V10.01" />
    <path d="M3.33334 13.3333V13.3433" />
    <path d="M16.6667 13.3333V13.3433" />
    <path d="M3.33334 16.6667V16.6767" />
    <path d="M6.66666 16.6667V16.6767" />
    <path d="M10 16.6667V16.6767" />
    <path d="M13.3333 16.6667V16.6767" />
    <path d="M16.6667 16.6667V16.6767" />
  </svg>,
  modifiedTablerIconProps,
)

// tabler-icons: border-radius
export const EdgeRoundIcon = createIcon(
  <g
    strokeWidth="1.5"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 12v-4a4 4 0 0 1 4 -4h4" />
    <line x1="16" y1="4" x2="16" y2="4.01" />
    <line x1="20" y1="4" x2="20" y2="4.01" />
    <line x1="20" y1="8" x2="20" y2="8.01" />
    <line x1="20" y1="12" x2="20" y2="12.01" />
    <line x1="4" y1="16" x2="4" y2="16.01" />
    <line x1="20" y1="16" x2="20" y2="16.01" />
  </g>,
  tablerIconProps,
)

// -----------------------------------------------------------------------------
// Arrowheads — React.memo COMPONENTS taking a `flip` prop (they mirror the
// preview for the start-of-line side), not static glyphs. Source L1369-1517;
// the six cardinality icons (L1519-1615) are skipped per the plan — tldraw
// has no cardinality-notation arrowheads to map them to.
// -----------------------------------------------------------------------------

interface ArrowheadIconProps {
  flip?: boolean
}

export const ArrowheadNoneIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      stroke="currentColor"
      opacity={0.3}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    >
      <path d="M7,11 H19" />
      <path d="M25,6 L33,16 M33,6 L25,16" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadArrowIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      stroke="currentColor"
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7,11 H33 M23,5 L33,11 L23,17" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadTriangleIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="currentColor"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      strokeLinejoin="round"
    >
      <path d="M7,11 H23" strokeWidth={2} strokeLinecap="round" />
      <path d="M23,5 L35,11 L23,17 Z" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadTriangleOutlineIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="none"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M7,11 H23" />
      <path d="M23,5 L35,11 L23,17 Z" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadCircleIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="currentColor"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
    >
      <path d="M7,11 H25" strokeWidth={2} strokeLinecap="round" />
      <circle cx="29" cy="11" r="4" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadCircleOutlineIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="none"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      strokeWidth={2}
    >
      <path d="M7,11 H25" strokeLinecap="round" />
      <circle cx="29" cy="11" r="4" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadDiamondIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="currentColor"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      strokeLinejoin="round"
    >
      <path d="M7,11 H21" strokeWidth={2} strokeLinecap="round" />
      <path d="M21,11 L28,5 L35,11 L28,17 Z" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadDiamondOutlineIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      stroke="currentColor"
      fill="none"
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      strokeLinejoin="round"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M7,11 H21" />
      <path d="M21,11 L28,5 L35,11 L28,17 Z" />
    </g>,
    arrowheadPreviewIconProps,
  )

export const ArrowheadBarIcon = ({ flip = false }: ArrowheadIconProps) =>
  createIcon(
    <g
      transform={flip ? 'translate(40, 0) scale(-1, 1)' : ''}
      stroke="currentColor"
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    >
      <path d="M11,11 H31 M31,5 V17" />
    </g>,
    arrowheadPreviewIconProps,
  )

// -----------------------------------------------------------------------------
// Font size (source L1617-1687)
// -----------------------------------------------------------------------------

export const FontSizeSmallIcon = createIcon(
  <>
    <g clipPath="url(#FontSizeSmallIconClip)">
      <path
        d="M14.167 6.667a3.333 3.333 0 0 0-3.334-3.334H9.167a3.333 3.333 0 0 0 0 6.667h1.666a3.333 3.333 0 0 1 0 6.667H9.167a3.333 3.333 0 0 1-3.334-3.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="FontSizeSmallIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const FontSizeMediumIcon = createIcon(
  <>
    <g clipPath="url(#FontSizeMediumIconClip)">
      <path
        d="M5 16.667V3.333L10 15l5-11.667v13.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="FontSizeMediumIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const FontSizeLargeIcon = createIcon(
  <>
    <g clipPath="url(#FontSizeLargeIconClip)">
      <path
        d="M5.833 3.333v13.334h8.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="FontSizeLargeIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const FontSizeExtraLargeIcon = createIcon(
  <>
    <path
      d="m1.667 3.333 6.666 13.334M8.333 3.333 1.667 16.667M11.667 3.333v13.334h6.666"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>,
  modifiedTablerIconProps,
)

// -----------------------------------------------------------------------------
// Text align (source L1750-1849). Top/Middle/Bottom (vertical align) took an
// unused `theme` prop upstream (the body never reads it, since the stroke is
// already `currentColor`) — dropped here rather than ported dead.
// -----------------------------------------------------------------------------

export const TextAlignLeftIcon = createIcon(
  <g
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="12" x2="12" y2="12" />
    <line x1="4" y1="16" x2="16" y2="16" />
  </g>,
  tablerIconProps,
)

export const TextAlignCenterIcon = createIcon(
  <g
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="6" y1="16" x2="18" y2="16" />
  </g>,
  tablerIconProps,
)

export const TextAlignRightIcon = createIcon(
  <g
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="8" y1="16" x2="20" y2="16" />
  </g>,
  tablerIconProps,
)

// tabler-icons: layout-align-top
export const TextAlignTopIcon = createIcon(
  <g
    strokeWidth="1.5"
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="4" x2="20" y2="4" />
    <rect x="9" y="8" width="6" height="12" rx="2" />
  </g>,
  tablerIconProps,
)

// tabler-icons: layout-align-bottom
export const TextAlignBottomIcon = createIcon(
  <g
    strokeWidth="2"
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="9" y="4" width="6" height="12" rx="2" />
  </g>,
  tablerIconProps,
)

// tabler-icons: layout-align-middle
export const TextAlignMiddleIcon = createIcon(
  <g
    strokeWidth="1.5"
    stroke="currentColor"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="20" y2="12" />
    <rect x="9" y="6" width="6" height="12" rx="2" />
  </g>,
  tablerIconProps,
)

// -----------------------------------------------------------------------------
// Z-order and arrange (source L761-936). The four z-order icons share one JSX
// path rotated 180° via a `style.transform` override — vendored as that one
// shared shape, not four flattened copies.
// -----------------------------------------------------------------------------

const arrowBarToTopJSX = (
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M12 10l0 10" />
    <path d="M12 10l4 4" />
    <path d="M12 10l-4 4" />
    <path d="M4 4l16 0" />
  </g>
)

const arrowNarrowUpJSX = (
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M12 5l0 14" />
    <path d="M16 9l-4 -4" />
    <path d="M8 9l4 -4" />
  </g>
)

export const BringForwardIcon = createIcon(arrowNarrowUpJSX, tablerIconProps)

export const SendBackwardIcon = createIcon(arrowNarrowUpJSX, {
  ...tablerIconProps,
  style: { transform: 'rotate(180deg)' },
})

export const BringToFrontIcon = createIcon(arrowBarToTopJSX, tablerIconProps)

export const SendToBackIcon = createIcon(arrowBarToTopJSX, {
  ...tablerIconProps,
  style: { transform: 'rotate(180deg)' },
})

// Align action icons, matching the z-index actions' visual weight. Vertical
// align icons are flipped so the larger item is always the first one the user
// sees; horizontal align icons are not (that would make them lie about their
// function) — this asymmetry is upstream's own comment (source L798-802).

export const AlignTopIcon = createIcon(
  <>
    <g clipPath="url(#AlignTopIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M3.333 3.333h13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.542 6.458h-.417c-.92 0-1.667.747-1.667 1.667v7.083c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.746 1.666-1.667V8.125c0-.92-.746-1.667-1.666-1.667ZM6.875 6.458h-.417c-.92 0-1.666.747-1.666 1.667v3.75c0 .92.746 1.667 1.666 1.667h.417c.92 0 1.667-.746 1.667-1.667v-3.75c0-.92-.747-1.667-1.667-1.667Z" />
    </g>
    <defs>
      <clipPath id="AlignTopIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const AlignBottomIcon = createIcon(
  <>
    <g clipPath="url(#AlignBottomIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M3.333 16.667h13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.875 3.125h-.417c-.92 0-1.666.746-1.666 1.667v7.083c0 .92.746 1.667 1.666 1.667h.417c.92 0 1.667-.746 1.667-1.667V4.792c0-.92-.747-1.667-1.667-1.667ZM13.542 5.817h-.417c-.92 0-1.667.747-1.667 1.667v4.391c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.746 1.666-1.667V7.484c0-.92-.746-1.667-1.666-1.667Z" />
    </g>
    <defs>
      <clipPath id="AlignBottomIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const AlignLeftIcon = createIcon(
  <>
    <g clipPath="url(#AlignLeftIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M3.333 3.333v13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.208 4.792H8.125c-.92 0-1.667.746-1.667 1.666v.417c0 .92.747 1.667 1.667 1.667h7.083c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666ZM12.516 11.458H8.125c-.92 0-1.667.746-1.667 1.667v.417c0 .92.747 1.666 1.667 1.666h4.391c.92 0 1.667-.746 1.667-1.666v-.417c0-.92-.746-1.667-1.667-1.667Z" />
    </g>
    <defs>
      <clipPath id="AlignLeftIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const AlignRightIcon = createIcon(
  <>
    <g clipPath="url(#AlignRightIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M16.667 3.333v13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.875 4.792H4.792c-.92 0-1.667.746-1.667 1.666v.417c0 .92.746 1.667 1.667 1.667h7.083c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666ZM11.683 11.458H7.292c-.92 0-1.667.746-1.667 1.667v.417c0 .92.746 1.666 1.667 1.666h4.39c.921 0 1.667-.746 1.667-1.666v-.417c0-.92-.746-1.667-1.666-1.667Z" />
    </g>
    <defs>
      <clipPath id="AlignRightIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const DistributeHorizontallyIcon = createIcon(
  <>
    <g clipPath="url(#DistributeHorizontallyIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M16.667 3.333v13.334M3.333 3.333v13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.375 10.208v-.416c0-.92-.746-1.667-1.667-1.667H7.292c-.92 0-1.667.746-1.667 1.667v.416c0 .92.746 1.667 1.667 1.667h5.416c.92 0 1.667-.746 1.667-1.667Z" />
    </g>
    <defs>
      <clipPath id="DistributeHorizontallyIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const DistributeVerticallyIcon = createIcon(
  <>
    <g clipPath="url(#DistributeVerticallyIconClip)" stroke="currentColor" strokeWidth="1.25">
      <path d="M3.333 3.333h13.334M3.333 16.667h13.334" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.208 5.625h-.416c-.92 0-1.667.746-1.667 1.667v5.416c0 .92.746 1.667 1.667 1.667h.416c.92 0 1.667-.746 1.667-1.667V7.292c0-.92-.746-1.667-1.667-1.667Z" />
    </g>
    <defs>
      <clipPath id="DistributeVerticallyIconClip">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
)

export const CenterVerticallyIcon = createIcon(
  <g stroke="currentColor" strokeWidth="1.25">
    <path d="M1.667 10h2.916" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.333 10h3.334" strokeLinejoin="round" />
    <path d="M15.417 10h2.916" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.875 4.792h-.417c-.92 0-1.666.746-1.666 1.666v7.084c0 .92.746 1.666 1.666 1.666h.417c.92 0 1.667-.746 1.667-1.666V6.458c0-.92-.747-1.666-1.667-1.666ZM13.542 6.458h-.417c-.92 0-1.667.747-1.667 1.667v3.75c0 .92.746 1.667 1.667 1.667h.417c.92 0 1.666-.746 1.666-1.667v-3.75c0-.92-.746-1.667-1.666-1.667Z" />
  </g>,
  modifiedTablerIconProps,
)

export const CenterHorizontallyIcon = createIcon(
  <g stroke="currentColor" strokeWidth="1.25">
    <path d="M10 18.333v-2.916" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 11.667V8.333" strokeLinejoin="round" />
    <path d="M10 4.583V1.667" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.792 13.125v.417c0 .92.746 1.666 1.666 1.666h7.084c.92 0 1.666-.746 1.666-1.666v-.417c0-.92-.746-1.667-1.666-1.667H6.458c-.92 0-1.666.746-1.666 1.667ZM6.458 6.458v.417c0 .92.747 1.667 1.667 1.667h3.75c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666h-3.75c-.92 0-1.667.746-1.667 1.666Z" />
  </g>,
  modifiedTablerIconProps,
)

// -----------------------------------------------------------------------------
// Arrow type (source L2390-2416, all Excalidraw-modified Tabler glyphs)
// -----------------------------------------------------------------------------

// arrow-up-right (modified)
export const sharpArrowIcon = createIcon(
  <g>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 18l12 -12" />
    <path d="M18 10v-4h-4" />
  </g>,
  tablerIconProps,
)

// arrow-guide (modified)
export const elbowArrowIcon = createIcon(
  <g>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4,19L10,19C11.097,19 12,18.097 12,17L12,9C12,7.903 12.903,7 14,7L21,7" />
    <path d="M18 4l3 3l-3 3" />
  </g>,
  tablerIconProps,
)

// arrow-ramp-right-2 (heavily modified)
export const roundArrowIcon = createIcon(
  <g>
    <path d="M16,12L20,9L16,6" />
    <path d="M6 20c0 -6.075 4.925 -11 11 -11h3" />
  </g>,
  tablerIconProps,
)
