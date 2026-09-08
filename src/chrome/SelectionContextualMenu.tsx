import { type ReactNode, useEffect, useRef } from 'react'
import {
  TldrawUiToolbar,
  useAtom,
  useEditor,
  usePassThroughWheelEvents,
  useQuickReactor,
  useValue,
} from 'tldraw'

import { btDndDragState } from '../behaviorTree/treeDndDragState'
import {
  isSelectionOnScreen,
  placeSelectionMenu,
  type SelectionMenuSide,
} from './floatingToolbarPlacement'
import { useInterfaceScale } from '../settings/interfaceScale'
import { usePillPresentation } from '../settings/pillPresentation'

/**
 * Select-tool states in which the pointer is manipulating the selection.
 *
 * FigJam takes the menu out of the document for the whole gesture and rebuilds
 * it against the new bounds on pointer-up. tldraw's own contextual toolbar gets
 * the same effect from an `isMousingDown` prop supplied by the caller; reading
 * the select tool's state path instead covers handle drags and rotation without
 * a second pointer listener, and `Editor.isIn` matches on the path prefix so
 * `select.crop` covers its child states too.
 */
const MANIPULATING_STATES = [
  'select.translating',
  'select.resizing',
  'select.rotating',
  'select.dragging_handle',
  'select.brushing',
  'select.scribble_brushing',
  'select.crop',
]

/**
 * The row that holds tldraw's bottom toolbar. The menu stops above it the way
 * FigJam's stops above its tool belt, rather than running to the window edge.
 */
const BOTTOM_CHROME_SELECTOR = '.tlui-layout__bottom__main'

export interface SelectionContextualMenuProps {
  /** Accessible name for the toolbar. */
  label: string
  className?: string
  children: ReactNode
}

/**
 * A FigJam-style contextual menu anchored to the current selection.
 *
 * Rendered by SystemSketch's `InFrontOfTheCanvas` component, so it lives in the
 * container's own stacking context and outside the camera transform — the menu
 * therefore keeps a constant screen size at every zoom level, which is what
 * makes its placement constants meaningful.
 *
 * This deliberately replaces tldraw's `TldrawUiContextualToolbar`: that
 * primitive clamps the toolbar down onto a selection near the top of the
 * viewport instead of flipping below it, and its gap and margin constants are
 * not configurable. Everything else here is stock — `useQuickReactor` for the
 * per-frame position write, `TldrawUiToolbar` for the toolbar semantics,
 * `usePassThroughWheelEvents` so scrolling over the menu still pans the canvas.
 *
 * Placement policy lives in {@link placeSelectionMenu} (`@floating-ui/core`
 * middleware since 2026-09-07, replacing this file's own hand-rolled flip
 * math — see `floatingToolbarPlacement.ts`'s own doc for why and its
 * differential test for proof the policy is unchanged); see
 * `docs/figjam-contextual-menu-spec-2026-09-01.html` for the measurements.
 */
export function SelectionContextualMenu(props: SelectionContextualMenuProps) {
  const editor = useEditor()
  const isManipulating = useValue(
    'systemsketch selection menu manipulating',
    // A claimed Behavior Tree reorder drag (dnd-kit, `treeDndDrag.tsx`) is a
    // manipulation too, but the select tool sits in `select.idle` for it —
    // the drag lane's editor-scoped atom is its `select.translating`.
    () => btDndDragState.get(editor) !== null || MANIPULATING_STATES.some((path) => editor.isIn(path)),
    [editor],
  )

  // Out of the document for the whole gesture, exactly as FigJam does. The
  // gate lives out here so the positioned menu below can assume its own
  // element exists for the whole of its lifetime: a selection is often made
  // *during* a manipulation — marquee-brushing selects as it goes — and a
  // reactor that first ran against a missing element would subscribe to
  // nothing and never fire again.
  if (isManipulating) return null

  return <PositionedSelectionMenu {...props} />
}

