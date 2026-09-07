/**
 * The contextual-menu lab: every composition lever, as data you can press.
 *
 * WHY this exists at all — Zach, 2026-09-06: "I'm tired of these contextual
 * menus being so buggy… show me how you can build and compose these contextual
 * menus in an incredibly modular way… make a generic contextual menu with all
 * the different configuration levers that I can just press myself."
 *
 * PRIOR ART, and why the architecture already here is the right one rather
 * than something to reinvent:
 *
 * - **VS Code's `menus` contribution point.** A command is declared ONCE; a
 *   surface says which commands it wants via `group@order` and a `when`
 *   clause. Nothing about a command's label, icon, or keybinding is restated
 *   per menu. `CONTEXTUAL_CONTROL_REGISTRY` is the command table,
 *   `ContextualControlRecipe` is the `menus` contribution, and
 *   `composeContextualControls` is the resolver.
 * - **Blender's `layout.prop()`.** A panel is a nesting of rows and columns
 *   that BIND to properties; the widget for a property is chosen from the
 *   property's own type, never restated at the call site. That is exactly what
 *   the registry's `glyph` family and `layout` do here.
 * - **Tweakpane / leva / dat.GUI.** A control panel generated from a schema of
 *   levers. That is the shape of this lab itself.
 * - **Zach's own [[C - Semantic Type Registry]]**: "resolve semantics once,
 *   then project them many times", and "give plugins a constrained
 *   contribution point rather than an unbounded new visual language".
 *
 * So the lab is deliberately NOT a second menu implementation. It builds the
 * same `ContextualControl` objects the appearance pill builds and hands them
 * to the same `ContextualControls` renderer. If a lever composes here, it
 * composes in the product — and if it is buggy here, the product bug is
 * reproducible without a canvas selection.
 */
import {
  CONTEXTUAL_CONTROL_REGISTRY,
  bindContextualControl,
  composeContextualControls,
  type ContextualControl,
  type ContextualControlComposition,
  type ContextualControlKind,
  type ContextualControlLayout,
  type ContextualControlRecipe,
  type ContextualControlTrigger,
} from '../../contextualMenus/contextualControlRegistry'

/** Where a control is drawn relative to the one it is stacked onto. */
export type LabStackPlacement = 'none' | 'above' | 'beside'

/** Which of a control's own values it is currently reading. */
export type LabValueState = 'first' | 'second' | 'mixed'

export const LAB_LAYOUTS: readonly ContextualControlLayout[] =
  ['swatches', 'row', 'chips', 'list', 'library']

export const LAB_TRIGGERS: readonly ContextualControlTrigger[] =
  ['value', 'icon', 'text', 'toggle', 'action']

export const LAB_STACK_PLACEMENTS: readonly LabStackPlacement[] = ['none', 'above', 'beside']

export const LAB_VALUE_STATES: readonly LabValueState[] = ['first', 'second', 'mixed']

export interface LabControlState {
  kind: ContextualControlKind
  included: boolean
  layout: ContextualControlLayout
  trigger: ContextualControlTrigger
  /** Fold this control INTO the next included one instead of emitting it. */
  stack: LabStackPlacement
  value: LabValueState
  /** Draw the group hairline before this control. */
  breakBefore: boolean
}

export interface LabState {
  popoverMode: 'selection' | 'editing'
  controls: readonly LabControlState[]
}

export const LAB_KINDS: readonly ContextualControlKind[] =
  Object.keys(CONTEXTUAL_CONTROL_REGISTRY) as ContextualControlKind[]

function labControl(
  kind: ContextualControlKind,
  overrides: Partial<LabControlState> = {},
): LabControlState {
  const definition = CONTEXTUAL_CONTROL_REGISTRY[kind]
  return {
    kind,
    included: false,
    layout: definition.layout,
    trigger: definition.trigger,
    stack: 'none',
    value: 'first',
    breakBefore: false,
    ...overrides,
  }
}

