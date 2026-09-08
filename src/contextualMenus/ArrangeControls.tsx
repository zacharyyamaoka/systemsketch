import { Fragment, type ComponentType, type ReactElement } from 'react'

export interface ArrangeAction {
  /** Stable id — also the editor call the wave-2 binder dispatches on `onAction`. */
  id: string
  label: string
  /** An Excalidraw-vendored glyph component, supplied by the binder as a prop — never imported here. */
  icon: ComponentType<{ className?: string }>
}

export interface ArrangeActionGroup {
  /** Stable id, surfaced as `data-testid="systemsketch-arrange-group-${id}"`. */
  id: string
  actions: readonly ArrangeAction[]
}

export interface ArrangeControlsProps {
  /**
   * Rendered in order, each set off from its neighbour by one divider — the
   * same segmenting idea as the pill's own appearance/text/arrange split
   * (Zach, 2026-09-08: "apply the same idea of segmenting to the arrange
   * and alignment icons", after picking V3 Figma Segmented over V1's one
   * dense row). A group with zero actions is simply not rendered, and
   * costs no divider either — this component holds no selection-count
   * logic of its own; the wave-2 binder decides which groups qualify for
   * the current selection and passes only those.
   */
  groups: readonly ArrangeActionGroup[]
  onAction(id: string): void
  /** Action ids to render disabled, e.g. sendToBack when already at the back. */
  disabled?: ReadonlySet<string>
}

function ArrangeGroup({
  groupId,
  actions,
  onAction,
  disabled,
}: {
  groupId: string
  actions: readonly ArrangeAction[]
  onAction(id: string): void
  disabled?: ReadonlySet<string>
}) {
  return (
    <div className="systemsketch-arrange__group" data-testid={`systemsketch-arrange-group-${groupId}`}>
      {actions.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="systemsketch-arrange__button"
          data-testid={`systemsketch-arrange-${id}`}
          title={label}
          aria-label={label}
          disabled={disabled?.has(id) ?? false}
          onClick={() => onAction(id)}
        >
          <Icon className="systemsketch-arrange__icon" />
        </button>
      ))}
    </div>
  )
}

/**
 * Pure z-order + align/distribute button cluster for the selection pill.
 *
 * Plain `<button type="button">` elements, not `TldrawUiToolbarButton` — the
 * wave-2 binder mounts this inside the pill's own `TldrawUiToolbar` (see
 * `SelectionContextualMenu.tsx`), which already supplies toolbar semantics
 * (grouping, roving tabindex) to whatever children it wraps. Duplicating that
 * here would fight the surrounding toolbar rather than compose with it.
 *
 * No `editor` import, no selection-count logic: every action this renders
 * comes in as data, and every click just reports the id back up.
 */
export function ArrangeControls({ groups, onAction, disabled }: ArrangeControlsProps): ReactElement {
  const visible = groups.filter((group) => group.actions.length > 0)
  return (
    <div className="systemsketch-arrange" data-testid="systemsketch-arrange">
      {visible.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? (
            <div
              className="systemsketch-arrange__divider"
              role="separator"
              aria-orientation="vertical"
              data-testid="systemsketch-arrange-divider"
            />
          ) : null}
          <ArrangeGroup groupId={group.id} actions={group.actions} onAction={onAction} disabled={disabled} />
        </Fragment>
      ))}
    </div>
  )
}
