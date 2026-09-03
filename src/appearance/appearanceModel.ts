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
import { isCustomColor } from './customColors'
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
  | 'lineStyle'
  | 'size'
  | 'font'
  | 'align'
  | 'verticalAlign'
  | 'arrowKind'
  | 'spline'
  | 'connectionRouting'
  | 'arrowheadStart'
  | 'arrowheadEnd'

/**
 * How a popover lays its options out. FigJam has three idioms and this copies
 * them: a `row` of 24px icon cells, a row of labelled `chips`, and a `list`
 * of rows with a check mark; the `swatches` grid and the shape `library` are
 * the two one-offs.
 */
export type AppearanceLayout = 'swatches' | 'row' | 'chips' | 'list' | 'library'

/**
 * What the trigger shows. Most show the current `value`'s glyph, the way
 * FigJam's Start point shows the chosen arrowhead. Line style and Typeface
 * show a fixed `icon` whatever the value, and Font size shows the value's
 * name as `text` in a 144px combobox — all three read off FigJam's pill.
 */
export type AppearanceTrigger = 'value' | 'icon' | 'text'

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
  trigger: AppearanceTrigger
  /** Swatch grids only. */
  columns?: number
  /** Swatch grids only: the 22nd cell, which opens the picker. */
  custom?: boolean
  /**
   * A second control in the same popover, writing a different style. FigJam
   * stacks Fill / Transparent / No fill `above` its palette, and puts a
   * connector's Thin / Thick `beside` its Solid / Dashed.
   */
  modeControl?: AppearanceControl
  modePlacement?: 'above' | 'beside'
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

/**
 * The same four rungs as a connector's stroke weight, where FigJam has two:
 * its icons sit on the ends and tldraw's middle two keep their own names.
 */
