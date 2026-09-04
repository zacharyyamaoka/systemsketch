/**
 * The way in, and the reason the modal is a modal.
 *
 * Comparing is framed as an action you take at a moment — "Compare changes" —
 * not as a lens that is always on. Every tool in the prior-art sweep with real
 * version history does the same: Figma's command is literally *Compare to
 * latest version*, and Simulink and Camunda both make picking two endpoints an
 * explicit first step. A modal is the honest container for that framing,
 * because the thing you are doing while it is open is reviewing, not editing.
 *
 * ## Why this file is a provider and a trigger, not one component
 *
 * Zach's note: *"the compare button... right now it just floats in the middle of
 * the screen."* It did, literally — `position: absolute; top: 64px; right: 8px`
 * put a pill four pixels below the top-right shell, attached to nothing,
 * overlapping the canvas. It was not aligned to any chrome because it was not IN
 * any chrome.
 *
 * The fix is to put the button where the app's other global actions already are:
 * the top-right shell, which is tldraw's own `SharePanel` seam. That splits this
 * file in two, because the BUTTON now renders inside `<Tldraw>` while the DIALOG
 * must not:
 *
 * - `CompareProvider` owns the open state and the dialog, and sits above
 *   `<Tldraw>`. The dialog's lifetime is therefore tied to the app, not to a
 *   tldraw chrome component that could remount underneath it.
 * - `CompareTrigger` is just the button, and renders wherever chrome wants it.
 *
 * The old arrangement's comment worried that a trigger inside tldraw's subtree
 * would sit above the modal. It cannot: `CompareDialog` portals into
 * `.systemsketch-theme-root`, so its stacking is decided by the portal target
 * and not by where the trigger happens to live.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TldrawUiButton, type Editor } from 'tldraw'

import { CompareDialog } from './CompareDialog'

interface CompareController {
	readonly isOpen: boolean
	open(): void
	close(): void
	toggle(): void
}

const CompareContext = createContext<CompareController | null>(null)

/**
 * The controller, or null where no provider is mounted.
 *
 * Null rather than a throw: the trigger renders inside tldraw's chrome, which is
 * also mounted by the development profiles and the embedded IDE lane, and
 * neither of those has a compare provider. A missing review surface should make
 * the button absent, never make the canvas fail to render.
 */
export function useCompare(): CompareController | null {
	return useContext(CompareContext)
}

export interface CompareProviderProps {
	editor: Editor | null
	currentPath: string | null
	children: ReactNode
}

export function CompareProvider({ editor, currentPath, children }: CompareProviderProps) {
	const [isOpen, setIsOpen] = useState(false)
	const close = useCallback(() => setIsOpen(false), [])

	// Shift+D, beside the other review surfaces. Ignored while typing, and
	// while any other overlay already owns the keyboard.
	useEffect(() => {
		if (!editor) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (!event.shiftKey || event.key.toLowerCase() !== 'd') return
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const target = event.target as HTMLElement | null
			if (target?.closest('input, textarea, [contenteditable="true"]')) return
			if (editor.getEditingShapeId()) return
			event.preventDefault()
			setIsOpen((wasOpen) => !wasOpen)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [editor])

	const controller = useMemo<CompareController>(
		() => ({
			isOpen,
			open: () => setIsOpen(true),
			close: () => setIsOpen(false),
			toggle: () => setIsOpen((wasOpen) => !wasOpen),
		}),
		[isOpen],
	)

	return (
		<CompareContext.Provider value={controller}>
			{children}
			{isOpen && editor ? (
				<CompareDialog editor={editor} currentPath={currentPath} onClose={close} />
			) : null}
		</CompareContext.Provider>
	)
}

/**
 * The button, for the top-right shell.
 *
 * An icon with a tooltip rather than the old labelled pill, because that is what
 * every other control in this shell is — a labelled button dropped into a row of
 * icons would read as a different KIND of thing and pull the eye away from the
 * board. The label survives in `title` and `aria-label`, and the action also has
 * Shift+D and the command palette, so nothing depends on reading the glyph.
 */
export function CompareTrigger() {
	const compare = useCompare()
	if (!compare) return null
	/*
	 * `TldrawUiButton`, not a raw `<button>`.
	 *
	 * `.systemsketch-shell-icon-button` styles only the SVG inside — the
	 * transparent background, the sizing and the hover all come from tldraw's own
	 * button primitive, which every other control in this shell goes through. A
	 * raw element wearing the same class therefore took the user agent's default
	 * button background and rendered as a filled dark chip beside three
	 * transparent ones. It looked like a deliberately emphasised control, which
	 * is exactly the sort of wrong that survives a class-name assertion and only
	 * shows up when you look at the pixels.
	 */
	return (
		<TldrawUiButton
			type="icon"
			className="systemsketch-shell-icon-button systemsketch-compare-trigger"
			data-testid="compare-open"
			title="Compare changes (Shift+D)"
			aria-label="Compare changes"
			aria-keyshortcuts="Shift+D"
			aria-expanded={compare.isOpen}
			onClick={() => compare.open()}
		>
			<CompareIcon />
		</TldrawUiButton>
	)
}

/**
 * Two overlapping panes — the diff glyph, not a clock.
 *
 * A clock would be the history icon, and history is what the modal contains
 * rather than what it is. The action is a COMPARISON, so the icon is two
 * versions of the same rectangle offset from each other, the mark Figma and
 * every diff tool uses for it.
 *
 * No `fill`, `stroke` or `stroke-width` here: `.systemsketch-shell-icon-button
 * svg` sets all three for the whole shell, and hard-coding them locally is how
 * one icon in a row of five stops matching the other four.
 */
function CompareIcon() {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true">
			<rect x="2.6" y="2.6" width="9.8" height="9.8" rx="2" />
			<path d="M7.6 7.6h7.8a2 2 0 0 1 2 2v5.8a2 2 0 0 1-2 2H9.6a2 2 0 0 1-2-2V7.6Z" />
		</svg>
	)
}
