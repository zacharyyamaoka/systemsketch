import { createContext, useContext } from 'react'

/**
 * The one deliberate escape hatch from the app's DOM tree.
 *
 * SystemSketch themes are inherited CSS variables. A portal that lands on
 * `document.body` therefore loses both the selected appearance and, for the
 * stock theme, the tldraw variables from which its tokens are derived. ThemeRoot
 * owns this host inside its stamped subtree; app-owned overlays opt into it
 * through this context instead of rediscovering a DOM element by selector.
 */
export const ThemePortalContext = createContext<HTMLElement | null>(null)

/** Returns the active appearance's in-tree portal destination, once mounted. */
export function useThemePortalContainer(): HTMLElement | null {
  return useContext(ThemePortalContext)
}
