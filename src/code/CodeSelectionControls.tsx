import { useEffect, useState } from 'react'
import {
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useEditor,
	useValue,
	type Editor,
} from 'tldraw'

import { FigjamGlyph } from '../appearance/AppearanceGlyph'
import { FIGJAM_CHECK_ICON } from '../appearance/figjamIconMap'
import {
	CHEVRON_PATH,
	CHEVRON_VIEWBOX,
	POPOVER_COLLISION_PADDING,
	POPOVER_GAP,
} from '../appearance/figjamTokens'
import {
	CODE_MAX_CHARACTERS,
	CODE_MIN_CHARACTERS,
	CODE_SHAPE_TYPE,
	CODE_WIDTH_PRESETS,
	clampCodeCharacters,
	codePropsForCharacters,
	codePropsForPresentation,
	isCodeShape,
	type CodeShape,
} from './codeModel'
import './code-block.css'

export function getOnlySelectedCode(editor: Editor): CodeShape | null {
	const shape = editor.getOnlySelectedShape()
	return isCodeShape(shape) ? shape : null
}

/** Every Code block in the selection — the controls below are batch writes. */
export function getSelectedCodeShapes(editor: Editor): CodeShape[] {
	return editor.getSelectedShapes().filter(isCodeShape)
}

function updateCodeShapes(
	editor: Editor,
	shapes: readonly CodeShape[],
	historyLabel: string,
	nextProps: (shape: CodeShape) => Partial<CodeShape['props']>,
): void {
	editor.markHistoryStoppingPoint(historyLabel)
	editor.run(() => {
		for (const shape of shapes) {
			editor.updateShape<CodeShape>({ id: shape.id, type: CODE_SHAPE_TYPE, props: nextProps(shape) })
		}
	})
}

/** `Mixed` when the selected Code blocks disagree, exactly as a style would read. */
function sharedValue<Value>(values: readonly Value[]): Value | 'mixed' {
	return values.every((value) => value === values[0]) ? values[0] : 'mixed'
}

/**
 * The Code block's own contribution to the ONE shared selection menu:
 * only what is unique to Code — the line-number toggle and the character
 * width. Language and text size are deliberately NOT here: language is an
 * ordinary row in the shared appearance menu (see `appearanceModel.ts`), and
 * text size is tldraw's own size style rendered by the standard Font size
 * combobox — the composable-menu rule is that a shape contributes only its
 * unique controls and reuses every shared one.
 */
export function EditorCodeSelectionMiniMenu({ editor }: { editor: Editor }) {
	const shapes = useValue(
		'SystemSketch selected Code blocks',
		() => getSelectedCodeShapes(editor),
		[editor],
	)
	if (shapes.length === 0) return null
	return (
		<div className="systemsketch-appearance code-selection-controls" data-testid="code-selection-controls">
			<CodeLineNumbersToggle editor={editor} shapes={shapes} />
			<CodeWidthControl editor={editor} shapes={shapes} />
		</div>
	)
}

function CodeLineNumbersToggle({ editor, shapes }: { editor: Editor; shapes: readonly CodeShape[] }) {
	const shared = sharedValue(shapes.map((shape) => shape.props.showLineNumbers))
	const pressed = shared === true
	return (
		<button
			type="button"
			className="systemsketch-appearance__trigger code-selection-controls__lines"
			data-control="codeLineNumbers"
			data-active={pressed || undefined}
			data-testid="code-line-numbers"
			aria-pressed={shared === 'mixed' ? 'mixed' : pressed}
			aria-label={`Line numbers, ${shared === 'mixed' ? 'mixed' : pressed ? 'on' : 'off'}`}
			title="Line numbers"
			onClick={() => {
				// A mixed selection resolves to "on": the affirmative reading of a
				// toggle press, the same convention tldraw's own toggles use.
				const next = shared === 'mixed' ? true : !pressed
				updateCodeShapes(editor, shapes, 'code line numbers', (shape) => codePropsForPresentation(shape.props, {
					size: shape.props.size,
					showLineNumbers: next,
				}))
			}}
		>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5" />
				<path d="M3.5 5.3h1v3M3.5 8.3h2" />
				<path d="M3.5 11.3h2l-2 2.4h2" />
				<path d="M3.5 15.8h2v1.4h-2v1.4h2" />
			</svg>
		</button>
	)
}

