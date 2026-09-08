import { Fragment, forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactElement } from 'react'

import { CHEVRON_PATH, CHEVRON_VIEWBOX } from '../appearance/figjamTokens'

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
  /**
   * `row` lays the groups out left-to-right with vertical dividers — the shape
   * this cluster had while it lived inline on the pill. `stack` puts one group
   * per line with horizontal rules between them, which is what a disclosure
   * popover wants: twelve buttons in a single row would be a 423px-wide panel
   * and would simply move the pill's width problem behind the trigger.
   * Defaults to `row` so the component still composes into a toolbar.
   */
  layout?: 'row' | 'stack'
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
 * Since 2026-09-08 the binder mounts this inside the pill's Arrange popover
 * rather than in the pill's own row — see {@link ArrangeTrigger}. Nothing here
 * knows that: it is still one list of grouped buttons, and `layout` is the
 * only concession the disclosure asked for.
 *
 * Plain `<button type="button">` elements, not `TldrawUiToolbarButton` — the
 * binder mounts this inside the pill's own `TldrawUiToolbar` (see
 * `SelectionContextualMenu.tsx`), which already supplies toolbar semantics
 * (grouping, roving tabindex) to whatever children it wraps. Duplicating that
 * here would fight the surrounding toolbar rather than compose with it.
 *
 * No `editor` import, no selection-count logic: every action this renders
 * comes in as data, and every click just reports the id back up.
 */
export function ArrangeControls({
  groups,
  onAction,
  disabled,
  layout = 'row',
}: ArrangeControlsProps): ReactElement {
  const visible = groups.filter((group) => group.actions.length > 0)
  return (
    <div className="systemsketch-arrange" data-layout={layout} data-testid="systemsketch-arrange">
      {visible.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? (
            <div
              className="systemsketch-arrange__divider"
              role="separator"
              // A stacked panel's groups sit one above the next, so the rule
              // between them runs the other way. Announcing the vertical
              // orientation regardless would describe a line that is not there.
              aria-orientation={layout === 'stack' ? 'horizontal' : 'vertical'}
              data-testid="systemsketch-arrange-divider"
            />
          ) : null}
          <ArrangeGroup groupId={group.id} actions={group.actions} onAction={onAction} disabled={disabled} />
        </Fragment>
      ))}
    </div>
  )
}

export interface ArrangeTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The trigger's face — an Excalidraw-vendored glyph, supplied by the binder. */
  icon: ComponentType<{ className?: string }>
  /** Accessible name and tooltip, e.g. "Arrange". */
  label: string
}

/**
 * The one button that stands in for the whole Arrange cluster on the pill.
 *
 * WHY this exists at all: every other control in the selection pill — Color,
 * Fill, Line style, Font size — is a small trigger that opens a popover, and
 * Arrange was the single exception, spilling all twelve of its buttons into
 * the pill's own row (Zach, 2026-09-08: "instead of being visible on the
 * floating toolbar I want them hidden behind a icon"). The face stays a
 * vendored Excalidraw glyph and the chevron is the pill's own
 * (`figjamTokens`), so the new trigger reads as one of the family rather than
 * as a new kind of control.
 *
 * WHY forwardRef + prop spread: `TldrawUiPopoverTrigger` is Radix's
 * `Popover.Trigger asChild`, which injects its handlers, its ref and the
 * `aria-expanded` / `data-state` it manages into this element. Swallowing
 * either would leave a button that opens nothing. Same contract
 * `ContextualControls.tsx`'s `ControlTrigger` honours.
 */
export const ArrangeTrigger = forwardRef<HTMLButtonElement, ArrangeTriggerProps>(
  function ArrangeTrigger({ icon: Icon, label, className, ...buttonProps }, ref) {
    return (
      <button
        {...buttonProps}
        ref={ref}
        type="button"
        className={['systemsketch-arrange__trigger', className].filter(Boolean).join(' ')}
        data-testid="systemsketch-arrange-trigger"
        title={label}
        aria-label={label}
      >
        <Icon className="systemsketch-arrange__icon" />
        <svg className="systemsketch-arrange__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
          <path d={CHEVRON_PATH} />
        </svg>
      </button>
    )
  },
)
