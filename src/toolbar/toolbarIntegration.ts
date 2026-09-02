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
import {
  arrowPresetForActivation,
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

export function applyArrowPreset(editor: Editor, preset: ArrowPreset): void {
  editor.setStyleForNextShapes(ArrowShapeKindStyle, preset === 'elbow' ? 'elbow' : 'arc')
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
