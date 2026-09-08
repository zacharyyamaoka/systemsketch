import type { ComponentType, ReactElement, ReactNode } from 'react'
import { useValue, type Editor } from 'tldraw'

import type {
  AppearanceControlId,
  ContextualControl,
  ContextualGlyphFamily,
} from '../contextualMenus/contextualControlRegistry'
import { FIGJAM_ICONS } from './figjamIcons'
import { STROKE_WIDTH_PX, strokeWidthPxForRung } from './strokeMeta'
import { FIGJAM_TRIGGER_ICON, figjamIconName } from './figjamIconMap'
import {
  ArrowheadArrowIcon,
  ArrowheadBarIcon,
  ArrowheadCircleIcon,
  ArrowheadDiamondIcon,
  ArrowheadNoneIcon,
  ArrowheadTriangleIcon,
  elbowArrowIcon,
  FillHachureIcon,
  FillSolidIcon,
  FontSizeExtraLargeIcon,
  FontSizeLargeIcon,
  FontSizeMediumIcon,
  FontSizeSmallIcon,
  roundArrowIcon,
  sharpArrowIcon,
  SloppinessArtistIcon,
  StrokeStyleDashedIcon,
  StrokeStyleDottedIcon,
  StrokeStyleSolidIcon,
  StrokeWidthBaseIcon,
  StrokeWidthBoldIcon,
  StrokeWidthExtraBoldIcon,
  TextAlignBottomIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignMiddleIcon,
  TextAlignRightIcon,
  TextAlignTopIcon,
} from './excalidrawIcons/icons'

interface GlyphFamilyRenderer {
  /**
   * This family always draws its own preview, even for a value FigJam has a
   * traced icon for (the typeface wordmarks lost to the compact Aa; a colour
   * is its swatch).
   */
  ownDrawing?: boolean
  render(value: string | undefined, editor: Editor): ReactNode
}

/**
 * Every way a value can be previewed, keyed by the registry's `glyph` field.
 *
 * WHY a lookup instead of a kind if-chain: a control's KIND is its identity;
 * how its values are drawn is a separate, shareable fact the registry entry
 * declares. Dispatching on kinds is how `connectionRouting` once missed the
 * routing branch and had its options drawn by the arrowhead renderer. A new
 * registry entry that previews like an existing one names its family and
 * touches nothing here; only a genuinely new drawing earns a new entry.
 */
const GLYPH_FAMILIES: Record<ContextualGlyphFamily, GlyphFamilyRenderer> = {
  swatch: { ownDrawing: true, render: (value, editor) => <ColorSwatch editor={editor} name={value} /> },
  font: { ownDrawing: true, render: (value) => <FontGlyph value={value} /> },
  fill: { render: (value) => <FillGlyph value={value} /> },
  geo: { render: (value) => <GeoGlyph value={value} /> },
  dash: { render: (value) => <DashGlyph value={value} /> },
  size: { render: (value) => <SizeGlyph value={value} /> },
  strokeWidth: { render: (value) => <StrokeWidthGlyph value={value} /> },
  align: { render: (value) => <AlignGlyph value={value} /> },
  verticalAlign: { render: (value) => <AlignGlyph value={value} vertical /> },
  lineShape: { render: (value) => <RoutingGlyph value={value} /> },
  arrowheadStart: { render: (value) => <ArrowheadGlyph value={value} atStart /> },
  arrowheadEnd: { render: (value) => <ArrowheadGlyph value={value} /> },
}

/**
 * Excalidraw's vendored glyphs, exactly where Zach asked for them: "use the
 * excalidraw icons exactly for showing things like line styling, line
 * thickness, etc, so we don't need to reinvent another visual icon grammar."
 *
 * This is a SECOND lookup layer, keyed the same way `GLYPH_FAMILIES` is (by
 * `ContextualGlyphFamily`), but narrower on purpose: only the value/family
 * combinations named in the icon-vendoring plan get a vendored glyph. Every
 * value absent from a family's map here keeps whatever it already drew —
 * FigJam's traced icon where one exists, or this file's own drawn glyph
 * otherwise — because inventing an Excalidraw-styled glyph for a state
 * Excalidraw has no icon for (tldraw's `semi`/`none` fill, `inverted`/
 * `square`/`pipe` arrowheads, `async`) would be worse than the honest
 * mismatch the truthful-rendering rule already accepts elsewhere in this
 * file. `size` is looked up too, but only reached outside the Font size
 * LIST layout below — the list's rows stay glyph-free on purpose (each row
 * previews itself at its own size; see the dispatcher).
 */
