export type ContextualSurfaceId =
  | 'branch-selection'
  | 'block-selection'
  | 'shape-selection'
  | 'block-title-editing'

export type ContextualSurfaceItemId =
  | 'branch-actions'
  | 'block-actions'
  | 'appearance'
  | 'wrap'
  | 'layout'
  | 'title-formatting'

/**
 * Whole-menu composition is data too. Unique domain actions remain small
 * adapters, while the host decides nothing beyond which recipe is active.
 */
export const CONTEXTUAL_SURFACE_REGISTRY: Readonly<
  Record<ContextualSurfaceId, readonly ContextualSurfaceItemId[]>
> = {
  'branch-selection': ['branch-actions'],
  'block-selection': ['block-actions', 'appearance', 'wrap', 'layout'],
  'shape-selection': ['appearance', 'wrap', 'layout'],
  'block-title-editing': ['title-formatting'],
}

export function contextualSurfaceItems(surface: ContextualSurfaceId): readonly ContextualSurfaceItemId[] {
  return CONTEXTUAL_SURFACE_REGISTRY[surface]
}
