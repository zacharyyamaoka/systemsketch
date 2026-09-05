import {
  startEditingShapeWithRichText,
  useEditor,
  useRelevantStyles,
  useValue,
  type Editor,
  type ReadonlySharedStyleMap,
  type StyleProp,
  type TLArrowShape,
  type TLShape,
} from 'tldraw'

import {
  buildAppearanceControls,
  isConnectorSelection,
  type AppearanceControl,
} from './appearanceModel'
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
 * The stock-style adapter. It binds tldraw values and commands into the same
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

  const appearance = buildAppearanceControls(styles, hasText).map((control) => {
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
      } else {
        applyStyle(editor, control.style, value, { markHistory: !options?.continuous })
      }
    },
  })
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