const EXCALIDRAW_GLYPHS: Partial<Record<ContextualGlyphFamily, Readonly<Record<string, ReactNode>>>> = {
  fill: { solid: FillSolidIcon, pattern: FillHachureIcon },
  dash: {
    draw: SloppinessArtistIcon,
    solid: StrokeStyleSolidIcon,
    dashed: StrokeStyleDashedIcon,
    dotted: StrokeStyleDottedIcon,
  },
  strokeWidth: {
    thin: StrokeWidthBaseIcon,
    medium: StrokeWidthBoldIcon,
    thick: StrokeWidthExtraBoldIcon,
  },
  size: {
    s: FontSizeSmallIcon,
    m: FontSizeMediumIcon,
    l: FontSizeLargeIcon,
    xl: FontSizeExtraLargeIcon,
  },
  align: {
    start: TextAlignLeftIcon,
    middle: TextAlignCenterIcon,
    end: TextAlignRightIcon,
  },
  verticalAlign: {
    start: TextAlignTopIcon,
    middle: TextAlignMiddleIcon,
    end: TextAlignBottomIcon,
  },
  lineShape: {
    elbow: elbowArrowIcon,
    curve: roundArrowIcon,
    straight: sharpArrowIcon,
  },
}

/**
 * The arrowhead values Excalidraw draws, as flip-aware components rather than
 * fixed nodes — `flip` mirrors the glyph for the start side, matching
 * `createIcon.tsx`'s `ArrowheadIconProps` contract. `inverted`, `square` and
 * `pipe` have no Excalidraw analog (the plan's own exclusion list) and are
 * left out, so they fall through to FigJam's traced icon or this file's drawn
 * `ArrowheadGlyph`, exactly as before.
 */
const EXCALIDRAW_ARROWHEADS: Readonly<Record<string, ComponentType<{ flip?: boolean }>>> = {
  none: ArrowheadNoneIcon,
  arrow: ArrowheadArrowIcon,
  triangle: ArrowheadTriangleIcon,
  diamond: ArrowheadDiamondIcon,
  dot: ArrowheadCircleIcon,
  bar: ArrowheadBarIcon,
}

/**
 * A vendored icon wrapped for this app's 24px option-cell grid.
 *
 * `createIcon` never sets a `width`/`height` DOM attribute (only a `viewBox`
 * — see `createIcon.tsx`), so an unstyled vendored `<svg>` renders at the
 * browser's intrinsic default and blows out the pill. This class-only wrapper
 * gives it the same box every drawn glyph already sits in
 * (`.systemsketch-appearance__glyph`), sized in `appearance.css`; a
 * non-square source (the 40x20 arrowhead preview strip) letterboxes inside
 * the square cell via the SVG's own default `preserveAspectRatio`, rather
 * than stretching.
 */
