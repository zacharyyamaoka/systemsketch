import { Fragment, type ReactNode } from 'react'

import {
  contextualSurfaceItems,
  type ContextualSurfaceId,
  type ContextualSurfaceItemId,
} from './contextualSurfaceRegistry'

/** Render one ordered whole-menu recipe from the item adapters available here. */
export function ContextualSurface({
  surface,
  items,
}: {
  surface: ContextualSurfaceId
  items: Partial<Record<ContextualSurfaceItemId, ReactNode>>
}) {
  return contextualSurfaceItems(surface).map((item) => (
    <Fragment key={item}>{items[item] ?? null}</Fragment>
  ))
}
