/**
 * Stock tldraw style bindings for the shared contextual-control registry.
 *
 * This module decides which registered controls are relevant to a selection
 * and binds them to StyleProps. The visible vocabulary, labels, previews,
 * grouping, and order remain in contextualControlRegistry.ts so shape, edge,
 * and Block-title menus compose the same pieces instead of reimplementing UI.
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
import { CodeLanguageStyle } from '../code/codeModel'
import { combineSharedStyles } from '../contextualMenus/sharedValues'
import {
  CONNECTOR_CONTEXTUAL_RECIPE,
  CONTEXTUAL_CONTROL_REGISTRY,
  CUSTOM_LABEL,
  MIXED_LABEL,
  SHAPE_CONTEXTUAL_RECIPE,
  type AppearanceControlId,
  type ContextualControlDefinition,
  type ContextualControlLayout,
  type ContextualControlOption,
  type ContextualControlTrigger,
} from '../contextualMenus/contextualControlRegistry'
import { isCustomColor } from './customColors'
import type { StrokeMetaField } from './strokeMeta'

export type { AppearanceControlId }
export type AppearanceLayout = ContextualControlLayout
export type AppearanceTrigger = ContextualControlTrigger
export type AppearanceOption = ContextualControlOption

export interface AppearanceControl extends ContextualControlDefinition {
  id: AppearanceControlId
  kind: AppearanceControlId
  /** Absent only on `lineShape`, which writes three styles through one preset. */
  style?: StyleProp<string>
  value: SharedStyle<string>
  meta?: StrokeMetaField
  modeControl?: AppearanceControl
  modePlacement?: 'above' | 'beside'
}

/**
 * The routing actually painted across the selected stock arrows, or null when
 * none are selected. The model cannot read this off the style map: tldraw
 * stores Straight and Curved as the same `kind: 'arc'` and only per-shape
 * `bend` separates them, so the caller reads it per shape
 * (`arrowPresetForShape`) and hands the verdict in.
 */
export type ArrowRoutingReading = 'straight' | 'curve' | 'elbow' | 'mixed' | null

export const APPEARANCE_COLORS = CONTEXTUAL_CONTROL_REGISTRY.color.options
  .map((candidate) => candidate.value)
export const APPEARANCE_COLOR_COLUMNS = CONTEXTUAL_CONTROL_REGISTRY.color.columns ?? 11

const STYLE_BY_KIND: Partial<Record<AppearanceControlId, StyleProp<string>>> = {
  geo: GeoShapeGeoStyle as StyleProp<string>,
  color: DefaultColorStyle as StyleProp<string>,
  fill: DefaultFillStyle as StyleProp<string>,
  lineStyle: DefaultDashStyle as StyleProp<string>,
  strokeColor: DefaultColorStyle as StyleProp<string>,
  // A Code block's own StyleProp — see `contextualControlRegistry.ts`'s
  // `codeLanguage` entry for why it rides this same generic loop instead of
  // a bespoke Code-only control.
  codeLanguage: CodeLanguageStyle as StyleProp<string>,
  size: DefaultSizeStyle as StyleProp<string>,
  font: DefaultFontStyle as StyleProp<string>,
  align: DefaultHorizontalAlignStyle as StyleProp<string>,
  verticalAlign: DefaultVerticalAlignStyle as StyleProp<string>,
  arrowheadStart: ArrowShapeArrowheadStartStyle as StyleProp<string>,
  arrowheadEnd: ArrowShapeArrowheadEndStyle as StyleProp<string>,
}

/**
 * Each stock style's private vocabulary, read into the one canonical Line
 * shape vocabulary (the toolbar's ArrowPreset: elbow/curve/straight).
 * toolbarModel.ts owns the write direction (`connectionRoutingForArrowPreset`).
 */
