/**
 * Batch editing for the Block primitive, on tldraw's documented style path.
 *
 * The whole feature is one idea: a Block prop that should apply to a whole
 * selection is declared as a `StyleProp` (see `blockModel.ts`), and the editor
 * already knows the rest. `getSharedStyles()` folds the selection into
 * shared-or-mixed, and `setStyleForSelectedShapes()` writes every shape whose
 * util declares that style — Blocks nested inside groups included, non-Block
 * shapes in the same selection left alone.
 *
 * So the write path here walks no selection of its own. This module only names
 * the commands and adds the two things tldraw leaves to the app: one history
 * stopping point per gesture, and the counts the UI reports.
 */
import type { Editor, SharedStyle, StyleProp, TLShape } from 'tldraw'

import {
  BlockPortLayoutStyle,
  BlockShowDescriptionStyle,
  BlockViewStyle,
  isBlockShape,
  type BlockShape,
  type BlockView,
  type PortLayout,
} from '../blockModel'
import {
  CONNECTION_SHAPE_TYPE,
  ConnectionRoutingStyle,
  ConnectionTemporalStyle,
  type ConnectionRoutingKind,
  type ConnectionTemporalKind,
} from '../connections/connectionModel'

export type BlockStyleResult =
  | { ok: true; style: string; count: number }
  | { ok: false; reason: 'no-target' | 'unchanged' }

/**
 * Every shape in the selection, flattened through groups.
 *
 * This mirrors how the editor itself reads a selection for styles, so the
 * count the UI shows and the shapes the write reaches never disagree.
 */
export function getSelectedShapesFlat(editor: Editor): TLShape[] {
  const flattened: TLShape[] = []
  const visit = (shape: TLShape | undefined) => {
    if (!shape) return
    if (editor.isShapeOfType(shape, 'group')) {
      for (const childId of editor.getSortedChildIdsForParent(shape.id)) {
        visit(editor.getShape(childId))
      }
      return
    }
    flattened.push(shape)
  }
  for (const shape of editor.getSelectedShapes()) visit(shape)
  return flattened
}

export function getSelectedBlocks(editor: Editor): BlockShape[] {
  return getSelectedShapesFlat(editor).filter(isBlockShape)
}

export function getSelectedConnectionCount(editor: Editor): number {
  return getSelectedShapesFlat(editor)
    .filter((shape) => shape.type === CONNECTION_SHAPE_TYPE).length
}

/** `undefined` means no selected shape carries this style — hide the control. */
export function getSharedStyleForSelection<T>(
  editor: Editor,
  style: StyleProp<T>,
): SharedStyle<T> | undefined {
  return editor.getSharedStyles().get(style)
}

/** True when a shared style already equals `value`: the checked state of a control. */
export function isSharedStyleValue<T>(
  shared: SharedStyle<T> | undefined,
  value: T,
): boolean {
  return shared?.type === 'shared' && shared.value === value
}

/** True when the selection disagrees about a style. */
export function isMixedStyle<T>(shared: SharedStyle<T> | undefined): boolean {
  return shared?.type === 'mixed'
}

/**
 * The one batch mutation seam.
 *
 * The history stopping point before the write is the same contract the stock
 * style panel uses, so one batch change is one Ctrl+Z no matter how many
 * shapes it touched.
 */
export function setStyleForSelection<T>(
  editor: Editor,
  style: StyleProp<T>,
  value: T,
  historyLabel: string,
): BlockStyleResult {
  // Count the real targets rather than trusting `getSharedStyles()` alone:
  // with a shape tool active that map also reports the next-shape styles, and
  // an empty selection must never open a history step.
  const count = getSelectedShapesFlat(editor)
    .filter((shape) => editor.getShapeStyleIfExists(shape, style) !== undefined).length
  if (count === 0) return { ok: false, reason: 'no-target' }
  if (isSharedStyleValue(getSharedStyleForSelection(editor, style), value)) {
    return { ok: false, reason: 'unchanged' }
  }

  editor.markHistoryStoppingPoint(historyLabel)
  editor.setStyleForSelectedShapes(style, value)
  return { ok: true, style: style.id, count }
}

export function setBlockViewForSelection(editor: Editor, view: BlockView): BlockStyleResult {
  return setStyleForSelection(editor, BlockViewStyle, view, `show blocks as ${view}`)
}

export function setBlockPortLayoutForSelection(
  editor: Editor,
  portLayout: PortLayout,
): BlockStyleResult {
  return setStyleForSelection(
    editor,
    BlockPortLayoutStyle,
    portLayout,
    `use ${portLayout === 'inline' ? 'aligned' : 'offset'} block ports`,
  )
}

export function setBlockShowDescriptionForSelection(
  editor: Editor,
  showDescription: boolean,
): BlockStyleResult {
  return setStyleForSelection(
    editor,
    BlockShowDescriptionStyle,
    showDescription,
    showDescription ? 'show block descriptions' : 'hide block descriptions',
  )
}

export function setConnectionRoutingForSelection(
  editor: Editor,
  routing: ConnectionRoutingKind,
): BlockStyleResult {
  return setStyleForSelection(
    editor,
    ConnectionRoutingStyle,
    routing,
    `use ${routing} connection routing`,
  )
}

/**
 * What every batch surface renders from: how many Blocks are selected and,
 * for each batchable prop, whether they agree.
 */
export interface BlockSelectionStyles {
  blockCount: number
  view: SharedStyle<BlockView> | undefined
  portLayout: SharedStyle<PortLayout> | undefined
  showDescription: SharedStyle<boolean> | undefined
}

/** Two shared-style readings are the same when a control would look the same. */
/** Mark every selected cable as plain data, async delivery, or one iteration late. */
export function setConnectionTemporalForSelection(
  editor: Editor,
  temporal: ConnectionTemporalKind,
): BlockStyleResult {
  return setStyleForSelection(
    editor,
    ConnectionTemporalStyle,
    temporal,
    temporal === 'delayed'
      ? 'mark cables delayed (z⁻¹)'
      : temporal === 'async'
        ? 'mark cables async'
        : 'mark cables as data',
  )
}

export function sameSharedStyle<T>(
  a: SharedStyle<T> | undefined,
  b: SharedStyle<T> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b || a.type !== b.type) return false
  return a.type !== 'shared' || b.type !== 'shared' || a.value === b.value
}

export function sameBlockSelectionStyles(
  a: BlockSelectionStyles,
  b: BlockSelectionStyles,
): boolean {
  return a.blockCount === b.blockCount
    && sameSharedStyle(a.view, b.view)
    && sameSharedStyle(a.portLayout, b.portLayout)
    && sameSharedStyle(a.showDescription, b.showDescription)
}

export function getBlockSelectionStyles(editor: Editor): BlockSelectionStyles {
  return {
    blockCount: getSelectedBlocks(editor).length,
    view: getSharedStyleForSelection(editor, BlockViewStyle),
    portLayout: getSharedStyleForSelection(editor, BlockPortLayoutStyle),
    showDescription: getSharedStyleForSelection(editor, BlockShowDescriptionStyle),
  }
}

/**
 * True when the selection itself carries at least one Block.
 *
 * Deliberately not `getSharedStyles().get(...) !== undefined`: while a shape
 * tool is active that map describes the *next* shape, not a selection.
 */
export function selectionHasBlockStyles(editor: Editor): boolean {
  return getSelectedBlocks(editor).length > 0
}

export function selectionHasConnectionStyles(editor: Editor): boolean {
  return getSelectedConnectionCount(editor) > 0
}