/** Every registered kind, in registry order, none of them included yet. */
export function emptyLabState(): LabState {
  return { popoverMode: 'selection', controls: LAB_KINDS.map((kind) => labControl(kind)) }
}

export interface LabPreset {
  id: string
  label: string
  detail: string
  state: LabState
}

function withIncluded(
  order: readonly ContextualControlKind[],
  overrides: Partial<Record<ContextualControlKind, Partial<LabControlState>>> = {},
): LabState {
  const chosen = new Set(order)
  const included = order.map((kind) => labControl(kind, { included: true, ...overrides[kind] }))
  const rest = LAB_KINDS.filter((kind) => !chosen.has(kind)).map((kind) => labControl(kind))
  return { popoverMode: 'selection', controls: [...included, ...rest] }
}

/**
 * The product's own surfaces, expressed purely in lab levers — so the first
 * thing the lab proves is that these compositions ARE just lever settings, and
 * the second is that Zach can take one apart without touching the app.
 */
export const LAB_PRESETS: readonly LabPreset[] = [
  {
    id: 'shape',
    label: 'Shape',
    detail: 'Thickness → line style → palette, stacked in one popover',
    state: withIncluded(
      ['geo', 'color', 'strokeWidth', 'lineStyle', 'strokeColor', 'font', 'size', 'align', 'verticalAlign'],
      {
        color: { breakBefore: true },
        strokeWidth: { stack: 'above', layout: 'row' },
        lineStyle: { stack: 'above', layout: 'chips' },
        font: { breakBefore: true },
        align: { breakBefore: true },
      },
    ),
  },
  {
    id: 'connector',
    label: 'Connector',
    detail: 'Same thickness control, labels off, beside the line styles',
    state: withIncluded(
      ['color', 'strokeWidth', 'lineStyle', 'arrowheadStart', 'lineShape', 'arrowheadEnd'],
      {
        strokeWidth: { stack: 'beside', layout: 'row' },
        lineStyle: { layout: 'row' },
        arrowheadStart: { breakBefore: true },
      },
    ),
  },
  {
    id: 'block-title',
    label: 'Block title',
    detail: 'Typography only, bound to a title rather than a selection',
    state: {
      popoverMode: 'editing',
      controls: withIncluded(['font', 'size', 'bold', 'color', 'align'], {
        bold: { breakBefore: true },
        color: { breakBefore: true },
        align: { breakBefore: true },
      }).controls,
    },
  },
  {
    id: 'empty',
    label: 'Empty',
    detail: 'Start from nothing and add one control at a time',
    state: emptyLabState(),
  },
]

/** The recipe the current levers describe: group breaks become group ids. */
export function labRecipe(state: LabState): ContextualControlRecipe {
  const groups: { id: string; items: ContextualControlKind[] }[] = []
  for (const control of state.controls) {
    if (!control.included || control.stack !== 'none') continue
    if (groups.length === 0 || control.breakBefore) {
      groups.push({ id: `group-${groups.length + 1}`, items: [] })
    }
    groups[groups.length - 1].items.push(control.kind)
  }
  return { id: 'lab', groups }
}

function labValue(
  control: LabControlState,
): ContextualControl['value'] {
  if (control.value === 'mixed') return { type: 'mixed' }
  const options = CONTEXTUAL_CONTROL_REGISTRY[control.kind].options
  if (options.length === 0) return { type: 'shared', value: 'on' }
  const index = control.value === 'second' ? Math.min(1, options.length - 1) : 0
  return { type: 'shared', value: options[index].value }
}

/**
 * Bind one lab control, carrying whatever is stacked onto it.
 *
 * The bound object is an ordinary `ContextualControl` — the same type the
 * appearance model produces — so `ContextualControls` cannot tell a lab
 * composition from a product one.
 */