const CONNECTION_ROUTING_TO_LINE_SHAPE: Record<string, string> = {
  elbow: 'elbow', curved: 'curve', straight: 'straight',
}
const SPLINE_TO_LINE_SHAPE: Record<string, string> = { cubic: 'curve', line: 'straight' }

const CONNECTOR_STYLES = [
  ArrowShapeArrowheadStartStyle,
  ArrowShapeArrowheadEndStyle,
  ArrowShapeKindStyle,
  LineShapeSplineStyle,
  ConnectionRoutingStyle,
] as StyleProp<string>[]

const TYPOGRAPHY_IDS = new Set<AppearanceControlId>(['font', 'size', 'align', 'verticalAlign'])

export function isConnectorSelection(styles: ReadonlySharedStyleMap): boolean {
  return CONNECTOR_STYLES.some((style) => styles.get(style) !== undefined)
}

/** The stored style token, presented without rewriting any characters. */
export function colorLabel(value: string): string {
  return value
}

function bindStyleControl(
  kind: AppearanceControlId,
  style: StyleProp<string>,
  value: SharedStyle<string>,
): AppearanceControl {
  return {
    ...CONTEXTUAL_CONTROL_REGISTRY[kind],
    id: kind,
    kind,
    style,
    value,
  }
}

function fillControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const style = DefaultFillStyle as StyleProp<string>
  const value = styles.get(style)
  return value ? bindStyleControl('fill', style, value) : undefined
}

/** A shape's edge palette, with the one shared line-style recipe above it. */
function strokeColorControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const dashStyle = DefaultDashStyle as StyleProp<string>
  const dash = styles.get(dashStyle)
  if (!dash || !styles.get(GeoShapeGeoStyle as StyleProp<string>)) return undefined
  const colorStyle = DefaultColorStyle as StyleProp<string>
  const color = styles.get(colorStyle) ?? { type: 'mixed' as const }
  const control = bindStyleControl('strokeColor', colorStyle, color)
  control.modeControl = lineStyleWithThickness(dashStyle, dash)
  control.modePlacement = 'above'
  return control
}

/**
 * The Stroke popover's stack: thickness, then line style, then the palette.
 *
 * WHY thickness rides ABOVE line style rather than beside the palette: all
 * three answer "what does this edge look like", which is why FigJam keeps
 * them in one popover — and it is the layout Zach drew. The renderer walks
 * this `above` chain, so a new edge section is a link here and no new surface.
 * The reading is filled in by `withEdgeValues`, which also drops the row when
 * the selection holds nothing that could paint it.
 */
function lineStyleWithThickness(
  dashStyle: StyleProp<string>,
  dash: SharedStyle<string>,
): AppearanceControl {
  const lineStyle = bindStyleControl('lineStyle', dashStyle, dash)
  lineStyle.layout = 'chips'
  lineStyle.modeControl = strokeWidthControl()
  lineStyle.modePlacement = 'above'
  return lineStyle
}

/**
 * A connector's line style: the same options with the labels hidden and the
 * same thickness row beside it.
 *
 * WHY the identical control rather than a connector-only weight: Zach's rule
 * for these menus — "in the spirit of the modular composable contextual menu,
 * all the icons by construction must be the same. In this case we hide the
 * color selector and hide the labels and then put the things side by side
 * instead of stacked on top of each other." The composition differs; the
 * vocabulary, glyphs and write path do not.
 */
function connectorLineStyleControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const dashStyle = DefaultDashStyle as StyleProp<string>
  const dash = styles.get(dashStyle)
  if (!dash) return undefined
  const control = bindStyleControl('lineStyle', dashStyle, dash)
  control.layout = 'row'
  control.modeControl = strokeWidthControl()
  control.modePlacement = 'beside'
  return control
}

/** The one thickness control, before `withEdgeValues` fills in its reading. */
function strokeWidthControl(): AppearanceControl {
  return {
    ...CONTEXTUAL_CONTROL_REGISTRY.strokeWidth,
    id: 'strokeWidth',
    kind: 'strokeWidth',
    value: { type: 'mixed' },
  }
}

