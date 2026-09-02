import {
  ArrowShapeKindStyle,
  type Editor,
  type TLArrowShape,
  type TLShape,
  type TLUiEventSource,
  type TLUiOverrides,
  type TLUiToolItem,
  type TLUiToolsContextType,
} from 'tldraw'
import { isDrawingArrowWithArrowTool } from '../arrowClickToPlace'
import { withBlockTool } from '../blocks/blockToolUi'
import { CONNECTION_SHAPE_TYPE, ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import {
  arrowPresetForActivation,
  connectionRoutingForArrowPreset,
  getToolbarPreferences,
  shapeToolForArrowPreset,
  updateToolbarPreferences,
  type ArrowPreset,
  type DrawFamilyTool,
  type ShapeFamilyTool,
} from './toolbarModel'

export const CURVE_ARROW_BEND = 32

const ARROW_TOOL_IDS: Record<ArrowPreset, string> = {
  straight: 'systemsketch-arrow-straight',
  curve: 'systemsketch-arrow-curve',
  elbow: 'systemsketch-arrow-elbow',
}

const ARROW_ICONS: Record<ArrowPreset, string> = {
  straight: 'tool-arrow',
  curve: 'arrow-arc',
  elbow: 'arrow-elbow',
}

export function isArrowShapeTool(tool: ShapeFamilyTool): tool is `arrow-${ArrowPreset}` {
  return tool.startsWith('arrow-')
}

export function arrowPresetFromShapeTool(tool: `arrow-${ArrowPreset}`): ArrowPreset {
  return tool.slice('arrow-'.length) as ArrowPreset
}

/**
 * Does this composition have cables at all?
 *
 * `stylesForNextShape` is validated against the store's own schema, and a style
 * prop only enters that schema through the shape util that declares it. The
 * stock-tldraw lab mounts tldraw *without* the Connection shape, so writing the
 * cable routing there is not an ignored style — it is an unknown property in
 * instance state, and tldraw fails the whole document with a validation error
 * and its crash screen. So the second half of the preset is asked for, never
 * assumed. The arrow half is stock tldraw and always applies.
 */
function hasConnectionShape(editor: Editor): boolean {
  return editor.shapeUtils[CONNECTION_SHAPE_TYPE] !== undefined
}

/**
 * One choice, two shapes.
 *
 * An arrow and a data edge are the same idea drawn on different subjects, so
 * the preset writes both next-shape styles at once: pressing A until the arrow
 * is elbowed leaves the next cable elbowed too, and switching to Curve curves
 * both. Two `StyleProp`s, one gesture — tldraw's own next-shape channel does
 * the rest, including for a cable created from a port press.
 */
export function applyArrowPreset(editor: Editor, preset: ArrowPreset): void {
  editor.setStyleForNextShapes(ArrowShapeKindStyle, preset === 'elbow' ? 'elbow' : 'arc')
  if (hasConnectionShape(editor)) {
    editor.setStyleForNextShapes(ConnectionRoutingStyle, connectionRoutingForArrowPreset(preset))
  }
}

/**
 * Seed both styles from the remembered preset, on mount.
 *
 * Without this the app would only agree with the toolbar once you pressed A:
 * `stylesForNextShape` rides tldraw's persisted instance state, so a board
 * saved while Curve was active would reopen curved however the toolbar reads.
 * Preferences are the source of truth for "what does the app draw next", so
 * they are re-applied every time an editor mounts.
 */
export function applyStoredArrowPreset(editor: Editor): void {
  applyArrowPreset(editor, getToolbarPreferences().lastArrowPreset)
}

export function prepareCreatedShapeForToolbarPreset(
  shape: TLShape,
  preset: ArrowPreset,
  isArrowDrawing: boolean,
): TLShape {
  if (shape.type !== 'arrow' || preset !== 'curve' || !isArrowDrawing) return shape
  const arrow = shape as TLArrowShape
  return {
    ...arrow,
    props: {
      ...arrow.props,
      kind: 'arc',
      bend: CURVE_ARROW_BEND,
    },
  }
}

/**
 * The one non-stock drawing behavior in P1. The guard asks whether the arrow
 * TOOL is drawing this arrow — true for a press-drag and for a click-placed
 * arrow alike — so pasted, imported, duplicated, and programmatically created
 * arrows are left alone whichever gesture the person happens to be using.
 */
export function registerToolbarSideEffects(editor: Editor): () => void {
  applyStoredArrowPreset(editor)
  return editor.sideEffects.registerBeforeCreateHandler('shape', (shape) =>
    prepareCreatedShapeForToolbarPreset(
      shape as TLShape,
      getToolbarPreferences().lastArrowPreset,
      isDrawingArrowWithArrowTool(editor),
    ),
  )
}

function wrapTool(
  tool: TLUiToolItem | undefined,
  beforeSelect: () => void,
): TLUiToolItem | undefined {
  if (!tool) return undefined
  return {
    ...tool,
    onSelect(source) {
      beforeSelect()
      tool.onSelect(source)
    },
  }
}

function createArrowPresetTool(
  editor: Editor,
  stockArrow: TLUiToolItem,
  preset: ArrowPreset,
): TLUiToolItem {
  return {
    ...stockArrow,
    id: ARROW_TOOL_IDS[preset],
    icon: ARROW_ICONS[preset],
    kbd: undefined,
    onSelect(source) {
      updateToolbarPreferences({
        lastArrowPreset: preset,
        lastShapeTool: shapeToolForArrowPreset(preset),
      })
      applyArrowPreset(editor, preset)
      stockArrow.onSelect(source)
    },
  }
}

function overrideTools(
  editor: Editor,
  tools: TLUiToolsContextType,
): TLUiToolsContextType {
  const stockArrow = tools.arrow
  if (!stockArrow) return tools

  const next: TLUiToolsContextType = { ...tools }
  const rememberedShapeTools: Array<Exclude<ShapeFamilyTool, `arrow-${ArrowPreset}`>> = [
    'rectangle',
    'ellipse',
    'triangle',
    'diamond',
    'line',
  ]
  for (const id of rememberedShapeTools) {
    const wrapped = wrapTool(tools[id], () => updateToolbarPreferences({ lastShapeTool: id }))
    if (wrapped) next[id] = wrapped
  }

  const rememberedDrawTools: DrawFamilyTool[] = ['draw', 'highlight']
  for (const id of rememberedDrawTools) {
    const wrapped = wrapTool(tools[id], () => updateToolbarPreferences({ lastDrawTool: id }))
    if (wrapped) next[id] = wrapped
  }

  next.arrow = {
    ...stockArrow,
    onSelect(source) {
      const preferences = getToolbarPreferences()
      const preset = arrowPresetForActivation(editor.getCurrentToolId(), preferences.lastArrowPreset)
      updateToolbarPreferences({
        lastArrowPreset: preset,
        lastShapeTool: shapeToolForArrowPreset(preset),
      })
      applyArrowPreset(editor, preset)
      stockArrow.onSelect(source)
    },
  }

  for (const preset of ['straight', 'curve', 'elbow'] as const) {
    next[ARROW_TOOL_IDS[preset]] = createArrowPresetTool(editor, stockArrow, preset)
  }

  return next
}

export const SYSTEMSKETCH_TOOLBAR_OVERRIDES: TLUiOverrides = {
  tools: (editor, tools) => withBlockTool(editor, overrideTools(editor, tools)),
}

export function selectShapeFamilyTool(
  tools: TLUiToolsContextType,
  tool: ShapeFamilyTool,
  source: TLUiEventSource = 'toolbar',
): void {
  const id = isArrowShapeTool(tool)
    ? ARROW_TOOL_IDS[arrowPresetFromShapeTool(tool)]
    : tool
  tools[id]?.onSelect(source)
}

export function selectDrawFamilyTool(
  tools: TLUiToolsContextType,
  tool: DrawFamilyTool,
  source: TLUiEventSource = 'toolbar',
): void {
  tools[tool]?.onSelect(source)
}
