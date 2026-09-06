/**
 * The app's one scrolling primitive.
 *
 * WHY a component and an exported class rather than a component alone: some
 * scrollers must stay a `ul` or a `section` to keep their semantics (a
 * listbox, an inspector's port list). Those take `SCROLL_AREA_CLASS`
 * directly; everything else takes `<ScrollArea>`. Both land on the same rule
 * set in `scroll-area.css`, so there is still exactly one scrollbar in the
 * product — see the WHY there for what the panel-scoped selectors could not do.
 */
import { forwardRef, type HTMLAttributes } from 'react'

import './scroll-area.css'

export const SCROLL_AREA_CLASS = 'ss-scroll'

export type ScrollAxis = 'y' | 'x' | 'both'

/** Compose the scroll class with a caller's own layout/paint class. */
export function scrollAreaClassName(className?: string): string {
  return className ? `${SCROLL_AREA_CLASS} ${className}` : SCROLL_AREA_CLASS
}

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Which way it scrolls. Vertical is the default because panels are columns. */
  axis?: ScrollAxis
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { axis = 'y', className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={scrollAreaClassName(className)}
      data-axis={axis === 'y' ? undefined : axis}
      {...rest}
    >
      {children}
    </div>
  )
})