function translateShared(
  value: SharedStyle<string>,
  vocabulary: Record<string, string>,
): SharedStyle<string> {
  if (value.type !== 'shared') return { type: 'mixed' }
  return { type: 'shared', value: vocabulary[value.value] ?? value.value }
}

/**
 * ONE Line shape control however many connector kinds are selected.
 *
 * WHY: an arrow's kind, a line's spline and a cable's routing are three stock
 * StyleProps for the same user concept, already unified by the toolbar as
 * ArrowPreset ("a preset IS a routing" — toolbarModel.ts). Emitting a control
 * per StyleProp is what used to render two or three identical "Line shape"
 * dropdowns for a mixed arrow/line/cable selection. Every present style is
 * read into the canonical vocabulary here; `applyLineShape` in
 * AppearanceControls.tsx writes the choice back to all of them.
 */
function lineShapeControl(
  styles: ReadonlySharedStyleMap,
  arrowRouting: ArrowRoutingReading,
): AppearanceControl | undefined {
  const readings: SharedStyle<string>[] = []
  if (styles.get(ArrowShapeKindStyle as StyleProp<string>)) {
    readings.push(arrowRouting && arrowRouting !== 'mixed'
      ? { type: 'shared', value: arrowRouting }
      : { type: 'mixed' })
  }
  const routing = styles.get(ConnectionRoutingStyle as StyleProp<string>)
  if (routing) readings.push(translateShared(routing, CONNECTION_ROUTING_TO_LINE_SHAPE))
  const spline = styles.get(LineShapeSplineStyle as StyleProp<string>)
  if (spline) readings.push(translateShared(spline, SPLINE_TO_LINE_SHAPE))
  if (readings.length === 0) return undefined
  return {
    ...CONTEXTUAL_CONTROL_REGISTRY.lineShape,
    id: 'lineShape',
    kind: 'lineShape',
    value: combineSharedStyles(readings) ?? { type: 'mixed' },
  }
}

function recipeOrder(connector: boolean): readonly AppearanceControlId[] {
  const recipe = connector ? CONNECTOR_CONTEXTUAL_RECIPE : SHAPE_CONTEXTUAL_RECIPE
  return recipe.groups.flatMap((group) => group.items)
    .filter((kind): kind is AppearanceControlId => kind !== 'bold' && kind !== 'addText')
}

/** Build the relevant stock/meta controls through the shared surface recipe. */
export function buildAppearanceControls(
  styles: ReadonlySharedStyleMap | null,
  hasText: boolean,
  arrowRouting: ArrowRoutingReading = null,
): AppearanceControl[] {
  if (!styles) return []
  const connector = isConnectorSelection(styles)
  const lineStyle = connector ? connectorLineStyleControl(styles) : undefined
  const suppressTypography = connector ? Boolean(lineStyle) : !hasText
  const controls: AppearanceControl[] = []

  for (const kind of recipeOrder(connector)) {
    if (suppressTypography && TYPOGRAPHY_IDS.has(kind)) continue
    if (connector && !lineStyle && kind === 'size') continue
    if (kind === 'lineShape') {
      const lineShape = lineShapeControl(styles, arrowRouting)
      if (lineShape) controls.push(lineShape)
      continue
    }
    if (kind === 'lineStyle') {
      if (lineStyle) {
        controls.push(lineStyle)
        continue
      }
      if (connector) {
        // A Text shape selected beside a dash-less cable keeps its own size.
        const sizeStyle = DefaultSizeStyle as StyleProp<string>
        const size = styles.get(sizeStyle)
        if (size) controls.push(bindStyleControl('size', sizeStyle, size))
      }
      continue
    }
    if (kind === 'strokeColor') {
      const stroke = strokeColorControl(styles)
      if (stroke) {
        controls.push(stroke)
        continue
      }
      // Freehand strokes have line style but no separately paintable edge.
      // They still get the thickness row above the chips: it is the same edge
      // concept and the same paint seam, only without a palette under it.
      const dashStyle = DefaultDashStyle as StyleProp<string>
      const dash = styles.get(dashStyle)
      if (dash) controls.push(lineStyleWithThickness(dashStyle, dash))
      continue
    }
    if (kind === 'fill' || kind === 'strokeWidth') continue
    const style = STYLE_BY_KIND[kind]
    if (!style) continue
    const value = styles.get(style)
    if (!value) continue
    const control = bindStyleControl(kind, style, value)
    if (kind === 'color') {
      const fill = fillControl(styles)
      if (fill) {
        control.modeControl = fill
        control.modePlacement = 'above'
      }
    }
    controls.push(control)
  }

  return controls
}