function bindLabControl(
  control: LabControlState,
  onSelect: (kind: ContextualControlKind, value: string | undefined) => void,
  mode?: { control: ContextualControl; placement: 'above' | 'beside' },
): ContextualControl {
  const bound = bindContextualControl(control.kind, {
    id: control.kind,
    value: labValue(control),
    onSelect: (value) => onSelect(control.kind, value),
    ...(mode ? { modeControl: mode.control, modePlacement: mode.placement } : {}),
  })
  bound.layout = control.layout
  bound.trigger = control.trigger
  return bound
}

/**
 * Fold the lever list into the candidate controls, stacking each `above` /
 * `beside` control onto the next included one — the same chain the shape's
 * Stroke popover uses for thickness → line style → palette.
 */
export function labCandidates(
  state: LabState,
  onSelect: (kind: ContextualControlKind, value: string | undefined) => void,
): ContextualControl[] {
  const candidates: ContextualControl[] = []
  let pending: { control: ContextualControl; placement: 'above' | 'beside' } | undefined
  for (const control of state.controls) {
    if (!control.included) continue
    if (control.stack !== 'none') {
      pending = {
        control: bindLabControl(control, onSelect, pending),
        placement: control.stack,
      }
      continue
    }
    candidates.push(bindLabControl(control, onSelect, pending))
    pending = undefined
  }
  return candidates
}

/**
 * Controls whose `stack` lever has nothing below it to fold into.
 *
 * WHY this is surfaced rather than silently tolerated: stacking is defined as
 * "fold into the NEXT included control", so the last control in the list has
 * no host and simply disappears from the menu. Pressing a lever and watching a
 * control vanish with no explanation is exactly the kind of quiet contextual
 * menu behaviour Zach is tired of; the lab names it instead.
 */
export function labDangling(state: LabState): ContextualControlKind[] {
  const dangling: ContextualControlKind[] = []
  let pending: ContextualControlKind[] = []
  for (const control of state.controls) {
    if (!control.included) continue
    if (control.stack !== 'none') { pending.push(control.kind); continue }
    pending = []
  }
  dangling.push(...pending)
  return dangling
}

export function labComposition(
  state: LabState,
  onSelect: (kind: ContextualControlKind, value: string | undefined) => void,
): ContextualControlComposition {
  return composeContextualControls(labRecipe(state), labCandidates(state, onSelect))
}

/** The recipe literal the current levers would be written as in source. */
export function labRecipeSource(state: LabState): string {
  const recipe = labRecipe(state)
  const groups = recipe.groups
    .map((group) => `    { id: '${group.id}', items: [${group.items.map((item) => `'${item}'`).join(', ')}] },`)
    .join('\n')
  return `const LAB_RECIPE: ContextualControlRecipe = {\n  id: 'lab',\n  groups: [\n${groups}\n  ],\n}`
}

export function setLabControl(
  state: LabState,
  kind: ContextualControlKind,
  patch: Partial<LabControlState>,
): LabState {
  return {
    ...state,
    controls: state.controls.map(
      (control) => (control.kind === kind ? { ...control, ...patch } : control),
    ),
  }
}

/**
 * Move a control past its nearest INCLUDED neighbour.
 *
 * WHY not a plain index swap: the lever list holds every registered kind, most
 * of them switched off, so a one-step swap usually trades places with a hidden
 * row and the composed menu does not move — the arrow silently does nothing.
 */
export function moveLabControl(
  state: LabState,
  kind: ContextualControlKind,
  direction: -1 | 1,
): LabState {
  const controls = [...state.controls]
  const index = controls.findIndex((control) => control.kind === kind)
  if (index < 0) return state
  let target = index + direction
  while (target >= 0 && target < controls.length && !controls[target].included) {
    target += direction
  }
  if (target < 0 || target >= controls.length) return state
  ;[controls[index], controls[target]] = [controls[target], controls[index]]
  return { ...state, controls }
}