function ExcalidrawGlyph({ children }: { children: ReactNode }) {
  return (
    <span
      className="systemsketch-appearance__glyph systemsketch-appearance__glyph--excalidraw"
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/** The vendored glyph for an ordinary (non-arrowhead) family/value pair, if one is mapped. */
function excalidrawGlyphFor(
  family: ContextualGlyphFamily | undefined,
  value: string | undefined,
): ReactNode | undefined {
  if (!family || value === undefined) return undefined
  return EXCALIDRAW_GLYPHS[family]?.[value]
}

/** The vendored, flip-aware arrowhead component for a value, if one is mapped. */
function excalidrawArrowheadFor(value: string | undefined): ComponentType<{ flip?: boolean }> | undefined {
  return value === undefined ? undefined : EXCALIDRAW_ARROWHEADS[value]
}

/**
 * tldraw's `oval` geo is a distinct, wider shape from `ellipse` (see
 * `node_modules/@tldraw/assets/icons/icon/geo-oval.svg` vs. `geo-ellipse.svg`),
 * but `figjamIconMap`'s `geo` table used to point both at FigJam's traced
 * `shape/Ellipse` icon — FigJam's own picker draws them identically, so the
 * trace was faithful to FigJam, just wrong for tldraw's shape set. Rather than
 * hand-adding a fabricated entry to `figjamIcons.ts` (every entry there is
 * documented as traced from the real app, re-run by an emitter — mixing in an
 * invented one breaks that guarantee), this is a small original glyph: a ring
 * drawn from two concentric ellipses (rx 8/ry 5 outer, rx 7/ry 4 inner) at the
 * same 18x18 box and ~1px ring weight as the traced glyphs beside it, so it
 * sits in the pill without announcing itself as different machinery.
 */
const OVAL_RING_PATH = 'M1 9A8 5 0 1 0 17 9A8 5 0 1 0 1 9ZM2 9A7 4 0 1 0 16 9A7 4 0 1 0 2 9Z'

/**
 * What an appearance option looks like.
 *
 * FigJam previews the value rather than naming it — the size list is drawn at
 * each size, the line endings are drawn as lines, the colours are circles.
 * Dispatch is data: the registry names each control's `glyph` family, FigJam's
 * traced icon substitutes wherever one exists for the value, and a control
 * with no family draws nothing (its label or row is the preview).
 */
export function AppearanceGlyph({
  control, value, editor,
}: {
  control: ContextualControl
  value: string | undefined
  editor: Editor
}) {
  const family = control.glyph ? GLYPH_FAMILIES[control.glyph] : undefined
  if (family?.ownDrawing) return family.render(value, editor)
  // FigJam's Font size list draws no glyph: each row is its own name, at its
  // own size, and the label carries that. (The same `size` family still draws
  // its bars where the layout is a compact row — the connector's weight.)
  if (control.glyph === 'size' && control.layout === 'list') return null
  // Excalidraw's own vendored glyph, wherever the icon-vendoring plan names
  // one for this family/value — see `EXCALIDRAW_GLYPHS` and
  // `EXCALIDRAW_ARROWHEADS` above for exactly which values these are. This
  // OUTRANKS FigJam's traced icon below: Zach's explicit ask is Excalidraw's
  // own glyphs for these controls, not FigJam's redrawn ones.
  if (control.glyph === 'arrowheadStart' || control.glyph === 'arrowheadEnd') {
    const ArrowheadIcon = excalidrawArrowheadFor(value)
    if (ArrowheadIcon) {
      // Excalidraw draws one arrowhead set pointing at its terminal (unflipped)
      // side; the start control mirrors it, same convention as FigJam's own
      // traced pair below.
      return <ExcalidrawGlyph><ArrowheadIcon flip={control.glyph === 'arrowheadStart'} /></ExcalidrawGlyph>
    }
  } else {
    const excalidraw = excalidrawGlyphFor(control.glyph, value)
    if (excalidraw) return <ExcalidrawGlyph>{excalidraw}</ExcalidrawGlyph>
  }
  // tldraw's `oval` is a distinct geo from `ellipse` — see OVAL_RING_PATH's
  // comment. Ahead of the FigJam lookup below, which has no icon of its own
  // for this distinction.
  if (control.kind === 'geo' && value === 'oval') {
    return (
      <svg viewBox="0 0 18 18" className="systemsketch-appearance__glyph" data-filled="" aria-hidden="true">
        <path d={OVAL_RING_PATH} fillRule="evenodd" />
      </svg>
    )
  }
  // FigJam's own icon wherever FigJam draws this value. The drawn families
  // below stay for the states tldraw has and FigJam does not.
  const figjam = figjamIconName(control.kind as AppearanceControlId, value)
  if (figjam && FIGJAM_ICONS[figjam]) {
    // FigJam draws one arrowhead set and mirrors it for the far end, so the
    // icon always points the way the arrow travels. The traced paths are the
    // start orientation; the end control flips them.
    return <FigjamGlyph name={figjam} flipped={control.glyph === 'arrowheadEnd'} />
  }
  return family ? family.render(value, editor) : null
}

/**
 * What the trigger shows. Line style and Typeface show one fixed icon whatever
 * the value — FigJam's three bars, FigJam's `Aa` — and everything else shows
 * the current value the way its popover draws it.
 */
export function TriggerGlyph({
  control, value, editor,
}: {
  control: ContextualControl
  value: string | undefined
  editor: Editor
}) {
  const fixed = control.trigger === 'icon' ? FIGJAM_TRIGGER_ICON[control.kind] : undefined
  if (fixed && FIGJAM_ICONS[fixed]) return <FigjamGlyph name={fixed} />
  return <AppearanceGlyph control={control} value={value} editor={editor} />
}

/**
 * One of FigJam's traced icons, drawn at its own viewBox.
 *
 * FigJam's icons are filled paths, not strokes, so this sets `data-filled` and
 * lets the stylesheet paint them with `currentColor` — the same way FigJam
 * paints its own with a CSS variable.
 */
export function FigjamGlyph({
  name, flipped, className, role,
}: {
  name: string
  flipped?: boolean
  className?: string
  role?: string
}) {
  const icon = FIGJAM_ICONS[name]
  // FigJam's control icons are square; its typeface icons are the word drawn in
  // that face, and are much wider than tall. Letterboxing a 47x10 word into a
  // 24px square would shrink it to nothing, so a wide icon keeps its own ratio.
  const [, , width, height] = icon.viewBox.split(' ').map(Number)
  const wide = width > height * 1.2
  return (
    <svg
      viewBox={icon.viewBox}
      className={className ?? 'systemsketch-appearance__glyph'}
      data-filled=""
      data-natural={wide ? '' : undefined}
      data-flipped={flipped ? '' : undefined}
      data-icon={name}
      data-role={role}
      style={wide ? { width: `${(width / height) * 14}px`, height: '14px' } : undefined}
      aria-hidden="true"
    >
      {icon.paths.map((path, index) => (
        <path key={index} d={path.d} fillRule={path.rule as 'evenodd' | 'nonzero' | undefined} />
      ))}
    </svg>
  )
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="systemsketch-appearance__glyph" aria-hidden="true">
      {children}
    </svg>
  )
}

function ColorSwatch({ editor, name }: { editor: Editor; name: string | undefined }) {
  const fill = useValue(
    'systemsketch appearance swatch',
    () => {
      if (!name) return undefined
      // The theme map also carries flat UI colours, so read it loosely and
      // take `.solid` only where a shape colour actually provides one.
      const colors = editor.getCurrentTheme().colors[editor.getColorMode()] as
        unknown as Record<string, { solid?: string } | string | undefined>
      const entry = colors[name]
      return typeof entry === 'object' ? entry?.solid : undefined
    },
    [editor, name],
  )
  return (
    <span
      className="systemsketch-appearance__swatch"
      data-mixed={fill ? undefined : true}
      style={fill ? { background: fill } : undefined}
    />
  )
}

/** The fill treatments, drawn on the same square so they can be compared. */
function FillGlyph({ value }: { value: string | undefined }) {
  const box = <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
  if (value === 'none') return <Svg>{box}</Svg>
  if (value === 'pattern' || value === 'lined-fill') {
    const lines = value === 'pattern'
      ? ['M4 12l8-8', 'M4 16l12-12', 'M8 16l8-8']
      : ['M4 8h12', 'M4 11.5h12', 'M4 15h12']
    return <Svg>{box}{lines.map((d) => <path key={d} d={d} strokeWidth={1} />)}</Svg>
  }
  // The glyph says what the fill does: Solid is fully painted, Transparent is
  // a wash you can read through. Both match `fillPaint.TRANSPARENT_FILL_ALPHA`
  // closely enough to be recognised in a 16px cell.
  const opacity = value === 'semi' ? 0.35 : 1
  return (
    <Svg>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" data-role="solid" opacity={opacity} />
      {box}
    </Svg>
  )
}

/** A rough outline per geo kind — enough to tell a diamond from an ellipse. */
const GEO_PATHS: Record<string, string> = {
  rectangle: 'M3 4h14v12H3z',
  ellipse: 'M10 4a7 6 0 1 0 .01 0z',
  triangle: 'M10 3.5 17 16.5H3z',
  diamond: 'M10 3l7 7-7 7-7-7z',
  pentagon: 'M10 3l7 5-2.7 8.3H5.7L3 8z',
  hexagon: 'M6 4h8l4 6-4 6H6l-4-6z',
  octagon: 'M7 3h6l4 4v6l-4 4H7l-4-4V7z',
  star: 'M10 3l2.2 4.7 5.1.6-3.8 3.5 1 5-4.5-2.5L5.5 16.8l1-5L2.7 8.3l5.1-.6z',
  rhombus: 'M6 4h11l-3 12H3z',
  'rhombus-2': 'M3 4h11l3 12H6z',
  oval: 'M7 4h6a5 6 0 0 1 0 12H7a5 6 0 0 1 0-12z',
  trapezoid: 'M6 4h8l3 12H3z',
  cloud: 'M6 15a3.4 3.4 0 0 1 .3-6.8A4.3 4.3 0 0 1 14.4 8 3.5 3.5 0 0 1 14 15z',
  heart: 'M10 16.5S3 12.3 3 7.9A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 7 1.9c0 4.4-7 8.6-7 8.6z',
  'x-box': 'M3 4h14v12H3zM6.5 7.5l7 5M13.5 7.5l-7 5',
  'check-box': 'M3 4h14v12H3zM6.5 10.2l2.4 2.4 4.6-4.8',
  'arrow-right': 'M3 7.5h7V4l7 6-7 6v-3.5H3z',
  'arrow-left': 'M17 7.5h-7V4L3 10l7 6v-3.5h7z',
  'arrow-up': 'M7.5 17v-7H4l6-7 6 7h-3.5v7z',
  'arrow-down': 'M7.5 3v7H4l6 7 6-7h-3.5V3z',
}

function GeoGlyph({ value }: { value: string | undefined }) {
  return <Svg><path d={GEO_PATHS[value ?? 'rectangle'] ?? GEO_PATHS.rectangle} /></Svg>
}

/**
 * The glyph's cadence per line style. `async` is the cable's own packet
 * rhythm — a long carrier, a hair of a gap, a short packet — scaled from the
 * 56/4/10/4 the canvas paints (`connectionPresentation.ASYNC_PACKET_DASHARRAY`)
 * down to the 14 units this glyph has to say it in.
 */
const DASH_ARRAYS: Record<string, string | undefined> = {
  draw: undefined,
  solid: undefined,
  dashed: '4 3',
  dotted: '0.1 3.2',
  async: '9 1 2 1',
  none: undefined,
}

function DashGlyph({ value }: { value: string | undefined }) {
  if (value === 'none') {
    return <Svg><path d="M3 17 17 3" data-role="slash" /><circle cx="10" cy="10" r="7" /></Svg>
  }
  return (
    <Svg>
      <path
        d={value === 'draw' ? 'M3 12.5c4-6 6 2 14-4.5' : 'M3 10h14'}
        strokeDasharray={DASH_ARRAYS[value ?? 'solid']}
        strokeLinecap={value === 'dotted' ? 'round' : 'butt'}
        data-dash={value}
      />
    </Svg>
  )
}

/** FigJam draws each size at its own size; four bars do the same job compactly. */
const SIZE_HEIGHTS: Record<string, number> = { s: 3, m: 6, l: 9, xl: 13 }

function SizeGlyph({ value }: { value: string | undefined }) {
  const height = SIZE_HEIGHTS[value ?? 'm'] ?? 6
  return (
    <Svg>
      <rect x="3" y={10 - height / 2} width="14" height={height} rx={height / 2} data-role="solid" />
    </Svg>
  )
}

/**
 * The thickness rung drawn at the width it actually paints.
 *
 * WHY drawn rather than one of FigJam's two traced weight icons: there are
 * three rungs and FigJam has two, so a traced pair plus one invented sibling
 * would be the mismatch `figjamIconMap` exists to refuse. Excalidraw draws the
 * same three as plain rules of increasing weight, which is the reference Zach
 * pointed at — and one drawing serves both the stacked shape row and the
 * connector's row beside its line styles.
 *
 * The 20-unit box is painted at 24px, so a rung's scene-unit width is divided
 * by that 1.2 ratio to land on screen at the width it will draw on canvas.
 */
const GLYPH_UNITS_PER_PX = 24 / 20

function StrokeWidthGlyph({ value }: { value: string | undefined }) {
  const px = strokeWidthPxForRung(value) ?? STROKE_WIDTH_PX.medium
  const height = px / GLYPH_UNITS_PER_PX
  return (
    <Svg>
      <rect
        x="3"
        y={10 - height / 2}
        width="14"
        height={height}
        rx={height / 2}
        data-role="solid"
        data-width={value}
      />
    </Svg>
  )
}

const FONT_STACKS: Record<string, string> = {
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  draw: '"Comic Sans MS", "Segoe Print", cursive',
}

function FontGlyph({ value }: { value: string | undefined }) {
  return (
    <span
      className="systemsketch-appearance__font"
      style={{ fontFamily: FONT_STACKS[value ?? 'sans'] ?? FONT_STACKS.sans }}
      aria-hidden="true"
    >
      Aa
    </span>
  )
}

/** Three lines: stacked to one side for vertical, ragged to one side for horizontal. */
const VERTICAL_ALIGN_ROWS: Record<string, readonly number[]> = {
  start: [5, 8.5, 12],
  middle: [6.5, 10, 13.5],
  end: [8, 11.5, 15],
}

function AlignGlyph({ value, vertical }: { value: string | undefined; vertical?: boolean }) {
  if (vertical) {
    const rows = VERTICAL_ALIGN_ROWS[value ?? 'middle'] ?? VERTICAL_ALIGN_ROWS.middle
    return <Svg>{rows.map((y) => <path key={y} d={`M4 ${y}h12`} />)}</Svg>
  }
  // The short middle line is what makes the alignment readable at 20px.
  const widths = [14, 8, 14]
  const start = (width: number) =>
    value === 'end' ? 17 - width : value === 'middle' ? 10 - width / 2 : 3
  return (
    <Svg>
      {widths.map((width, index) => (
        <path key={index} d={`M${start(width)} ${6 + index * 4}h${width}`} />
      ))}
    </Svg>
  )
}

function RoutingGlyph({ value }: { value: string | undefined }) {
  if (value === 'elbow') return <Svg><path d="M3 15h6V5h8" /></Svg>
  // `straight` is the canonical Line shape value; `line` is the stock spline
  // style's word for the same thing, kept so a raw style value still draws.
  if (value === 'straight' || value === 'line') return <Svg><path d="M3 15 17 5" /></Svg>
  return <Svg><path d="M3 15c5 0 3-10 14-10" /></Svg>
}

/** The line is always drawn the same way; only the cap changes. */
function ArrowheadGlyph({ value, atStart }: { value: string | undefined; atStart?: boolean }) {
  const tip = atStart ? 4 : 16
  const away = atStart ? 1 : -1
  const caps: Record<string, ReactElement | null> = {
    none: null,
    arrow: <path d={`M${tip} 10l${4 * away} -3.4M${tip} 10l${4 * away} 3.4`} />,
    triangle: <path d={`M${tip} 10l${5 * away} -3.4v6.8z`} data-role="solid" />,
    inverted: <path d={`M${tip + 5 * away} 10l${-5 * away} -3.4v6.8z`} data-role="solid" />,
    square: <rect x={tip - (atStart ? 0 : 4)} y="7" width="4" height="6" data-role="solid" />,
    dot: <circle cx={tip + 2 * away} cy="10" r="2.6" data-role="solid" />,
    diamond: <path d={`M${tip} 10l${3 * away} -3l${3 * away} 3l${-3 * away} 3z`} data-role="solid" />,
    pipe: <path d={`M${tip} 6.5v7`} />,
    bar: <path d={`M${tip} 6.5v7`} />,
  }
  return (
    <Svg>
      <path d={atStart ? 'M6 10h11' : 'M3 10h11'} />
      {caps[value ?? 'none']}
    </Svg>
  )
}
