import { type Editor, useEditor, useValue } from 'tldraw'
import {
	isCodeShape,
	type CodeShape,
} from './codeModel'
import { CodeContextualControls } from './CodeContextualControls'

export function getOnlySelectedCode(editor: Editor): CodeShape | null {
	const shape = editor.getOnlySelectedShape()
	return isCodeShape(shape) ? shape : null
}

/** The selected-block ribbon: fast surface controls plus the intentional width chooser. */
export function EditorCodeSelectionMiniMenu({ editor }: { editor: Editor }) {
	const shape = useValue('SystemSketch selected Code block mini menu', () => getOnlySelectedCode(editor), [editor])
	if (!shape) return null

	return (
		<div className="code-mini-menu" role="toolbar" aria-label="Selected Code block actions">
			<CodeContextualControls editor={editor} shape={shape} />
		</div>
	)
}

/** Persisted pixels stay free-form; this is the reciprocal live `ch` readout. */
export function CodeResizeIndicator() {
	const editor = useEditor()
	const state = useValue('SystemSketch Code resize width', () => {
		if (!editor.isIn('select.resizing')) return null
		const shape = getOnlySelectedCode(editor)
		const bounds = editor.getSelectionRotatedScreenBounds()
		const viewport = editor.getViewportScreenBounds()
		if (!shape || !bounds || !viewport) return null
		return {
			characters: shape.props.characterWidth,
			x: bounds.x - viewport.x + bounds.w + 9,
			y: bounds.y - viewport.y + bounds.h + 9,
		}
	}, [editor])
	if (!state) return null
	return (
		<div className="code-resize-hud" style={{ left: state.x, top: state.y }} aria-live="polite">
		↔ {state.characters}ch
		</div>
	)
}
