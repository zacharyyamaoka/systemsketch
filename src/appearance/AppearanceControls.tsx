import {
  startEditingShapeWithRichText,
  useEditor,
  useRelevantStyles,
  useValue,
  DefaultSizeStyle,
  LineShapeSplineStyle,
  type Editor,
  type ReadonlySharedStyleMap,
  type StyleProp,
  type TLArrowShape,
  type TLShape,
} from 'tldraw'

import { ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import { connectionRoutingForArrowPreset } from '../toolbar/toolbarModel'

import {
  buildAppearanceControls,
  isConnectorSelection,
  withEdgeValues,
  EDGE_MIXED,
  type AppearanceControl,
  type ArrowRoutingReading,
  type EdgeValues,
} from './appearanceModel'
import {
  applyLinePattern,
  applyStrokeMeta,
  applyStrokeWidth,
  linePatternOf,
  pinStrokeWidth,
  sharedEdgeValue,
  strokeColorOf,
  strokeWidthOf,
} from './strokeMeta'
import {
  applyCustomFontPx,
  isSizeRung,
  resetCustomFontScale,
  selectionOnPresetRungs,
  selectionRungPx,
  sharedFontPx,
  CUSTOM_FONT_PX_MAX,
  CUSTOM_FONT_PX_MIN,
} from './customFontSize'
import { sharedValueAcross } from '../contextualMenus/sharedValues'
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
    (): ArrowRoutingReading => {
      const arrows = editor.getSelectedShapes()
        .filter((shape): shape is TLArrowShape => shape.type === 'arrow')
      const shared = sharedValueAcross(arrows.map(arrowPresetForShape))
      if (!shared) return null
      return shared.type === 'shared' ? shared.value : 'mixed'
    },
    [editor],
  )
  const edges = useEdgeValues(editor)

  const appearance = buildAppearanceControls(styles, hasText, selectedArrowRouting)
    .map((control) => withEdgeValues(control, edges))
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
  // `strokeWidthOf` reads nothing off a shape whose util cannot paint the
  // override, so a cable-only selection folds to null here and the thickness
  // row is dropped by `withEdgeValues` rather than shown dead.
  const width = useValue(
    'systemsketch edge thickness',
    () => encodeEdge(sharedEdgeValue(editor.getSelectedShapes(), strokeWidthOf)),
    [editor],
  )
  return { color, pattern, width }
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
    // The continuous-size channel, bound HERE because this surface's target IS
    // the selection. The renderer itself never asks who is selected, so a
    // surface bound to an explicit shape (the Block title) simply gets a
    // presets-only size list instead of a dead selection-wired Custom cell.
    customSize: control.kind === 'size'
      ? {
          sharedPx: () => sharedFontPx(editor),
          onPresetRungs: () => selectionOnPresetRungs(editor),
          applyPx: (px) => applyCustomFontPx(editor, px),
          minPx: CUSTOM_FONT_PX_MIN,
          maxPx: CUSTOM_FONT_PX_MAX,
        }
      : undefined,
    rungPx: control.kind === 'size'
      ? (value) => (isSizeRung(value) ? selectionRungPx(editor, value) : null)
      : undefined,
    onSelect: (value, options) => {
      if (!value) return
      if (control.kind === 'lineShape' && isArrowPreset(value)) {
        applyLineShape(editor, value, { markHistory: !options?.continuous })
      } else if (control.meta === 'pattern') {
        applyLinePattern(editor, value)
      } else if (control.meta === 'color') {
        applyStrokeMeta(editor, 'color', value)
      } else if (control.meta === 'width') {
        applyStrokeWidth(editor, value)
      } else if (control.style) {
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
    if (style === DefaultSizeStyle) {
      // ...and it must change the TYPE only. `size` also drives a geo shape's
      // stroke width in stock tldraw, which is the coupling Zach reported;
      // pinning the painted thickness first is what breaks it. See
      // `pinStrokeWidth`.
      pinStrokeWidth(editor)
      resetCustomFontScale(editor)
    }
  })
}

function isArrowPreset(value: string): value is ArrowPreset {
  return value === 'straight' || value === 'curve' || value === 'elbow'
}

/**
 * One Line shape choice, written to every connector kind in the selection.
 *
 * WHY: "a preset IS a routing, and every surface that sets one sets both"
 * (toolbarModel.ts). The menu's ONE Line shape control therefore writes the
 * whole preset — selected arrows through the stock kind/bend translation,
 * selected cables through their routing style, selected lines through their
 * spline — in one history step, instead of exposing per-StyleProp controls
 * that silently skip half of a mixed selection. `Elbowed` deliberately leaves
 * a stock line untouched: a line has no elbow state, and writing a wrong value
 * would be worse than the control honestly reading mixed afterwards.
 */
export function applyLineShape(
  editor: Editor,
  preset: ArrowPreset,
  { markHistory = true }: { markHistory?: boolean } = {},
) {
  if (markHistory) editor.markHistoryStoppingPoint('appearance')
  editor.run(() => {
    applyArrowPresetToSelection(editor, preset)
    editor.setStyleForSelectedShapes(
      ConnectionRoutingStyle,
      connectionRoutingForArrowPreset(preset),
    )
    if (preset !== 'elbow') {
      const spline = preset === 'curve' ? 'cubic' : 'line'
      editor.setStyleForSelectedShapes(LineShapeSplineStyle, spline)
      editor.setStyleForNextShapes(LineShapeSplineStyle, spline)
    }
  })
}
