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
 * tldraw's thirteen colours, neutrals first and then each hue beside its light
 * twin, so the grid reads in rows the way FigJam's saturated-over-light pair
 * does. FigJam has eleven full pairs; tldraw only carries four light variants,
 * so an 11x2 grid would be mostly holes.
 */
export const APPEARANCE_COLORS = [
  'black', 'grey', 'white',
  'red', 'light-red',
  'orange', 'yellow',
  'green', 'light-green',
  'blue', 'light-blue',
  'violet', 'light-violet',
] as const

export const APPEARANCE_COLOR_COLUMNS = 7

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

const ARROW_KIND_OPTIONS = [
  option('arc', 'Curved'),
  option('elbow', 'Elbowed'),
] as const

const SPLINE_OPTIONS = [
  option('line', 'Straight'),
  option('cubic', 'Curved'),
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
  {
    id: 'arrowKind', label: 'Line shape', style: ArrowShapeKindStyle as StyleProp<string>,
    options: ARROW_KIND_OPTIONS, layout: 'row',
  },
  {
    id: 'spline', label: 'Line shape', style: LineShapeSplineStyle as StyleProp<string>,
    options: SPLINE_OPTIONS, layout: 'row',
  },
  {
    id: 'arrowheadStart', label: 'Start point',
    style: ArrowShapeArrowheadStartStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row',
  },
  {
    id: 'arrowheadEnd', label: 'End point',
    style: ArrowShapeArrowheadEndStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row',
  },
]

/** `light-red` reads as `Light red` in a tooltip. */
export function colorLabel(value: string): string {
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