function PositionedSelectionMenu({ label, className, children }: SelectionContextualMenuProps) {
  const editor = useEditor()
  const ref = useRef<HTMLDivElement>(null)
  usePassThroughWheelEvents(ref)
  const presentation = usePillPresentation()

  // Content changes the menu's width, which changes where its centre lands.
  // A resize is not a signal, so bump one the position reactor can subscribe to.
  const sizeEpoch = useAtom('systemsketch selection menu size', 0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => sizeEpoch.update((epoch) => epoch + 1))
    observer.observe(element)
    return () => observer.disconnect()
  }, [sizeEpoch])

  // The interface scale changes how many viewport pixels the menu occupies,
  // which moves where its centre lands — but it is applied as a transform, and
  // a transform does not fire a ResizeObserver. Bump the same epoch.
  const interfaceScale = useInterfaceScale()
  useEffect(() => {
    sizeEpoch.update((epoch) => epoch + 1)
  }, [interfaceScale, sizeEpoch])

  // `placeSelectionMenu` is async under `@floating-ui/core` (its
  // `computePosition` always resolves, even against the synthetic zero-DOM
  // platform — see `floatingToolbarPlacement.ts`). A monotonic pass id is
  // what keeps a slow/reordered resolution from writing stale coordinates
  // over a newer pass's: every reactor run claims the next id before calling
  // `placeSelectionMenu`, and the `.then` only writes if its own id is still
  // current when the promise settles.
  const placementPass = useRef(0)

  useQuickReactor(
    'systemsketch selection menu position',
    () => {
      // Read every signal before touching the DOM, so this reactor stays
      // subscribed even on a pass that bails out early — and before the one
      // `await`-shaped boundary below, so the subscription is captured
      // synchronously regardless of how long `placeSelectionMenu` takes.
      const screenBounds = editor.getSelectionRotatedScreenBounds()
      const viewportBounds = editor.getViewportScreenBounds()
      sizeEpoch.get()

      const element = ref.current
      if (!element) return
      if (!screenBounds) {
        element.dataset.visible = 'false'
        return
      }

      // tldraw documents viewport space — container-relative — for overlays
      // rendered by InFrontOfTheCanvas: screen point minus the viewport's
      // screen position.
      const selection = {
        x: screenBounds.x - viewportBounds.x,
        y: screenBounds.y - viewportBounds.y,
        w: screenBounds.w,
        h: screenBounds.h,
      }
      const viewport = { w: viewportBounds.w, h: viewportBounds.h }

      if (!isSelectionOnScreen(selection, viewport)) {
        element.dataset.visible = 'false'
        return
      }

      const menu = element.getBoundingClientRect()
      if (!menu.width || !menu.height) return

      const bottomChrome = editor
        .getContainer()
        .querySelector(BOTTOM_CHROME_SELECTOR)
        ?.getBoundingClientRect()

      const pass = ++placementPass.current
      placeSelectionMenu({
        selection,
        menu: { w: menu.width, h: menu.height },
        viewport,
        bottomObstacleTop: bottomChrome
          ? bottomChrome.top - viewportBounds.y
          : undefined,
      }).then((placement) => {
        // A newer pass (a later selection/resize/scale change) already ran
        // and possibly unmounted this element — never let a stale resolution
        // overwrite what it wrote, or write into a detached node.
        if (placementPass.current !== pass || ref.current !== element) return
        // Custom properties rather than `transform`, so the stylesheet keeps
        // ownership of how the interface scale is applied on top of the anchor.
        element.style.setProperty('--systemsketch-selection-menu-x', `${placement.x}px`)
        element.style.setProperty('--systemsketch-selection-menu-y', `${placement.y}px`)
        element.dataset.side = placement.side satisfies SelectionMenuSide
        element.dataset.visible = 'true'
      })
    },
    [editor, sizeEpoch],
  )

  // A plain test/inspection hook — the skin itself is a CSS custom-property
  // scope stamped at the app root (`App.tsx`), not here, because a control's
  // popover panel portals out of this element entirely (`useContainer()`)
  // and would not inherit a property scoped only to this local wrapper.
  // WHY only stamped while `compare` is on: an attribute selector with no
  // value never matches, so leaving it off entirely when Zach is not
  // actively comparing is part of what keeps the shipped pill byte-identical
  // to before this feature existed — see `pillPresentation.ts`.
  const pillLayout = presentation.compare && presentation.layout !== 'default' ? presentation.layout : undefined

  return (
    <div
      ref={ref}
      className={className}
      data-testid="systemsketch-selection-menu"
      data-visible="false"
      data-ss-pill-layout={pillLayout}
      onPointerDown={editor.markEventAsHandled}
    >
      <TldrawUiToolbar
        className="systemsketch-selection-menu__bar"
        orientation="horizontal"
        label={label}
        tooltipSide="top"
      >
        {children}
      </TldrawUiToolbar>
    </div>
  )
}
