import {
  ArrowShapeKindStyle,
  type Editor,
  type TLArrowShape,
  type TLShape,
  type TLShapeId,
  type TLUiActionsContextType,
  type TLUiEventSource,
  type TLUiOverrideHelpers,
  type TLUiOverrides,
  type TLUiToolItem,
  type TLUiToolsContextType,
} from 'tldraw'
import { isDrawingArrowWithArrowTool } from '../arrowClickToPlace'
import { withBlockTool } from '../blocks/blockToolUi'
import { withBranchTool } from '../branch/branchToolUi'
import { withLoopTool } from '../loop/loopToolUi'
import { withBehaviorTreeTool } from '../behaviorTree/behaviorTreeToolUi'
import { BEHAVIOR_TREE_SHAPE_TYPE } from '../behaviorTree/behaviorTreeModel'
import {
  getSelectedBehaviorTreeSiblings,
  groupSelectedBehaviorTreeNodes,
} from '../behaviorTree/behaviorTreeCommands'
import { withCalloutTool } from '../callout'
import { withAsyncRegionTool } from '../asyncRegion'
import { withCodeTool } from '../code'
import { withFloatingPortTool } from '../floatingPort/floatingPortToolUi'
import { withCommunicationDrawActions } from '../prototypes/communication/communicationDrawShortcuts'
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
  type SystemFamilyTool,
} from './toolbarModel'

export const CURVE_ARROW_BEND = 32

/** Read the three visible routing choices from stock arrow props. */
export function arrowPresetForShape(shape: TLArrowShape): ArrowPreset {
  if (shape.props.kind === 'elbow') return 'elbow'
  return Math.abs(shape.props.bend) < 0.001 ? 'straight' : 'curve'
}

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
 * Apply a FigJam routing choice to selected stock arrows and to the shared
 * next-connector preset.
 *
 * tldraw stores both Straight and Curved as `kind: arc`; `bend: 0` is the
 * straight state. Keeping that translation here lets the appearance menu
 * expose all three choices without adding a custom shape prop or replacing
 * any stock arrow interaction.
 */
