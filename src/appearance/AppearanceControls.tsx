import {
  startEditingShapeWithRichText,
  useEditor,
  useRelevantStyles,
  useValue,
  DefaultSizeStyle,
  type Editor,
  type ReadonlySharedStyleMap,
  type StyleProp,
  type TLArrowShape,
  type TLShape,
} from 'tldraw'

import {
  buildAppearanceControls,
  isConnectorSelection,
  withEdgeValues,
  EDGE_MIXED,
  type AppearanceControl,
  type EdgeValues,
} from './appearanceModel'
import {
  applyLinePattern,
  applyStrokeMeta,
  linePatternOf,
  sharedEdgeValue,
  strokeColorOf,
} from './strokeMeta'
import { resetCustomFontScale } from './customFontSize'
import { addTextTarget, selectionHasVisibleText } from './textPresence'
import {
  applyArrowPresetToSelection,
  arrowPresetForShape,
} from '../toolbar/toolbarIntegration'
import type { ArrowPreset } from '../toolbar/toolbarModel'
import {
  CONNECTOR_CONTEXTUAL_RECIPE,
  SHAPE_CONTEXTUAL_RECIPE,
  bindContextualControl,
  composeContextualControls,
  type ContextualControl,
} from '../contextualMenus/contextualControlRegistry'
import { ContextualControls } from '../contextualMenus/ContextualControls'

/**
 * The stock-style/meta adapter. It binds tldraw and edge values into the same
 * registered controls that Block-title formatting uses.
 */
export function AppearanceControls() {
  const editor = useEditor()
  const styles = useRelevantStyles()
  const hasText = useValue(
    'systemsketch selection has text',
    () => selectionHasVisibleText(editor),
    [editor],
  )
  const addTextShape = useValue(
    'systemsketch add text target',
    () => addTextTarget(editor),
    [editor],
  )
  const selectedArrowRouting = useValue(
    'selected arrow routing',
    () => {
      const arrows = editor.getSelectedShapes()
        .filter((shape): shape is TLArrowShape => shape.type === 'arrow')
      if (arrows.length === 0) return null
      const first = arrowPresetForShape(arrows[0])
      return arrows.every((shape) => arrowPresetForShape(shape) === first)
        ? first
        : 'mixed'
    },
    [editor],
  )
  const edges = useEdgeValues(editor)

  const appearance = buildAppearanceControls(styles, hasText).map((control) => {
    const withEdges = withEdgeValues(control, edges)
    if (withEdges !== control) return withEdges
    if (control.kind !== 'arrowKind' || selectedArrowRouting === null) return control
    return {
      ...control,
      value: selectedArrowRouting === 'mixed'
        ? { type: 'mixed' as const }
        : { type: 'shared' as const, value: selectedArrowRouting },
    }
  })
  const candidates = appearance.map((control) => bindAppearanceControl(editor, control))
  if (addTextShape) candidates.push(bindAddTextControl(editor, addTextShape))
  const recipe = styles && isConnectorSelection(styles)
    ? CONNECTOR_CONTEXTUAL_RECIPE
    : SHAPE_CONTEXTUAL_RECIPE
  const composition = composeContextualControls(recipe, candidates)
  if (composition.groups.length === 0) return null

  return (
    <ContextualControls
      composition={composition}
      popoverMode="selection"
      testId="systemsketch-appearance"
      label="Selection appearance"
    />
  )
}

/** The shared predicate prevents the selection shell from mounting an empty pill. */
export function hasAppearanceControls(
  styles: ReadonlySharedStyleMap | null,
  hasText: boolean,
  addTextShape: TLShape | null,
): boolean {
  return buildAppearanceControls(styles, hasText).length > 0 || addTextShape !== null
}

function useEdgeValues(editor: Editor): EdgeValues {
  const color = useValue(
    'systemsketch edge colour',
    () => encodeEdge(sharedEdgeValue(editor.getSelectedShapes(), strokeColorOf)),
    [editor],
  )
  const pattern = useValue(
    'systemsketch edge line style',
    () => encodeEdge(sharedEdgeValue(editor.getSelectedShapes(), linePatternOf)),
    [editor],
  )
  return { color, pattern }
}

function encodeEdge(shared: ReturnType<typeof sharedEdgeValue>): string | null {
  if (!shared) return null
  return shared.type === 'shared' ? shared.value : EDGE_MIXED
}

function bindAddTextControl(editor: Editor, shape: TLShape): ContextualControl {
  return bindContextualControl('addText', {
    id: 'addText',
    value: null,
    onSelect: () => {
      editor.markHistoryStoppingPoint('add text')
      startEditingShapeWithRichText(editor, shape, { selectAll: true })
    },
  })
}

function bindAppearanceControl(editor: Editor, control: AppearanceControl): ContextualControl {
  const bound = bindContextualControl(control.kind, {
    id: control.id,
    value: control.value,
    customColorOpacity: control.kind === 'color',
    onSelect: (value, options) => {
      if (!value) return
      if (control.kind === 'arrowKind' && isArrowPreset(value)) {
        applyArrowRouting(editor, value, { markHistory: !options?.continuous })
      } else if (control.meta === 'pattern') {
        applyLinePattern(editor, value)
      } else if (control.meta === 'color') {
        applyStrokeMeta(editor, 'color', value)
      } else {
        applyStyle(editor, control.style, value, { markHistory: !options?.continuous })
      }
    },
  })
  // `bindContextualControl` supplies the canonical definition; the appearance
  // model may only tailor layout (labels shown/hidden) for this composition.
  bound.layout = control.layout
  if (control.modeControl) {
    bound.modeControl = bindAppearanceControl(editor, control.modeControl)
    bound.modePlacement = control.modePlacement
  }
  return bound
}

/** Apply a style the way tldraw's own panel does: both current and next scopes. */
export function applyStyle(
  editor: Editor,
  style: StyleProp<string>,
  value: string,
  { markHistory = true }: { markHistory?: boolean } = {},
) {
  if (markHistory) editor.markHistoryStoppingPoint('appearance')
  editor.run(() => {
    if (editor.isIn('select')) editor.setStyleForSelectedShapes(style, value)
    editor.setStyleForNextShapes(style, value)
    // A preset must actually render at its named size: clear any custom scale
    // in the same history step, or the checked row in the Font size list
    // (`ContextualControls.tsx`'s `ControlPanel`) would lie.
    if (style === DefaultSizeStyle) resetCustomFontScale(editor)
  })
}

function isArrowPreset(value: string): value is ArrowPreset {
  return value === 'straight' || value === 'curve' || value === 'elbow'
}

/** One history step around the stock arrow prop translation. */
export function applyArrowRouting(
  editor: Editor,
  preset: ArrowPreset,
  { markHistory = true }: { markHistory?: boolean } = {},
) {
  if (markHistory) editor.markHistoryStoppingPoint('appearance')
  editor.run(() => applyArrowPresetToSelection(editor, preset))
}
