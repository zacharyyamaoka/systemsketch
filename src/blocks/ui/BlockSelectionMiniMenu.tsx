import { type Editor, type SharedStyle, useValue } from 'tldraw'

import { BLOCK_VIEWS, type BlockView } from '../blockModel'
import { getOnlySelectedBlock, setBlockView } from '../commands/blockCommands'
import {
  getBlockSelectionStyles,
  setBlockViewForSelection,
} from '../commands/blockStyleCommands'
import { getActiveDepthScopeId, toggleDepthScope } from '../../depth/depthNavigation'
import './block-inspector.css'

export interface BlockSelectionMiniMenuProps {
  /**
   * The selection's view as tldraw reports it. `mixed` leaves every choice
   * unpressed, exactly as the stock style panel does for a mixed colour.
   */
  view: SharedStyle<BlockView>
  onSetView(view: BlockView): void
  onOpenInspector(): void
  depthAction?: {
    direction: 'in' | 'out'
    onSelect(): void
  }
}

/** Content only; the shared shell supplies TldrawUiContextualToolbar positioning. */
export function BlockSelectionMiniMenu({
  view,
  onSetView,
  onOpenInspector,
  depthAction,
}: BlockSelectionMiniMenuProps) {
  return (
    <div
      className="block-mini-menu"
      role="toolbar"
      aria-label="Selected Block actions"
      data-view={view.type === 'mixed' ? 'mixed' : view.value}
    >
      <div className="block-mini-menu__views" role="group" aria-label="Block view">
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
      {depthAction ? (
        <button
          type="button"
          className="block-mini-menu__step-in"
          data-depth-action={depthAction.direction}
          onClick={depthAction.onSelect}
        >
          {depthAction.direction === 'out' ? 'Step out' : 'Step in'}
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
 * A single Block keeps the per-shape command and depth action. Several Blocks —
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
  const activeDepthScopeId = useValue(
    'SystemSketch selected Block depth action',
    () => getActiveDepthScopeId(editor),
    [editor],
  )
  if (block) {
    return (
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: block.props.view }}
        onSetView={(view) => void setBlockView(editor, block.id, view)}
        depthAction={block.props.view === 'expanded'
          ? {
              direction: activeDepthScopeId === block.id ? 'out' : 'in',
              onSelect: () => void toggleDepthScope(editor, block.id),
            }
          : undefined}
        onOpenInspector={onOpenInspector}
      />
    )
  }

  if (!styles.view) return null

  return (
    <BlockSelectionMiniMenu
      view={styles.view}
      onSetView={(view) => void setBlockViewForSelection(editor, view)}
      onOpenInspector={onOpenInspector}
    />
  )
}