export interface EdgeValues {
  color: string | null
  pattern: string | null
  width: string | null
}

export const EDGE_MIXED = '\u0000mixed'

function edgeShared(value: string | null): SharedStyle<string> | undefined {
  if (value === null) return undefined
  return value === EDGE_MIXED ? { type: 'mixed' } : { type: 'shared', value }
}

/**
 * Replace stock fallbacks with the edge values actually stored on selected
 * shapes, all the way down the stacked/beside chain.
 *
 * A section backed by a StyleProp keeps its stock reading when the selection
 * has no meta of its own to report — that is the fallback the Line style chips
 * have always relied on. A section backed ONLY by meta has no such fallback,
 * so a null reading means nothing in the selection could carry it and the
 * section is dropped, whatever it was carrying spliced up in its place. That
 * is what keeps the thickness row off a Block cable, whose width is semantic
 * and whose painter would ignore the override.
 */
export function withEdgeValues(
  control: AppearanceControl,
  values: EdgeValues,
): AppearanceControl {
  const mode = control.modeControl
  const resolved = mode ? withEdgeValues(mode, values) : undefined
  const unpaintable = resolved !== undefined
    && resolved.style === undefined
    && resolved.meta !== undefined
    && values[resolved.meta] === null
  const nextMode = unpaintable ? resolved.modeControl : resolved
  const own = control.meta ? edgeShared(values[control.meta]) : undefined
  if (nextMode === mode && !own) return control
  return {
    ...control,
    ...(own ? { value: own } : {}),
    modeControl: nextMode,
    ...(nextMode ? {} : { modePlacement: undefined }),
  }
}

export { CUSTOM_LABEL, MIXED_LABEL }

export function selectedOption(control: AppearanceControl): AppearanceOption | undefined {
  if (control.value.type !== 'shared') return undefined
  const value = control.value.value
  const found = control.options.find((candidate) => candidate.value === value)
  if (found) return found
  if ((control.kind === 'color' || control.kind === 'strokeColor')
    && isCustomColor(value)) {
    return { value, label: CUSTOM_LABEL }
  }
  return undefined
}

export function unofferedValue(control: AppearanceControl): string | undefined {
  if (control.value.type !== 'shared') return undefined
  return selectedOption(control) ? undefined : control.value.value
}

export function triggerLabel(control: AppearanceControl): string {
  const valueName = (candidate: AppearanceControl): string => {
    const selected = selectedOption(candidate)
    if (selected) return selected.label.toLowerCase()
    return unofferedValue(candidate) ?? MIXED_LABEL.toLowerCase()
  }
  // Every section a stacked icon trigger hides gets named, deepest first, so
  // the one label says the whole state the icon cannot show.
  const stack: AppearanceControl[] = []
  let mode = control.trigger === 'icon' && control.modePlacement === 'above'
    ? control.modeControl
    : undefined
  while (mode) {
    stack.unshift(mode)
    mode = mode.modePlacement === 'above' ? mode.modeControl : undefined
  }
  const value = [...stack, control].map(valueName).join(' ')
  return `${control.label}, ${value}`
}
