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
  style: StyleProp<string>
  value: SharedStyle<string>
  meta?: StrokeMetaField
  modeControl?: AppearanceControl
  modePlacement?: 'above' | 'beside'
}

export const APPEARANCE_COLORS = CONTEXTUAL_CONTROL_REGISTRY.color.options
  .map((candidate) => candidate.value)
export const APPEARANCE_COLOR_COLUMNS = CONTEXTUAL_CONTROL_REGISTRY.color.columns ?? 11

const STYLE_BY_KIND: Partial<Record<AppearanceControlId, StyleProp<string>>> = {
  geo: GeoShapeGeoStyle as StyleProp<string>,
  color: DefaultColorStyle as StyleProp<string>,
  fill: DefaultFillStyle as StyleProp<string>,
  dash: DefaultDashStyle as StyleProp<string>,
  lineStyle: DefaultDashStyle as StyleProp<string>,
  strokeColor: DefaultColorStyle as StyleProp<string>,
  // A Code block's own StyleProp — see `contextualControlRegistry.ts`'s
  // `codeLanguage` entry for why it rides this same generic loop instead of
  // a bespoke Code-only control.
  codeLanguage: CodeLanguageStyle as StyleProp<string>,
  size: DefaultSizeStyle as StyleProp<string>,
  weight: DefaultSizeStyle as StyleProp<string>,
  font: DefaultFontStyle as StyleProp<string>,
  align: DefaultHorizontalAlignStyle as StyleProp<string>,
  verticalAlign: DefaultVerticalAlignStyle as StyleProp<string>,
  arrowKind: ArrowShapeKindStyle as StyleProp<string>,
  spline: LineShapeSplineStyle as StyleProp<string>,
  connectionRouting: ConnectionRoutingStyle as StyleProp<string>,
  arrowheadStart: ArrowShapeArrowheadStartStyle as StyleProp<string>,
  arrowheadEnd: ArrowShapeArrowheadEndStyle as StyleProp<string>,
}

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
  control.modeControl = bindStyleControl('lineStyle', dashStyle, dash)
  control.modeControl.layout = 'chips'
  control.modePlacement = 'above'
  return control
}

/** A connector's line style is the same options with labels hidden and weight beside it. */
function connectorLineStyleControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const dashStyle = DefaultDashStyle as StyleProp<string>
  const dash = styles.get(dashStyle)
  if (!dash) return undefined
  const control = bindStyleControl('lineStyle', dashStyle, dash)
  control.layout = 'row'
  const sizeStyle = DefaultSizeStyle as StyleProp<string>
  const size = styles.get(sizeStyle)
  if (size) {
    control.modeControl = bindStyleControl('weight', sizeStyle, size)
    control.modePlacement = 'beside'
  }
  return control
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
): AppearanceControl[] {
  if (!styles) return []
  const connector = isConnectorSelection(styles)
  const lineStyle = connector ? connectorLineStyleControl(styles) : undefined
  const suppressTypography = connector ? Boolean(lineStyle) : !hasText
  const controls: AppearanceControl[] = []

  for (const kind of recipeOrder(connector)) {
    if (suppressTypography && TYPOGRAPHY_IDS.has(kind)) continue
    if (connector && !lineStyle && kind === 'size') continue
    if (kind === 'lineStyle') {
      if (lineStyle) {
        controls.push(lineStyle)
        continue
      }
      // A Text shape selected beside a dash-less cable keeps its own size.
      const sizeStyle = DefaultSizeStyle as StyleProp<string>
      const size = styles.get(sizeStyle)
      if (size) controls.push(bindStyleControl('size', sizeStyle, size))
      continue
    }
    if (kind === 'strokeColor') {
      const stroke = strokeColorControl(styles)
      if (stroke) {
        controls.push(stroke)
        continue
      }
      // Freehand strokes have line style but no separately paintable edge.
      const dashStyle = DefaultDashStyle as StyleProp<string>
      const dash = styles.get(dashStyle)
      if (dash) controls.push(bindStyleControl('lineStyle', dashStyle, dash))
      continue
    }
    if (kind === 'fill' || kind === 'weight' || kind === 'dash') continue
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
}

export const EDGE_MIXED = '\u0000mixed'

function edgeShared(value: string | null): SharedStyle<string> | undefined {
  if (value === null) return undefined
  return value === EDGE_MIXED ? { type: 'mixed' } : { type: 'shared', value }
}

/** Replace stock fallbacks with the edge values actually stored on selected shapes. */
export function withEdgeValues(
  control: AppearanceControl,
  values: EdgeValues,
): AppearanceControl {
  const mode = control.modeControl
  const modeValue = mode?.meta ? edgeShared(values[mode.meta]) : undefined
  const own = control.meta ? edgeShared(values[control.meta]) : undefined
  if (!modeValue && !own) return control
  return {
    ...control,
    ...(own ? { value: own } : {}),
    ...(mode && modeValue ? { modeControl: { ...mode, value: modeValue } } : {}),
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
  const stacked = control.trigger === 'icon' && control.modePlacement === 'above'
    ? control.modeControl
    : undefined
  const value = stacked ? `${valueName(stacked)} ${valueName(control)}` : valueName(control)
  return `${control.label}, ${value}`
}
