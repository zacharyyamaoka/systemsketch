/**
 * Which appearance controls the selection gets, in FigJam's order.
 *
 * The vocabulary is deliberately closed — that is the whole point of copying
 * FigJam rather than Figma. Every option here is a value tldraw's own style
 * system already accepts, so the menu can only ever ask for states a shape can
 * actually hold; see `docs/figjam-appearance-menu-spec-2026-09-01.html` for the
 * capture this is modelled on, and `docs/systemsketch-appearance-menu-*.html`
 * for where the two deliberately differ.
 */
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeKindStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  LineShapeSplineStyle,
  type ReadonlySharedStyleMap,
  type SharedStyle,
  type StyleProp,
} from 'tldraw'

import { ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import {
  FIGJAM_COLOR_LABELS,
  FIGJAM_COLOR_NAMES,
  FIGJAM_PALETTE_COLUMNS,
} from './figjamPalette'

export type AppearanceControlId =
  | 'geo'
  | 'color'
  | 'fill'
  | 'dash'
  | 'size'
  | 'font'
  | 'align'
  | 'verticalAlign'
  | 'arrowKind'
  | 'spline'
  | 'connectionRouting'
  | 'arrowheadStart'
  | 'arrowheadEnd'

/** How a popover lays its options out. */
export type AppearanceLayout = 'swatches' | 'row' | 'list' | 'library'

export interface AppearanceOption {
  value: string
  /** FigJam's word for it wherever FigJam has one. */
  label: string
}

export interface AppearanceControl {
  id: AppearanceControlId
  /** Tooltip and accessible name for the trigger. */
  label: string
  style: StyleProp<string>
  value: SharedStyle<string>
  options: readonly AppearanceOption[]
  layout: AppearanceLayout
  /** Swatch grids only. */
  columns?: number
  /**
   * A second control rendered as a row above this one's options, the way
   * FigJam stacks Fill / Transparent / No fill above its palette.
   */
  modeControl?: AppearanceControl
}

const option = (value: string, label: string): AppearanceOption => ({ value, label })

/**
 * FigJam's palette, in FigJam's own order: eleven saturated colours, then the
 * eleven light twins beneath them. These are registered on the editor through
 * a stock theme (see `figjamPalette.ts`), so every name here is a value
 * `DefaultColorStyle` actually accepts.
 */
export const APPEARANCE_COLORS = FIGJAM_COLOR_NAMES

export const APPEARANCE_COLOR_COLUMNS = FIGJAM_PALETTE_COLUMNS

/** tldraw's fill values, named the way FigJam names the three it has. */
const FILL_OPTIONS = [
  option('none', 'No fill'),
  option('semi', 'Transparent'),
  option('solid', 'Solid'),
  option('fill', 'Fill'),
  option('pattern', 'Pattern'),
  option('lined-fill', 'Lined'),
] as const

const DASH_OPTIONS = [
  option('draw', 'Draw'),
  option('solid', 'Solid'),
  option('dashed', 'Dashed'),
  option('dotted', 'Dotted'),
  option('none', 'None'),
] as const

/** FigJam's five-rung ladder, on tldraw's four rungs. */
const SIZE_OPTIONS = [
  option('s', 'Small'),
  option('m', 'Medium'),
  option('l', 'Large'),
  option('xl', 'Extra large'),
] as const

/** FigJam's four typefaces, in FigJam's order, on tldraw's four fonts. */
const FONT_OPTIONS = [
  option('sans', 'Simple'),
  option('serif', 'Bookish'),
  option('mono', 'Technical'),
  option('draw', 'Scribbled'),
] as const

const ALIGN_OPTIONS = [
  option('start', 'Left'),
  option('middle', 'Center'),
  option('end', 'Right'),
] as const

const VERTICAL_ALIGN_OPTIONS = [
  option('start', 'Top'),
  option('middle', 'Middle'),
  option('end', 'Bottom'),
] as const

/**
 * FigJam's line shapes, in FigJam's order: `Elbowed Curved Straight`, read out
 * of its own popover. A SystemSketch cable has exactly these three, so this is
 * the one control that reaches FigJam's full vocabulary.
 */
const CONNECTION_ROUTING_OPTIONS = [
  option('elbow', 'Elbowed'),
  option('curved', 'Curved'),
  option('straight', 'Straight'),
] as const

/**
 * tldraw's own arrow and line carry a narrower vocabulary than a cable: an
 * arrow is arced or elbowed, a line is straight or curved. They are shown as
 * the same control with the same glyphs, holding whichever of FigJam's three
 * the shape can actually be — the menu never offers a state a shape cannot
 * hold, which is the rule the whole model is built on.
 */
const ARROW_KIND_OPTIONS = [
  option('elbow', 'Elbowed'),
  option('arc', 'Curved'),
] as const

const SPLINE_OPTIONS = [
  option('cubic', 'Curved'),
  option('line', 'Straight'),
] as const

/** FigJam shows six endings and hides the rest; tldraw has nine, all shown. */
const ARROWHEAD_OPTIONS = [
  option('none', 'None'),
  option('arrow', 'Arrow'),
  option('triangle', 'Triangle'),
  option('square', 'Square'),
  option('dot', 'Dot'),
  option('diamond', 'Diamond'),
  option('inverted', 'Inverted'),
  option('pipe', 'Bar'),
  option('bar', 'Line'),
] as const

/** Every geo shape tldraw knows, for the searchable picker. */
const GEO_OPTIONS = [
  option('rectangle', 'Rectangle'),
  option('ellipse', 'Ellipse'),
  option('triangle', 'Triangle'),
  option('diamond', 'Diamond'),
  option('pentagon', 'Pentagon'),
  option('hexagon', 'Hexagon'),
  option('octagon', 'Octagon'),
  option('star', 'Star'),
  option('rhombus', 'Rhombus'),
  option('rhombus-2', 'Rhombus 2'),
  option('oval', 'Oval'),
  option('trapezoid', 'Trapezoid'),
  option('cloud', 'Cloud'),
  option('heart', 'Heart'),
  option('x-box', 'X box'),
  option('check-box', 'Check box'),
  option('arrow-right', 'Arrow right'),
  option('arrow-left', 'Arrow left'),
  option('arrow-up', 'Arrow up'),
  option('arrow-down', 'Arrow down'),
] as const

interface Definition {
  id: AppearanceControlId
  label: string
  style: StyleProp<string>
  options: readonly AppearanceOption[]
  layout: AppearanceLayout
  columns?: number
}

/**
 * In FigJam's order: what the thing *is*, then how it is painted, then its
 * text, then — for connectors — how it is routed and capped.
 */
const DEFINITIONS: readonly Definition[] = [
  {
    id: 'geo', label: 'Shape', style: GeoShapeGeoStyle as StyleProp<string>,
    options: GEO_OPTIONS, layout: 'library',
  },
  {
    id: 'color', label: 'Color', style: DefaultColorStyle as StyleProp<string>,
    options: APPEARANCE_COLORS.map((value) => option(value, colorLabel(value))),
    layout: 'swatches', columns: APPEARANCE_COLOR_COLUMNS,
  },
  {
    id: 'dash', label: 'Stroke', style: DefaultDashStyle as StyleProp<string>,
    options: DASH_OPTIONS, layout: 'row',
  },
  {
    id: 'size', label: 'Size', style: DefaultSizeStyle as StyleProp<string>,
    options: SIZE_OPTIONS, layout: 'list',
  },
  {
    id: 'font', label: 'Typeface', style: DefaultFontStyle as StyleProp<string>,
    options: FONT_OPTIONS, layout: 'list',
  },
  {
    id: 'align', label: 'Text alignment', style: DefaultHorizontalAlignStyle as StyleProp<string>,
    options: ALIGN_OPTIONS, layout: 'row',
  },
  {
    id: 'verticalAlign', label: 'Vertical alignment',
    style: DefaultVerticalAlignStyle as StyleProp<string>,
    options: VERTICAL_ALIGN_OPTIONS, layout: 'row',
  },
  // Start, shape, end — the order FigJam uses, and the order the arrow itself
  // reads in: where it leaves, how it travels, where it lands. Captured from
  // FigJam's connector menu as `Start point | Line shape | End point`.
  {
    id: 'arrowheadStart', label: 'Start point',
    style: ArrowShapeArrowheadStartStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row',
  },
  {
    id: 'connectionRouting', label: 'Line shape',
    style: ConnectionRoutingStyle as StyleProp<string>,
    options: CONNECTION_ROUTING_OPTIONS, layout: 'row',
  },
  {
    id: 'arrowKind', label: 'Line shape', style: ArrowShapeKindStyle as StyleProp<string>,
    options: ARROW_KIND_OPTIONS, layout: 'row',
  },
  {
    id: 'spline', label: 'Line shape', style: LineShapeSplineStyle as StyleProp<string>,
    options: SPLINE_OPTIONS, layout: 'row',
  },
  {
    id: 'arrowheadEnd', label: 'End point',
    style: ArrowShapeArrowheadEndStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row',
  },
]

/** FigJam's own name for a colour, falling back to a readable slug. */
export function colorLabel(value: string): string {
  const figjam = FIGJAM_COLOR_LABELS[value]
  if (figjam) return figjam
  const words = value.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The `fill` control, when the selection has one, for the colour popover's mode row. */
function fillControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const value = styles.get(DefaultFillStyle as StyleProp<string>)
  if (!value) return undefined
  return {
    id: 'fill', label: 'Fill', style: DefaultFillStyle as StyleProp<string>,
    value, options: FILL_OPTIONS, layout: 'row',
  }
}

/**
 * Build the control list for the current selection.
 *
 * A control exists only when tldraw reports the style as relevant, which is why
 * a connector shows routing and endpoints while a shape shows fill and why both
 * grow the typography group the moment they carry text — the same
 * driven-by-what-the-selection-has rule FigJam uses.
 */
export function buildAppearanceControls(
  styles: ReadonlySharedStyleMap | null,
): AppearanceControl[] {
  if (!styles) return []
  const controls: AppearanceControl[] = []
  for (const definition of DEFINITIONS) {
    const value = styles.get(definition.style)
    if (!value) continue
    const control: AppearanceControl = { ...definition, value }
    if (definition.id === 'color') {
      const mode = fillControl(styles)
      if (mode) control.modeControl = mode
    }
    controls.push(control)
  }
  return controls
}

/** The option currently applied, or undefined when the selection disagrees. */
export function selectedOption(control: AppearanceControl): AppearanceOption | undefined {
  const shared = control.value
  if (shared.type !== 'shared') return undefined
  return control.options.find((candidate) => candidate.value === shared.value)
}

/** What the trigger says when the selection disagrees, as tldraw's own panel does. */
export const MIXED_LABEL = 'Mixed'

export function triggerLabel(control: AppearanceControl): string {
  const option = selectedOption(control)
  return `${control.label}, ${option ? option.label.toLowerCase() : MIXED_LABEL.toLowerCase()}`
}
