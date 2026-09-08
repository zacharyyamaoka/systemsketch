export type ContextualSurfaceId =
  | 'branch-selection'
  | 'behavior-tree-selection'
  | 'block-selection'
  | 'shape-selection'
  | 'block-title-editing'

export type ContextualSurfaceItemId =
  | 'branch-actions'
  | 'behavior-tree-actions'
  | 'block-actions'
  | 'appearance'
  | 'opacity'
  | 'arrange'
  | 'code-actions'
  | 'wrap'
  | 'layout'
  | 'propagation-focus'
  | 'title-formatting'

/**
 * Whole-menu composition is data too. Unique domain actions remain small
 * adapters, while the host decides nothing beyond which recipe is active.
 *
 * `code-actions` rides directly after `appearance`, never its own surface —
 * a Code block's language and text size are ordinary appearance rows (the
 * shared Font size ladder, not a bespoke widget); only what's unique to Code
 * (line numbers, character width) lives in `EditorCodeSelectionMiniMenu`, so
 * a selected Code block gets exactly one pill, not two.
 */
export const CONTEXTUAL_SURFACE_REGISTRY: Readonly<
  Record<ContextualSurfaceId, readonly ContextualSurfaceItemId[]>
> = {
  // Opacity and z-order/align/distribute apply to ANY selection in stock
  // tldraw, a Branch or Behavior Tree region included — Codex code review
  // caught these two surfaces omitting them while `shape-selection` and
  // `block-selection` carry both. Positioned right after the surface's own
  // actions item, matching where they land relative to `block-actions` on
  // `block-selection`.
  'branch-selection': ['branch-actions', 'opacity', 'arrange'],
  'behavior-tree-selection': ['behavior-tree-actions', 'opacity', 'arrange'],
  'block-selection': [
    'block-actions', 'appearance', 'opacity', 'arrange', 'code-actions', 'wrap', 'layout', 'propagation-focus',
  ],
  'shape-selection': ['appearance', 'opacity', 'arrange', 'code-actions', 'wrap', 'layout', 'propagation-focus'],
  'block-title-editing': ['title-formatting'],
}

export function contextualSurfaceItems(surface: ContextualSurfaceId): readonly ContextualSurfaceItemId[] {
  return CONTEXTUAL_SURFACE_REGISTRY[surface]
}
