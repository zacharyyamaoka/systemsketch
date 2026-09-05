import { useEffect, useState } from 'react'
import { type Editor, useEditor, useValue } from 'tldraw'
import {
	CODE_LANGUAGES,
	CODE_WIDTH_PRESETS,
	CODE_SHAPE_TYPE,
	codePropsForCharacters,
	codePropsForPresentation,
	isCodeShape,
	nextCodeFontSize,
	type CodeShape,
} from './codeModel'

const WIDTH_LABELS: Record<(typeof CODE_WIDTH_PRESETS)[number], string> = {
	32: 'Compact',
	48: 'Standard',
	64: 'Wide',
	80: 'Extra wide',
}

export function getOnlySelectedCode(editor: Editor): CodeShape | null {
	const shape = editor.getOnlySelectedShape()
	return isCodeShape(shape) ? shape : null
}

function updateCode(editor: Editor, shape: CodeShape, props: Partial<CodeShape['props']>): void {
	editor.updateShape<CodeShape>({ id: shape.id, type: CODE_SHAPE_TYPE, props })
}

function WidthChooser({ editor, shape }: { editor: Editor; shape: CodeShape }) {
	const [draft, setDraft] = useState(String(shape.props.characterWidth))
	useEffect(() => setDraft(String(shape.props.characterWidth)), [shape.props.characterWidth])
	const commit = () => {
		const value = Number.parseInt(draft, 10)
		if (Number.isFinite(value)) {
			updateCode(editor, shape, codePropsForCharacters(shape.props, value))
		}
		setDraft(String(shape.props.characterWidth))
	}

	return (
		<div className="code-mini-menu__width-popover" role="dialog" aria-label="Code block width">
			<h3>Width</h3>
			<div className="code-mini-menu__width-presets" role="group" aria-label="Common code widths">
				{CODE_WIDTH_PRESETS.map((characters) => (
					<button
						key={characters}
						type="button"
						data-active={shape.props.characterWidth === characters}
						onClick={() => updateCode(editor, shape, codePropsForCharacters(shape.props, characters))}
					>
						<strong>{WIDTH_LABELS[characters]}</strong>
						<span>{characters} characters</span>
					</button>
				))}
			</div>
			<div className="code-mini-menu__custom">
				<label htmlFor={`code-width-${shape.id}`}>Custom</label>
				<input
					id={`code-width-${shape.id}`}
					data-testid="code-width-custom"
					type="number"
					min="16"
					max="160"
					step="1"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							commit()
						}
					}}
				/>
				<span>ch</span>
			</div>
			<p className="code-mini-menu__width-hint">Drag a side handle for any width; its character count appears live.</p>
		</div>
	)
}

/** The selected-block ribbon: fast surface controls plus the intentional width chooser. */
export function EditorCodeSelectionMiniMenu({ editor }: { editor: Editor }) {
	const shape = useValue('SystemSketch selected Code block mini menu', () => getOnlySelectedCode(editor), [editor])
	const [showWidth, setShowWidth] = useState(false)
	useEffect(() => setShowWidth(false), [shape?.id])
	if (!shape) return null

	const changeFont = (direction: -1 | 1) => {
		const fontSize = nextCodeFontSize(shape.props.fontSize, direction)
		updateCode(editor, shape, codePropsForPresentation(shape.props, {
			fontSize,
			showLineNumbers: shape.props.showLineNumbers,
		}))
	}

	return (
		<div className="code-mini-menu" role="toolbar" aria-label="Selected Code block actions">
			<span className="code-mini-menu__subject">Code</span>
			<div className="code-mini-menu__group">
				<select
					aria-label="Code language"
					data-testid="code-language"
					value={shape.props.language}
					onChange={(event) => updateCode(editor, shape, { language: event.target.value as CodeShape['props']['language'] })}
				>
					{CODE_LANGUAGES.map((language) => (
						<option key={language} value={language}>{language === 'plaintext' ? 'Plain text' : language}</option>
					))}
				</select>
			</div>
			<div className="code-mini-menu__group" aria-label="Code font size">
				<button type="button" aria-label="Decrease code font size" onClick={() => changeFont(-1)}>−</button>
				<button
					type="button"
					className="code-mini-menu__font-value"
					aria-label={`Code font size ${shape.props.fontSize} pixels`}
					onClick={() => changeFont(1)}
				>
					{shape.props.fontSize}px
				</button>
				<button type="button" aria-label="Increase code font size" onClick={() => changeFont(1)}>+</button>
			</div>
			<div className="code-mini-menu__group">
				<button
					type="button"
					aria-pressed={shape.props.showLineNumbers}
					data-testid="code-line-numbers"
					onClick={() => updateCode(editor, shape, codePropsForPresentation(shape.props, {
						fontSize: shape.props.fontSize,
						showLineNumbers: !shape.props.showLineNumbers,
					}))}
				>
					# Lines
				</button>
			</div>
			<div className="code-mini-menu__group">
				<button
					type="button"
					className="code-mini-menu__width-trigger"
					aria-expanded={showWidth}
					data-testid="code-width-trigger"
					onClick={() => setShowWidth((open) => !open)}
				>
					↔ {shape.props.characterWidth}ch
				</button>
				{showWidth ? <WidthChooser editor={editor} shape={shape} /> : null}
			</div>
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
