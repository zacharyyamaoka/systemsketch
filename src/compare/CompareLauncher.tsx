/**
 * The way in, and the reason the modal is a modal.
 *
 * Comparing is framed as an action you take at a moment — "Compare changes" —
 * not as a lens that is always on. Every tool in the prior-art sweep with real
 * version history does the same: Figma's command is literally *Compare to
 * latest version*, and Simulink and Camunda both make picking two endpoints an
 * explicit first step. A modal is the honest container for that framing,
 * because the thing you are doing while it is open is reviewing, not editing.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Editor } from 'tldraw'

import { CompareDialog } from './CompareDialog'

export interface CompareLauncherProps {
	editor: Editor | null
	currentPath: string | null
}

export function CompareLauncher({ editor, currentPath }: CompareLauncherProps) {
	const [open, setOpen] = useState(false)
	const close = useCallback(() => setOpen(false), [])

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
			setOpen((wasOpen) => !wasOpen)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [editor])

	if (!editor) return null

	return (
		<>
			<div className="systemsketch-compare-trigger-slot">
				<button
					type="button"
					className="systemsketch-compare-trigger"
					data-testid="compare-open"
					onClick={() => setOpen(true)}
				>
					Compare changes
				</button>
			</div>
			{open ? (
				<CompareDialog editor={editor} currentPath={currentPath} onClose={close} />
			) : null}
		</>
	)
}
