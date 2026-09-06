import type { SharedStyle } from 'tldraw'

import { FIGJAM_COLOR_NAMES, FIGJAM_PALETTE_COLUMNS } from '../appearance/figjamPalette'
import { isCustomColor } from '../appearance/customColors'
import { ASYNC_LINE_VALUE, type StrokeMetaField } from '../appearance/strokeMeta'
import { CODE_LANGUAGES, CODE_LANGUAGE_LABELS } from '../code/codeModel'

export type ContextualControlKind =
  | 'geo'
  | 'color'
  | 'fill'
  | 'dash'
  | 'lineStyle'
  | 'strokeColor'
  | 'codeLanguage'
  | 'size'
  | 'weight'
  | 'font'
  | 'align'
  | 'verticalAlign'
  | 'arrowKind'
  | 'spline'
  | 'connectionRouting'
  | 'arrowheadStart'
  | 'arrowheadEnd'
  | 'bold'
  | 'addText'

export type AppearanceControlId = Exclude<ContextualControlKind, 'bold' | 'addText'>
export type ContextualControlLayout = 'swatches' | 'row' | 'chips' | 'list' | 'library'
export type ContextualControlTrigger = 'value' | 'icon' | 'text' | 'toggle' | 'action'

export interface ContextualControlOption {
  value: string
  label: string
}

export interface ContextualControlDefinition {
  kind: ContextualControlKind
  label: string
  options: readonly ContextualControlOption[]
  layout: ContextualControlLayout
  trigger: ContextualControlTrigger
  columns?: number
  custom?: boolean
  /** Edge paint stored in shape metadata rather than a stock StyleProp. */
  meta?: StrokeMetaField
}

export interface ContextualControl extends ContextualControlDefinition {
  /** Stable id for DOM hooks and surface-specific tests. */
  id: string
  value: SharedStyle<string> | null
  onSelect(value?: string, options?: { continuous?: boolean }): void
  automaticOption?: ContextualControlOption
  /** Whether this target maps custom-colour alpha onto its own document model. */
  customColorOpacity?: boolean
  modeControl?: ContextualControl
  modePlacement?: 'above' | 'beside'
}

export interface ContextualControlGroup {
  id: string
  controls: readonly ContextualControl[]
}

export interface ContextualControlComposition {
  id: string
  groups: readonly ContextualControlGroup[]
}

export interface ContextualControlRecipe {
  id: string
  groups: readonly {
    id: string
    items: readonly ContextualControlKind[]
  }[]
}

const option = (value: string, label: string): ContextualControlOption => ({ value, label })

const FILL_OPTIONS = [
  option('solid', 'Solid'),
  option('semi', 'Transparent'),
  option('none', 'No fill'),
] as const

const DASH_OPTIONS = [
  option('solid', 'Solid'),
  option('dashed', 'Dashed'),
  option('dotted', 'Dotted'),
  option(ASYNC_LINE_VALUE, 'Async'),
  option('none', 'None'),
] as const

const SIZE_OPTIONS = [
  option('s', 'Small'),
  option('m', 'Medium'),
  option('l', 'Large'),
  option('xl', 'Extra large'),
] as const

const WEIGHT_OPTIONS = [
  option('m', 'Thin'),
  option('xl', 'Thick'),
] as const

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

const CONNECTION_ROUTING_OPTIONS = [
  option('elbow', 'Elbowed'),
  option('curved', 'Curved'),
  option('straight', 'Straight'),
] as const

const ARROW_KIND_OPTIONS = [
  option('elbow', 'Elbowed'),
  option('curve', 'Curved'),
  option('straight', 'Straight'),
] as const

const SPLINE_OPTIONS = [
  option('cubic', 'Curved'),
  option('line', 'Straight'),
] as const

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

const CODE_LANGUAGE_OPTIONS = CODE_LANGUAGES.map((value) => option(value, CODE_LANGUAGE_LABELS[value]))

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

/**
 * One vocabulary for every contextual control. Surfaces bind values and
 * commands; they do not re-declare labels, options, previews, or layouts.
 */
