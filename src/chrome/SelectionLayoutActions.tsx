import type { Editor } from 'tldraw'

import { getTidyEdgesSelection } from '../blocks/connections/tidyEdges'
import { canOrganizeNodes } from '../blocks/layout'

export interface SelectionLayoutActionAvailability {
  tidyEdges: boolean
  organizeNodes: boolean
}

/**
 * The contextual toolbar and command palette share one applicability policy.
 * Keep this deliberately as a read model: the commands themselves remain the
 * only place that owns layout behavior and selection scope.
 */
export function getSelectionLayoutActionAvailability(
  editor: Editor,
): SelectionLayoutActionAvailability {
  return {
    tidyEdges: getTidyEdgesSelection(editor).length > 0,
    organizeNodes: canOrganizeNodes(editor),
  }
}

function TidyEdgesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 4.5h4.5v3H13v-3h4" />
      <path d="M3 10h7.5v3H14v-3h3" />
      <path d="M3 15.5h3v-3h3" />
    </svg>
  )
}

function OrganizeNodesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      {[6, 10, 14].flatMap((y) => (
        [6, 10, 14].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".85" />)
      ))}
    </svg>
  )
}

export interface SelectionLayoutActionsProps extends SelectionLayoutActionAvailability {
  onTidyEdges(): void
  onOrganizeNodes(): void
}

/** Compact, FigJam-like one-shot layout controls for the current selection. */
export function SelectionLayoutActions({
  tidyEdges,
  organizeNodes,
  onTidyEdges,
  onOrganizeNodes,
}: SelectionLayoutActionsProps) {
  if (!tidyEdges && !organizeNodes) return null

  return (
    <div className="systemsketch-selection-layout-actions" role="group" aria-label="Layout actions">
      {tidyEdges ? (
        <button
          type="button"
          className="systemsketch-selection-layout-action"
          title="Tidy edges"
          aria-label="Tidy edges"
          data-testid="selection-action-tidy-edges"
          onClick={onTidyEdges}
        >
          <TidyEdgesIcon />
        </button>
      ) : null}
      {organizeNodes ? (
        <button
          type="button"
          className="systemsketch-selection-layout-action"
          title="Organize nodes"
          aria-label="Organize nodes"
          data-testid="selection-action-organize-nodes"
          onClick={onOrganizeNodes}
        >
          <OrganizeNodesIcon />
        </button>
      ) : null}
    </div>
  )
}