export function applyArrowPresetToSelection(editor: Editor, preset: ArrowPreset): void {
  const arrows = editor.getSelectedShapes()
    .filter((shape): shape is TLArrowShape => shape.type === 'arrow')
  if (arrows.length > 0) {
    editor.updateShapes(arrows.map((shape) => {
      const bend = preset === 'straight'
        ? 0
        : preset === 'curve' && Math.abs(shape.props.bend) < 0.001
          ? CURVE_ARROW_BEND
          : shape.props.bend
      return {
        id: shape.id,
        type: 'arrow' as const,
        props: {
          kind: preset === 'elbow' ? 'elbow' as const : 'arc' as const,
          bend,
        },
      }
    }))
  }
  updateToolbarPreferences({
    lastArrowPreset: preset,
    lastShapeTool: shapeToolForArrowPreset(preset),
  })
  applyArrowPreset(editor, preset)
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

/**
 * The system-design tools share one toolbar slot, so the slot has to remember
 * which of them was picked last — exactly as the shape slot remembers its geo.
 */
function rememberSystemTools(tools: TLUiToolsContextType): TLUiToolsContextType {
  const next: TLUiToolsContextType = { ...tools }
  for (const id of ['block', 'branch', 'loop', 'async-region', 'behaviorTree', 'code', 'pill', 'type', 'floating-port', 'callout'] as const satisfies readonly SystemFamilyTool[]) {
    const wrapped = wrapTool(tools[id], () => updateToolbarPreferences({ lastSystemTool: id }))
    if (wrapped) next[id] = wrapped
  }
  return next
}

/**
 * WHY: stock tldraw's SVG/PNG export (`getSvgJsx.tsx`) special-cases exporting
 * a single frame-like shape by itself: it skips that shape's own `toSvg` and
 * exports only its children, on the assumption a frame's own paint is
 * decorative chrome (a border, a name label) nobody wants baked into an
 * export of its contents. A Behavior Tree region's own paint is not chrome —
 * it is the wires, the Start marker and the header title, i.e. most of the
 * diagram — so that skip silently drops the actual content whenever someone
 * selects just the region and exports it (the natural way to do it). There is
 * no ShapeUtil-level override for this (only `isFrameLike`, which also drives
 * real interaction behavior this region relies on — see `RegionShapeUtil`'s
 * own click-through docs — so flipping it would trade one bug for another).
 * The only lever tldraw exposes is the `ids` array handed to the export
 * action before it ever reaches `toSvg`, so the fix widens that array here,
 * at the same seam this file already uses to teach frame-like Branches and
 * Loops their non-stock toolbar behavior.
 */
function widenSingleRegionExportIds(editor: Editor, ids: TLShapeId[]): TLShapeId[] {
  if (ids.length !== 1) return ids
  const shape = editor.getShape(ids[0])
  if (!shape || shape.type !== BEHAVIOR_TREE_SHAPE_TYPE) return ids
  return [...editor.getShapeAndDescendantIds(ids)]
}

/**
 * Export-as-SVG/PNG reimplemented rather than wrapped: the ids they resolve
 * from selection have to be widened *before* `helpers.exportAs` runs, and the
 * stock action closes over its own `ids` local with no seam to inject into.
 * Faithful to `context/actions.tsx` except for the (unwired, no-op in this
 * app - no `onUiEvent` is passed to `<Tldraw>`) analytics call.
 */
function overrideRegionExportActions(
  editor: Editor,
  actions: TLUiActionsContextType,
  helpers: TLUiOverrideHelpers,
): TLUiActionsContextType {
  const resolveIds = () => {
    let ids = editor.getSelectedShapeIds()
    if (ids.length === 0) ids = Array.from(editor.getCurrentPageShapeIds().values())
    return widenSingleRegionExportIds(editor, ids)
  }
  const exportName = () =>
    editor.getSelectedShapes().length === 0
      ? (editor.getDocumentSettings().name || helpers.msg('document.default-name'))
      : undefined

  const next = { ...actions }
  if (next['export-as-svg']) {
    next['export-as-svg'] = {
      ...next['export-as-svg'],
      onSelect() {
        const ids = resolveIds()
        if (ids.length === 0) return
        helpers.exportAs(ids, { format: 'svg', name: exportName() })
      },
    }
  }
  if (next['export-as-png']) {
    next['export-as-png'] = {
      ...next['export-as-png'],
      onSelect() {
        const ids = resolveIds()
        if (ids.length === 0) return
        helpers.exportAs(ids, { format: 'png', name: exportName() })
      },
    }
  }
  return next
}

/**
 * Ctrl+G on sibling Behavior Tree occurrences groups them under one new
 * Sequence — MoveIt Pro 10.0's "Group Under Sequence", on the very keystroke
 * (and menu item) tldraw already spends on grouping.
 *
 * WHY shadow the stock action instead of adding a second shortcut: a tldraw
 * group of projected children was never a real outcome anyway — the region's
 * reconcile owns those shapes and would fight the group shape — so on this
 * selection the stock behavior is a trap, and any selection the BT command
 * refuses falls through to stock grouping unchanged.
 */
function overrideGroupActionForBehaviorTrees(
  editor: Editor,
  actions: TLUiActionsContextType,
): TLUiActionsContextType {
  const stockGroup = actions['group']
  if (!stockGroup) return actions
  return {
    ...actions,
    group: {
      ...stockGroup,
      onSelect(source) {
        if (getSelectedBehaviorTreeSiblings(editor)) {
          const result = groupSelectedBehaviorTreeNodes(editor)
          if (result.ok) return
        }
        stockGroup.onSelect(source)
      },
    },
  }
}

export const SYSTEMSKETCH_TOOLBAR_OVERRIDES: TLUiOverrides = {
  tools: (editor, tools) =>
    rememberSystemTools(withAsyncRegionTool(editor, withCalloutTool(editor, withCodeTool(editor,
      withFloatingPortTool(editor, withBehaviorTreeTool(editor, withLoopTool(editor,
        withBranchTool(editor, withBlockTool(editor, overrideTools(editor, tools)))))))))),
  actions: (editor, actions, helpers) =>
    withCommunicationDrawActions(
      editor,
      overrideGroupActionForBehaviorTrees(editor, overrideRegionExportActions(editor, actions, helpers)),
    ),
  translations: {
    en: {
      // Stock frame removal reparents children out before deleting the
      // container (`utils/frames/frames.ts`). This action also appears on our
      // frame-like Branches and Loops, so naming the implementation detail
      // "frame" there is misleading. One shared command, said for the object
      // class people actually see.
      'action.remove-frame': 'Delete container, leave children',
    },
  },
}

export function selectSystemFamilyTool(
  tools: TLUiToolsContextType,
  tool: SystemFamilyTool,
  source: TLUiEventSource = 'toolbar',
): void {
  tools[tool]?.onSelect(source)
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