const WEIGHT_OPTIONS = [
  option('s', 'Thin'),
  option('m', 'Medium'),
  option('l', 'Large'),
  option('xl', 'Thick'),
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
 * Stock tldraw stores Straight and Curved arrows under the same `arc` kind;
 * the arrow's bend distinguishes them. The appearance adapter translates the
 * three visible FigJam choices back to stock `kind` + `bend` props.
 */
const ARROW_KIND_OPTIONS = [
  option('elbow', 'Elbowed'),
  option('curve', 'Curved'),
  option('straight', 'Straight'),
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
  trigger: AppearanceTrigger
  columns?: number
}

const DEFINITIONS: Readonly<Record<Exclude<AppearanceControlId, 'fill' | 'lineStyle'>, Definition>> = {
  // FigJam's trigger is a fixed circle-and-square glyph, the same whichever
  // geo is actually selected — not a preview of the current shape.
  geo: {
    id: 'geo', label: 'Shape', style: GeoShapeGeoStyle as StyleProp<string>,
    options: GEO_OPTIONS, layout: 'library', trigger: 'icon',
  },
  color: {
    id: 'color', label: 'Color', style: DefaultColorStyle as StyleProp<string>,
    options: APPEARANCE_COLORS.map((value) => option(value, colorLabel(value))),
    layout: 'swatches', trigger: 'value', columns: APPEARANCE_COLOR_COLUMNS,
  },
  // A shape's Line style: FigJam's Solid / Dashed / None as labelled chips
  // behind the same fixed three-bar icon a connector's uses.
  dash: {
    id: 'dash', label: 'Line style', style: DefaultDashStyle as StyleProp<string>,
    options: DASH_OPTIONS, layout: 'chips', trigger: 'icon',
  },
  // A shape's size is FigJam's Font size: a combobox that names the rung,
  // after Typeface, listing each rung at its own size. tldraw's one `size`
  // also drives the stroke, which report §4 records as a deliberate deviation.
  size: {
    id: 'size', label: 'Font size', style: DefaultSizeStyle as StyleProp<string>,
    options: SIZE_OPTIONS, layout: 'list', trigger: 'text',
  },
  font: {
    id: 'font', label: 'Typeface', style: DefaultFontStyle as StyleProp<string>,
    options: FONT_OPTIONS, layout: 'list', trigger: 'icon',
  },
  align: {
    id: 'align', label: 'Text alignment', style: DefaultHorizontalAlignStyle as StyleProp<string>,
    options: ALIGN_OPTIONS, layout: 'row', trigger: 'value',
  },
  verticalAlign: {
    id: 'verticalAlign', label: 'Vertical alignment',
    style: DefaultVerticalAlignStyle as StyleProp<string>,
    options: VERTICAL_ALIGN_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowheadStart: {
    id: 'arrowheadStart', label: 'Start point',
    style: ArrowShapeArrowheadStartStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row', trigger: 'value',
  },
  connectionRouting: {
    id: 'connectionRouting', label: 'Line shape',
    style: ConnectionRoutingStyle as StyleProp<string>,
    options: CONNECTION_ROUTING_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowKind: {
    id: 'arrowKind', label: 'Line shape', style: ArrowShapeKindStyle as StyleProp<string>,
    options: ARROW_KIND_OPTIONS, layout: 'row', trigger: 'value',
  },
  spline: {
    id: 'spline', label: 'Line shape', style: LineShapeSplineStyle as StyleProp<string>,
    options: SPLINE_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowheadEnd: {
    id: 'arrowheadEnd', label: 'End point',
    style: ArrowShapeArrowheadEndStyle as StyleProp<string>,
    options: ARROWHEAD_OPTIONS, layout: 'row', trigger: 'value',
  },
}

/**
 * A shape's pill, in FigJam's order: what it is, how it is painted, its text.
 * Captured as `Shape | Change color, Line style | Typeface, Font size | ... |
 * Text alignment` — Font size sits after Typeface, not beside Line style.
 * The typography group (`font size align verticalAlign`) only ever renders
 * once the shape actually has text; see `TYPOGRAPHY_IDS` below.
 */
const SHAPE_ORDER: readonly AppearanceControlId[] = [
  'geo', 'color', 'dash', 'font', 'size', 'align', 'verticalAlign',
]

/**
 * A connector's pill: `Change color | Line style | Add text | Start point |
 * Line shape | End point`. Its Line style holds both weight and dash, so
 * neither appears on its own; the ends and the shape between them read the
 * way the arrow does — where it leaves, how it travels, where it lands.
 *
 * `font`/`align`/`verticalAlign` still sit in this order — a Text shape
 * selected beside a cable (no dash of its own) legitimately needs its own
 * typography — but `buildAppearanceControls` suppresses all three whenever
 * the selection is a genuine dash-bearing connector, labelled or not:
 * FigJam's own labelled-connector capture
 * (`docs/assets/menu-diff-figjam-arrow-text-2026-09-03.json`) carries no
 * Typeface or Font size control at all — a connector's label typography is
 * fixed, not user-editable, unlike a shape's. `AppearanceControls` renders
 * the "Add text" button itself, beside `lineStyle`, for the one case this
 * order can't express: a control with no style to hold.
 */
const CONNECTOR_ORDER: readonly AppearanceControlId[] = [
  'geo', 'color', 'lineStyle', 'font', 'align', 'verticalAlign',
  'arrowheadStart', 'connectionRouting', 'arrowKind', 'spline', 'arrowheadEnd',
]

/**
 * Typography controls a shape only earns once it has visible text — FigJam's
 * rectangle-with-no-text pill is `Shape · Change color · Line style`, full
 * stop; Typeface/Font size/alignment appear the moment a label exists. A
 * genuine connector never earns them at all; see `CONNECTOR_ORDER` above.
 */
const TYPOGRAPHY_IDS = new Set<AppearanceControlId>(['font', 'size', 'align', 'verticalAlign'])

/** The styles that only a connector or a line carries. */
const CONNECTOR_STYLES = [
  ArrowShapeArrowheadStartStyle,
  ArrowShapeArrowheadEndStyle,
  ArrowShapeKindStyle,
  LineShapeSplineStyle,
  ConnectionRoutingStyle,
] as StyleProp<string>[]

/** True when anything in the selection is a connector, so Line style merges weight and dash. */
export function isConnectorSelection(styles: ReadonlySharedStyleMap): boolean {
  return CONNECTOR_STYLES.some((style) => styles.get(style) !== undefined)
}

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
    value, options: FILL_OPTIONS, layout: 'chips', trigger: 'value',
  }
}

/**
 * A connector's Line style: FigJam's one popover holding `Thin Thick | Solid
 * Dashed`, so this is the dash control with the weight control beside it.
 * Both still write their own tldraw style; only the popover is shared.
 */
function lineStyleControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const dash = styles.get(DefaultDashStyle as StyleProp<string>)
  if (!dash) return undefined
  const control: AppearanceControl = {
    id: 'lineStyle', label: 'Line style', style: DefaultDashStyle as StyleProp<string>,
    value: dash, options: DASH_OPTIONS, layout: 'row', trigger: 'icon',
  }
  const size = styles.get(DefaultSizeStyle as StyleProp<string>)
  if (size) {
    control.modeControl = {
      id: 'size', label: 'Weight', style: DefaultSizeStyle as StyleProp<string>,
      value: size, options: WEIGHT_OPTIONS, layout: 'row', trigger: 'value',
    }
    control.modePlacement = 'beside'
  }
  return control
}

/**
 * Build the control list for the current selection.
 *
 * A control exists only when tldraw reports the style as relevant, which is why
 * a connector shows routing and endpoints while a shape shows fill and why a
 * shape grows the typography group the moment it carries text — the same
 * driven-by-what-the-selection-has rule FigJam uses. Which of FigJam's two
 * pills is copied depends on the same map: a connector anywhere in the
 * selection merges weight and dash into one Line style, as FigJam does.
 *
 * `hasText` gates `TYPOGRAPHY_IDS` for a shape. A connector suppresses the
 * same ids outright, but only once it is confirmed genuine — carrying its
 * own dash — so a Text shape selected beside a dash-less cable keeps its
 * typography.
 */
export function buildAppearanceControls(
  styles: ReadonlySharedStyleMap | null,
  hasText: boolean,
): AppearanceControl[] {
  if (!styles) return []
  const connector = isConnectorSelection(styles)
  const lineStyle = connector ? lineStyleControl(styles) : undefined
  const suppressTypography = connector ? Boolean(lineStyle) : !hasText
  const controls: AppearanceControl[] = []
  for (const id of connector ? CONNECTOR_ORDER : SHAPE_ORDER) {
    if (suppressTypography && TYPOGRAPHY_IDS.has(id)) continue
    if (id === 'lineStyle') {
      if (lineStyle) {
        controls.push(lineStyle)
        continue
      }
      // A selection with a size but no dash (text beside a cable) keeps Font
      // size — this is a Text object's own control, not a connector's, so it
      // is not gated by `hasText` the way a shape's typography is.
      const size = styles.get(DEFINITIONS.size.style)
      if (size) controls.push({ ...DEFINITIONS.size, value: size })
      continue
    }
    const definition = DEFINITIONS[id as keyof typeof DEFINITIONS]
    const value = styles.get(definition.style)
    if (!value) continue
    const control: AppearanceControl = { ...definition, value }
    if (definition.id === 'color') {
      const mode = fillControl(styles)
      if (mode) {
        control.modeControl = mode
        control.modePlacement = 'above'
      }
      control.custom = true
    }
    controls.push(control)
  }
  return controls
}

/** FigJam's word for the 22nd cell, and for the trigger while a custom colour is applied. */
export const CUSTOM_LABEL = 'Custom'

/**
 * The option currently applied, or undefined when the selection disagrees.
 * A custom colour is not in the swatch list but is still one definite value,
 * so it reads as `Custom` rather than as mixed.
 */
export function selectedOption(control: AppearanceControl): AppearanceOption | undefined {
  const shared = control.value
  if (shared.type !== 'shared') return undefined
  const found = control.options.find((candidate) => candidate.value === shared.value)
  if (found) return found
  if (control.id === 'color' && isCustomColor(shared.value)) {
    return option(shared.value, CUSTOM_LABEL)
  }
  return undefined
}

/** What the trigger says when the selection disagrees, as tldraw's own panel does. */
export const MIXED_LABEL = 'Mixed'

export function triggerLabel(control: AppearanceControl): string {
  const option = selectedOption(control)
  return `${control.label}, ${option ? option.label.toLowerCase() : MIXED_LABEL.toLowerCase()}`
}