export const CONTEXTUAL_CONTROL_REGISTRY: Readonly<Record<ContextualControlKind, ContextualControlDefinition>> = {
  geo: { kind: 'geo', label: 'Shape', options: GEO_OPTIONS, layout: 'library', trigger: 'icon' },
  color: {
    kind: 'color', label: 'Color',
    options: FIGJAM_COLOR_NAMES.map((value) => option(value, value)),
    layout: 'swatches', trigger: 'value', columns: FIGJAM_PALETTE_COLUMNS, custom: true,
  },
  fill: { kind: 'fill', label: 'Fill', options: FILL_OPTIONS, layout: 'chips', trigger: 'value' },
  dash: { kind: 'dash', label: 'Line style', options: DASH_OPTIONS, layout: 'chips', trigger: 'icon' },
  lineStyle: {
    kind: 'lineStyle', label: 'Line style', options: DASH_OPTIONS,
    layout: 'chips', trigger: 'icon', meta: 'pattern',
  },
  strokeColor: {
    kind: 'strokeColor', label: 'Line style',
    options: FIGJAM_COLOR_NAMES.map((value) => option(value, value)),
    layout: 'swatches', trigger: 'icon', columns: FIGJAM_PALETTE_COLUMNS,
    meta: 'color',
  },
  codeLanguage: {
    kind: 'codeLanguage', label: 'Language', options: CODE_LANGUAGE_OPTIONS, layout: 'list', trigger: 'text',
  },
  size: { kind: 'size', label: 'Font size', options: SIZE_OPTIONS, layout: 'list', trigger: 'text' },
  weight: { kind: 'weight', label: 'Weight', options: WEIGHT_OPTIONS, layout: 'row', trigger: 'value' },
  font: { kind: 'font', label: 'Typeface', options: FONT_OPTIONS, layout: 'list', trigger: 'icon' },
  align: { kind: 'align', label: 'Text alignment', options: ALIGN_OPTIONS, layout: 'row', trigger: 'value' },
  verticalAlign: {
    kind: 'verticalAlign', label: 'Vertical alignment',
    options: VERTICAL_ALIGN_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowKind: { kind: 'arrowKind', label: 'Line shape', options: ARROW_KIND_OPTIONS, layout: 'row', trigger: 'value' },
  spline: { kind: 'spline', label: 'Line shape', options: SPLINE_OPTIONS, layout: 'row', trigger: 'value' },
  connectionRouting: {
    kind: 'connectionRouting', label: 'Line shape',
    options: CONNECTION_ROUTING_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowheadStart: {
    kind: 'arrowheadStart', label: 'Start point',
    options: ARROWHEAD_OPTIONS, layout: 'row', trigger: 'value',
  },
  arrowheadEnd: {
    kind: 'arrowheadEnd', label: 'End point',
    options: ARROWHEAD_OPTIONS, layout: 'row', trigger: 'value',
  },
  bold: { kind: 'bold', label: 'Bold', options: [], layout: 'row', trigger: 'toggle' },
  addText: { kind: 'addText', label: 'Add text', options: [], layout: 'row', trigger: 'action' },
}

export const SHAPE_CONTEXTUAL_RECIPE: ContextualControlRecipe = {
  id: 'shape',
  groups: [
    { id: 'identity', items: ['geo'] },
    { id: 'paint', items: ['color', 'strokeColor'] },
    // `codeLanguage` is absent from every candidate list except a selected
    // Code block's own — see `buildAppearanceControls` — so it costs nothing
    // for any other shape's recipe to carry the slot.
    { id: 'type', items: ['codeLanguage', 'font', 'size'] },
    { id: 'alignment', items: ['align', 'verticalAlign'] },
  ],
}

// Connector typography is intentionally absent once a real dash-bearing
// connector is selected: FigJam keeps connector labels fixed and offers an
// explicit Add text action instead. Mixed selections can still contribute
// type controls when no connector Line style is actually available.
export const CONNECTOR_CONTEXTUAL_RECIPE: ContextualControlRecipe = {
  id: 'connector',
  groups: [
    { id: 'identity', items: ['geo'] },
    { id: 'paint', items: ['color', 'lineStyle', 'addText'] },
    { id: 'type', items: ['size', 'font'] },
    { id: 'alignment', items: ['align', 'verticalAlign'] },
    {
      id: 'flow',
      items: ['arrowheadStart', 'connectionRouting', 'arrowKind', 'spline', 'arrowheadEnd'],
    },
  ],
}

export const BLOCK_TITLE_CONTEXTUAL_RECIPE: ContextualControlRecipe = {
  id: 'block-title',
  groups: [
    { id: 'type', items: ['font', 'size'] },
    { id: 'emphasis', items: ['bold'] },
    { id: 'ink', items: ['color'] },
    { id: 'alignment', items: ['align'] },
  ],
}

export function bindContextualControl(
  kind: ContextualControlKind,
  binding: Pick<ContextualControl, 'id' | 'value' | 'onSelect'>
    & Partial<Pick<
      ContextualControl,
      'automaticOption' | 'customColorOpacity' | 'modeControl' | 'modePlacement'
    >>,
): ContextualControl {
  return { ...CONTEXTUAL_CONTROL_REGISTRY[kind], ...binding, kind }
}

/** Resolve visibility, grouping, and order from data rather than surface JSX. */
export function composeContextualControls(
  recipe: ContextualControlRecipe,
  candidates: readonly ContextualControl[],
): ContextualControlComposition {
  const byKind = new Map(candidates.map((control) => [control.kind, control]))
  return {
    id: recipe.id,
    groups: recipe.groups.flatMap((group) => {
      const controls = group.items.flatMap((kind) => {
        const control = byKind.get(kind)
        return control ? [control] : []
      })
      return controls.length > 0 ? [{ id: group.id, controls }] : []
    }),
  }
}

export function contextualControlIds(composition: ContextualControlComposition): string[] {
  return composition.groups.flatMap((group) => group.controls.map((control) => control.id))
}

export const CUSTOM_LABEL = 'Custom'
export const MIXED_LABEL = 'Mixed'

export function selectedContextualOption(
  control: ContextualControl,
): ContextualControlOption | undefined {
  if (control.value?.type !== 'shared') return undefined
  const value = control.value.value
  const found = control.options.find((candidate) => candidate.value === value)
  if (found) return found
  if (control.automaticOption?.value === value) return control.automaticOption
  if ((control.kind === 'color' || control.kind === 'strokeColor') && isCustomColor(value)) {
    return option(value, CUSTOM_LABEL)
  }
  return undefined
}

export function contextualTriggerLabel(control: ContextualControl): string {
  const valueName = (candidate: ContextualControl): string => {
    const selected = selectedContextualOption(candidate)
    if (selected) return selected.label.toLowerCase()
    if (candidate.value?.type === 'shared') return candidate.value.value
    return MIXED_LABEL.toLowerCase()
  }
  const stacked = control.trigger === 'icon' && control.modePlacement === 'above'
    ? control.modeControl
    : undefined
  const value = stacked ? `${valueName(stacked)} ${valueName(control)}` : valueName(control)
  return `${control.label}, ${value}`
}
