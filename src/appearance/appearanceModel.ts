/**
 * Stock tldraw style bindings for the shared contextual-control registry.
 *
 * This file decides which registered controls are relevant to a selection and
 * binds them to tldraw StyleProps. Labels, options, previews, grouping, and
 * order live in contextualControlRegistry.ts and are reused by non-stock text
 * targets such as a Block title.
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

export type { AppearanceControlId }
export type AppearanceLayout = ContextualControlLayout
export type AppearanceTrigger = ContextualControlTrigger
export type AppearanceOption = ContextualControlOption

export interface AppearanceControl extends ContextualControlDefinition {
  id: AppearanceControlId
  kind: AppearanceControlId
  style: StyleProp<string>
  value: SharedStyle<string>
  modeControl?: AppearanceControl
  modePlacement?: 'above' | 'beside'
}

export const APPEARANCE_COLORS = CONTEXTUAL_CONTROL_REGISTRY.color.options
  .map((candidate) => candidate.value)
export const APPEARANCE_COLOR_COLUMNS = CONTEXTUAL_CONTROL_REGISTRY.color.columns ?? 11

const STYLE_BY_KIND: Readonly<Record<Exclude<AppearanceControlId, 'fill' | 'lineStyle' | 'weight'>, StyleProp<string>>> = {
  geo: GeoShapeGeoStyle as StyleProp<string>,
  color: DefaultColorStyle as StyleProp<string>,
  dash: DefaultDashStyle as StyleProp<string>,
  size: DefaultSizeStyle as StyleProp<string>,
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

function lineStyleControl(styles: ReadonlySharedStyleMap): AppearanceControl | undefined {
  const style = DefaultDashStyle as StyleProp<string>
  const value = styles.get(style)
  if (!value) return undefined
  const control = bindStyleControl('lineStyle', style, value)
  const sizeStyle = DefaultSizeStyle as StyleProp<string>
  const size = styles.get(sizeStyle)
  if (size) {
    // One visual menu item composes two stock styles: tldraw stores weight and
    // dash separately, while FigJam presents them together as Line style.
    control.modeControl = bindStyleControl('weight', sizeStyle, size)
    control.modePlacement = 'beside'
  }
  return control
}

function recipeOrder(connector: boolean): readonly Exclude<AppearanceControlId, 'weight'>[] {
  const recipe = connector ? CONNECTOR_CONTEXTUAL_RECIPE : SHAPE_CONTEXTUAL_RECIPE
  return recipe.groups.flatMap((group) => group.items)
    .filter((kind): kind is Exclude<AppearanceControlId, 'weight'> => (
      kind !== 'bold' && kind !== 'addText' && kind !== 'weight'
    ))
}

/** Build the relevant stock-style controls through the shared surface recipe. */
export function buildAppearanceControls(
  styles: ReadonlySharedStyleMap | null,
  hasText: boolean,
): AppearanceControl[] {
  if (!styles) return []
  const connector = isConnectorSelection(styles)
  const lineStyle = connector ? lineStyleControl(styles) : undefined
  // A plain shape earns typography only after it contains text. A genuine
  // connector never does; its registered Add text action is the public seam.
  const suppressTypography = connector ? Boolean(lineStyle) : !hasText
  const controls: AppearanceControl[] = []

  for (const kind of recipeOrder(connector)) {
    if (suppressTypography && TYPOGRAPHY_IDS.has(kind)) continue
    if (kind === 'lineStyle') {
      if (lineStyle) controls.push(lineStyle)
      continue
    }
    if (kind === 'fill') continue
    const style = STYLE_BY_KIND[kind]
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

export { CUSTOM_LABEL, MIXED_LABEL }

export function selectedOption(control: AppearanceControl): AppearanceOption | undefined {
  if (control.value.type !== 'shared') return undefined
  const value = control.value.value
  const found = control.options.find((candidate) => candidate.value === value)
  if (found) return found
  if (control.kind === 'color' && isCustomColor(value)) {
    return { value, label: CUSTOM_LABEL }
  }
  return undefined
}

export function triggerLabel(control: AppearanceControl): string {
  const selected = selectedOption(control)
  return `${control.label}, ${selected ? selected.label.toLowerCase() : MIXED_LABEL.toLowerCase()}`
}
