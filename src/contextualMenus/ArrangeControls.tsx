import type { ComponentType, ReactElement } from 'react'

export interface ArrangeAction {
  /** Stable id — also the editor call the wave-2 binder dispatches on `onAction`. */
  id: string
  label: string
  /** An Excalidraw-vendored glyph component, supplied by the binder as a prop — never imported here. */
  icon: ComponentType<{ className?: string }>
}

export interface ArrangeControlsProps {
  /** Z-order actions, valid for any selection: sendToBack/sendBackward/bringForward/bringToFront. */
  zOrder: readonly ArrangeAction[]
  /**
   * The 6 align ops plus 2 distribute ops. Omitted (undefined) hides the
   * whole group AND its divider — this component holds no selection-count
   * logic of its own; the wave-2 binder decides align needs >=2 shapes and
   * distribute needs >=3, and simply doesn't pass the group when it doesn't
   * qualify.
   */
  align?: readonly ArrangeAction[]
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
export function ArrangeControls({ zOrder, align, onAction, disabled }: ArrangeControlsProps): ReactElement {
  return (
    <div className="systemsketch-arrange" data-testid="systemsketch-arrange">
      <ArrangeGroup groupId="z-order" actions={zOrder} onAction={onAction} disabled={disabled} />
      {align && align.length > 0 ? (
        <>
          <div
            className="systemsketch-arrange__divider"
            role="separator"
            aria-orientation="vertical"
            data-testid="systemsketch-arrange-divider"
          />
          <ArrangeGroup groupId="align" actions={align} onAction={onAction} disabled={disabled} />
        </>
      ) : null}
    </div>
  )
}
