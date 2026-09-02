/**
 * Keeps tldraw's stock context-menu root usable for a whole session.
 *
 * The stock root is uncontrolled on Radix's side: `DefaultContextMenu` renders
 * `<ContextMenu.Root onOpenChange={...}>` with no `open` prop, mirrors the
 * result into tldraw's own menu registry, and renders the menu content only
 * while that mirror says open. Two stock paths clear the mirror without ever
 * telling Radix — `MenuClickCapture` calls `editor.menus.clearOpenMenus()`
 * straight from the dismissing pointerdown, and losing the app window tears the
 * portal down the same way. Radix's internal `open` is then stuck at `true`, so
 * every later `contextmenu` is a no-op: `setOpen(true)` changes nothing,
 * `onOpenChange` never fires, the mirror is never repopulated, and no menu
 * renders. Measured in the `?preset=stock` lane with a plain rectangle, so this
 * is the stock composition and not something SystemSketch introduced.
 *
 * Remounting the root is the only lever from outside — a fresh Radix root
 * starts closed. It is not free: tldraw puts `<Canvas />` inside the root's
 * Trigger, so a remount rebuilds the shape DOM and would discard an open inline
 * editor with it. So it is never done speculatively. It is done on window blur,
 * where nothing is in flight, and otherwise only when the wedge is actually
 * observed: a right-click that produced no menu. That gesture is then replayed
 * against the fresh root, so the user's own right-click is the one that opens.
 */
import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

/** tldraw registers the stock menu as `context menu-<contextId>`. */
const STOCK_CONTEXT_MENU_ID = 'context menu'

/** How long to let the stock open path finish before calling it wedged. */
const WEDGE_GRACE_MS = 80

export function isStockContextMenuOpen(editor: Editor): boolean {
	return editor.menus.getOpenMenus().some((id) => id.startsWith(STOCK_CONTEXT_MENU_ID))
}

/**
 * Returns a value to use as the stock context-menu root's `key`. Every change
 * remounts that root, which is what resets Radix's stuck `open` state.
 *
 * Because the canvas lives inside that root, this hook must be the only
 * reactive thing in the component that renders it: a subscription there that
 * changes per frame re-renders the canvas per frame.
 */
export function useStockContextMenuRootEpoch(editor: Editor): number {
	const [epoch, setEpoch] = useState(0)
	// Set when a wedge is detected, consumed by the replay after the remount.
	const replayRef = useRef<{ x: number; y: number } | null>(null)

	useEffect(() => {
		const container = editor.getContainer()
		const view = container.ownerDocument.defaultView
		if (!view) return

		const remount = () => setEpoch((value) => value + 1)

		const onContextMenu = (event: MouseEvent) => {
			// Our own replay is synthetic; only a real right-click can be a wedge.
			if (!event.isTrusted || replayRef.current) return
			const point = { x: event.clientX, y: event.clientY }
			editor.timers.setTimeout(() => {
				if (isStockContextMenuOpen(editor)) return
				// A right-drag pan also fires contextmenu at pointer-down and is
				// meant to open nothing. Only a finished click can be a wedge.
				if (editor.inputs.isPointing) return
				replayRef.current = point
				remount()
			}, WEDGE_GRACE_MS)
		}

		// Losing the window only strands Radix when a menu was showing as the
		// portal came down; a blur with nothing open leaves nothing to reset.
		// The reset is a rebuild of the whole shape DOM — 617 ms on a 48-Block
		// board, measured — so it is not spent on every alt-tab. tldraw clears
		// no menus on blur itself, so the registry is still exact here; and if
		// a menu ever does get stranded, the wedge detector above catches the
		// next right-click.
		const onBlur = () => {
			if (isStockContextMenuOpen(editor)) remount()
		}

		container.addEventListener('contextmenu', onContextMenu, true)
		view.addEventListener('blur', onBlur)
		return () => {
			container.removeEventListener('contextmenu', onContextMenu, true)
			view.removeEventListener('blur', onBlur)
		}
	}, [editor])

	useEffect(() => {
		const point = replayRef.current
		if (!point) return
		// One frame so the fresh root is listening before the gesture is replayed.
		editor.timers.requestAnimationFrame(() => {
			replayRef.current = null
			const container = editor.getContainer()
			const target = container.ownerDocument.elementFromPoint(point.x, point.y) ?? container
			target.dispatchEvent(new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: point.x,
				clientY: point.y,
				button: 2,
			}))
		})
	}, [editor, epoch])

	return epoch
}
