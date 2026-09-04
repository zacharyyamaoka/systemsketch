import { type Editor, type SharedStyle, useValue } from 'tldraw'

import {
  BLOCK_PRESENTATION_VIEWS,
  type BlockPresentationView,
  type BlockView,
} from '../blockModel'
import { getOnlySelectedBlock, setBlockView } from '../commands/blockCommands'
import {
  getBlockSelectionStyles,
  getSelectedBlocks,
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
  onSetView(view: BlockPresentationView): void
  depthAction?: {
    direction: 'in' | 'out'
    onSelect(): void
  }
}

/** Whether the Block adapter will contribute controls to the selection pill. */
export function canShowBlockSelectionMiniMenu(editor: Editor): boolean {
  const block = getOnlySelectedBlock(editor)
  if (block) return block.props.view !== 'value'
  const styles = getBlockSelectionStyles(editor)
  return !getSelectedBlocks(editor).some((candidate) => candidate.props.view === 'value')
    && Boolean(styles.view)
}

/**
 * What each view letter means, in words.
 *
 * The pill shows one capital per view because three full names would be wider
 * than the pill; measured, that left `S` `P` `E` with no `title` at all, so
 * hovering the control taught nothing and only a screen reader ever heard the
 * `aria-label`. The hint is the same sentence the inspector's VIEW row uses,
 * so the two surfaces agree about what the choice does.
 */
const VIEW_HINTS: Record<BlockPresentationView, string> = {
  simple: 'Simple view — the title alone',
  port: 'Port view — the title with its port rows',
  expanded: 'Expanded view — a frame you can step into',
}

/** Content only; the shared shell supplies TldrawUiContextualToolbar positioning. */
export function BlockSelectionMiniMenu({
  view,
  onSetView,
  depthAction,
}: BlockSelectionMiniMenuProps) {
  // Keep this presentation component safe when it is mounted independently of
  // the editor adapter: a Value capsule never receives ordinary Block controls.
  if (view.type === 'shared' && view.value === 'value') return null

  return (
    <div
      className="block-mini-menu"
      role="toolbar"
      aria-label="Selected Block actions"
      data-view={view.type === 'mixed' ? 'mixed' : view.value}
    >
      <div className="block-mini-menu__views" role="group" aria-label="Block view">
        {BLOCK_PRESENTATION_VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-label={`Show ${candidate} view`}
            title={VIEW_HINTS[candidate]}
            aria-pressed={view.type === 'shared' && view.value === candidate}
            data-testid={`block-pill-view-${candidate}`}
            onClick={() => onSetView(candidate)}
          >
            {candidate.slice(0, 1).toUpperCase()}
            <span>{candidate}</span>
          </button>
        ))}
      </div>
      {depthAction ? (
        <button
          type="button"
          className="block-mini-menu__step-in"
          data-depth-action={depthAction.direction}
          title={depthAction.direction === 'out'
            ? 'Step out to the parent scope'
            : "Step into this Block's own canvas"}
          onClick={depthAction.onSelect}
        >
          {depthAction.direction === 'out' ? 'Step out' : 'Step in'}
        </button>
      ) : null}
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
export function EditorBlockSelectionMiniMenu({ editor }: { editor: Editor }) {
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
  const hasValueRepresentation = useValue(
    'SystemSketch Value representation in selection',
    () => getSelectedBlocks(editor).some((candidate) => candidate.props.view === 'value'),
    [editor],
  )
  const activeDepthScopeId = useValue(
    'SystemSketch selected Block depth action',
    () => getActiveDepthScopeId(editor),
    [editor],
  )
  if (block) {
    if (block.props.view === 'value') return null
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
      />
    )
  }

  if (hasValueRepresentation || !styles.view) return null

  return (
    <BlockSelectionMiniMenu
      view={styles.view}
      onSetView={(view) => void setBlockViewForSelection(editor, view)}
    />
  )
}