/**
 * Character width, presented the way every other valued property in this menu
 * is: a combobox trigger naming the current value, opening a FigJam-style
 * list of checked rows, with an exact-entry field beneath them.
 *
 * WHY this replaced the original design's four large preset BUTTONS
 * ("Compact / Standard / Wide / Extra wide", from the merged first
 * implementation): Zach called that grid "not standard". The established
 * idiom for a valued property here is the Font size combobox — a `list`
 * popover of check-marked rows — so the presets became ordinary rows named by
 * their value, and the exact number kept the inspector's labelled-field idiom.
 * Free-form width still belongs to the stock resize handle, whose live `ch`
 * readout is `CodeResizeIndicator` below.
 */
function CodeWidthControl({ editor, shapes }: { editor: Editor; shapes: readonly CodeShape[] }) {
	const shared = sharedValue(shapes.map((shape) => shape.props.characterWidth))
	const applyWidth = (characters: number) => {
		updateCodeShapes(editor, shapes, 'code width', (shape) => codePropsForCharacters(shape.props, characters))
	}
	return (
		<TldrawUiPopover id="systemsketch-code-width">
			<TldrawUiPopoverTrigger>
				<button
					type="button"
					className="systemsketch-appearance__trigger"
					data-control="codeWidth"
					data-trigger="text"
					data-testid="code-width-trigger"
					aria-label={`Code block width, ${shared === 'mixed' ? 'mixed' : `${shared} characters`}`}
					title="Code block width"
				>
					<span className="systemsketch-appearance__trigger-text">
						{shared === 'mixed' ? 'Mixed' : `${shared} ch`}
					</span>
					<svg className="systemsketch-appearance__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
						<path d={CHEVRON_PATH} />
					</svg>
				</button>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent
				side="top"
				align="center"
				sideOffset={POPOVER_GAP}
				collisionPadding={POPOVER_COLLISION_PADDING}
				autoFocusFirstButton={false}
			>
				<div
					className="systemsketch-appearance__panel"
					role="menu"
					aria-label="Code block width"
					data-layout="list"
					data-testid="systemsketch-appearance-panel-codeWidth"
				>
					<div className="systemsketch-appearance__options" role="group" aria-label="Code block width">
						{CODE_WIDTH_PRESETS.map((characters) => (
							<button
								key={characters}
								type="button"
								className="systemsketch-appearance__option"
								data-control="codeWidth"
								data-value={characters}
								role="menuitemradio"
								aria-checked={shared === characters}
								aria-label={`${characters} characters`}
								title={`${characters} characters`}
								onClick={() => applyWidth(characters)}
							>
								<FigjamGlyph name={FIGJAM_CHECK_ICON} className="systemsketch-appearance__check" />
								<span className="systemsketch-appearance__label">{characters} ch</span>
							</button>
						))}
					</div>
					<CodeWidthCustomField shared={shared} onCommit={applyWidth} />
				</div>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

function CodeWidthCustomField({
	shared,
	onCommit,
}: {
	shared: number | 'mixed'
	onCommit(characters: number): void
}) {
	const [draft, setDraft] = useState(shared === 'mixed' ? '' : String(shared))
	useEffect(() => setDraft(shared === 'mixed' ? '' : String(shared)), [shared])
	const commit = () => {
		const parsed = Number.parseInt(draft, 10)
		if (!Number.isFinite(parsed)) {
			setDraft(shared === 'mixed' ? '' : String(shared))
			return
		}
		onCommit(clampCodeCharacters(parsed))
	}
	return (
		<label className="code-width-custom">
			<span>Custom</span>
			<input
				data-testid="code-width-custom"
				type="number"
				min={CODE_MIN_CHARACTERS}
				max={CODE_MAX_CHARACTERS}
				step="1"
				value={draft}
				placeholder={shared === 'mixed' ? 'Mixed' : undefined}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault()
						commit()
					}
				}}
			/>
			<span className="code-width-custom__unit">ch</span>
		</label>
	)
}

/** Persisted pixels stay free-form; this is the reciprocal live `ch` readout
 * at the handle — the babble record's FR2 drag-feedback requirement. */
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
			↔ {state.characters} ch
		</div>
	)
}
