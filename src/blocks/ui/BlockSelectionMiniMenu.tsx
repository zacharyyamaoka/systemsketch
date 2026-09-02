import { type Editor, type SharedStyle, useValue } from 'tldraw'

import { BLOCK_VIEWS, type BlockView } from '../blockModel'
import { getOnlySelectedBlock, setBlockView } from '../commands/blockCommands'
import {
  getBlockSelectionStyles,
  getSelectedShapesFlat,
  setBlockViewForSelection,
} from '../commands/blockStyleCommands'
import { stepIntoDepthScope } from '../../depth/depthNavigation'
import './block-inspector.css'

export interface BlockSelectionMiniMenuProps {
  /**
   * The selection's view as tldraw reports it. `mixed` leaves every choice
   * unpressed, exactly as the stock style panel does for a mixed colour.
   */
  view: SharedStyle<BlockView>
  onSetView(view: BlockView): void
  onOpenInspector(): void
  onStepInto?: () => void
  /** Present only for a batch selection, e.g. `9 Blocks` — or `5 selected` when other shapes are in it. */
  selectionLabel?: string
  /**
   * Present when the selection is not only Blocks: names how many of it the
   * S / P / E group actually governs, e.g. `2 Blocks`, so the group reads as
   * the Blocks' setting rather than as the selection's.
   */
  scopeLabel?: string
}

/** Content only; the shared shell supplies TldrawUiContextualToolbar positioning. */
export function BlockSelectionMiniMenu({
  view,
  onSetView,
  onOpenInspector,
  onStepInto,
  selectionLabel,
  scopeLabel,
}: BlockSelectionMiniMenuProps) {
  return (
    <div
      className="block-mini-menu"
      role="toolbar"
      aria-label={selectionLabel ? 'Selected Block actions (batch)' : 'Selected Block actions'}
      data-view={view.type === 'mixed' ? 'mixed' : view.value}
    >
      {selectionLabel ? (
        <span className="block-mini-menu__count">{selectionLabel}</span>
      ) : null}
      <div className="block-mini-menu__views" role="group" aria-label="Block view">
        {scopeLabel ? (
          <span className="block-mini-menu__scope">{scopeLabel}</span>
        ) : null}
        {BLOCK_VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={view.type === 'shared' && view.value === candidate}
            onClick={() => onSetView(candidate)}
          >
            {candidate === 'simple' ? 'S' : candidate === 'port' ? 'P' : 'E'}
            <span>{candidate}</span>
          </button>
        ))}
      </div>
      {onStepInto ? (
        <button type="button" className="block-mini-menu__step-in" onClick={onStepInto}>
          Step in
        </button>
      ) : null}
      <button type="button" className="block-mini-menu__inspect" onClick={onOpenInspector}>
        Inspect
      </button>
    </div>
  )
}

/**
 * One reactive adapter for both shapes of Block selection.
 *
 * A single Block keeps the per-shape command and Step in. Several Blocks —
 * including Blocks reached through a group, or selected alongside plain tldraw
 * shapes — drive the same buttons through `setStyleForSelectedShapes`, so the
 * batch gesture is the stock one rather than a loop written here.
 */
export function EditorBlockSelectionMiniMenu({
  editor,
  onOpenInspector,
}: {
  editor: Editor
  onOpenInspector(): void
}) {
  const block = useValue(
    'SystemSketch selected Block mini menu',
    () => getOnlySelectedBlock(editor),
    [editor],
  )
  const styles = useValue(
    'SystemSketch Block selection styles',
    () => getBlockSelectionStyles(editor),
    [editor],
  )
  const selectionCount = useValue(
    'SystemSketch Block selection size',
    () => getSelectedShapesFlat(editor).length,
    [editor],
  )

  if (block) {
    return (
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: block.props.view }}
        onSetView={(view) => void setBlockView(editor, block.id, view)}
        onStepInto={block.props.view === 'expanded'
          ? () => void stepIntoDepthScope(editor, block.id)
          : undefined}
        onOpenInspector={onOpenInspector}
      />
    )
  }

  if (!styles.view) return null

  // Two Blocks and three shapes is "5 selected", with the S / P / E group
  // marked as the two Blocks' — not "2 Blocks", which read as though the
  // Blocks had overridden the selection.
  const blocks = `${styles.blockCount} ${styles.blockCount === 1 ? 'Block' : 'Blocks'}`
  const mixed = selectionCount > styles.blockCount
  return (
    <BlockSelectionMiniMenu
      view={styles.view}
      selectionLabel={mixed ? `${selectionCount} selected` : blocks}
      scopeLabel={mixed ? blocks : undefined}
      onSetView={(view) => void setBlockViewForSelection(editor, view)}
      onOpenInspector={onOpenInspector}
    />
  )
}
