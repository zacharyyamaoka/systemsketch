import { Check, ChevronDown, Code2, ListOrdered, Ruler, Type } from 'lucide-react'
import { Fragment, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import {
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	type Editor,
} from 'tldraw'
import { POPOVER_COLLISION_PADDING, POPOVER_GAP } from '../appearance/figjamTokens'
import {
	CODE_FONT_SIZES,
	CODE_LANGUAGES,
	CODE_SHAPE_TYPE,
	CODE_WIDTH_PRESETS,
	clampCodeCharacters,
	codePropsForCharacters,
	codePropsForPresentation,
	type CodeLanguage,
	type CodeShape,
} from './codeModel'

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
	plaintext: 'Plain text',
	python: 'Python',
	javascript: 'JavaScript',
	typescript: 'TypeScript',
	json: 'JSON',
	html: 'HTML',
	css: 'CSS',
	sql: 'SQL',
	markdown: 'Markdown',
}

const WIDTH_LABELS: Record<(typeof CODE_WIDTH_PRESETS)[number], string> = {
	32: 'Compact',
	48: 'Standard',
	64: 'Wide',
	80: 'Extra wide',
}

type CodeContextualControlProps = {
	editor: Editor
	shape: CodeShape
}

type CodeContextualControl = {
	id: 'language' | 'font-size' | 'line-numbers' | 'width'
	Component: ComponentType<CodeContextualControlProps>
}

function updateCode(editor: Editor, shape: CodeShape, props: Partial<CodeShape['props']>): void {
	editor.updateShape<CodeShape>({ id: shape.id, type: CODE_SHAPE_TYPE, props })
}

function CodePopover({
	editor,
	id,
	label,
	trigger,
	children,
}: {
	editor: Editor
	id: string
	label: string
	trigger: ReactNode
	children: (close: () => void) => ReactNode
}) {
	const popoverId = `systemsketch-code-${id}`
	return (
		<TldrawUiPopover id={popoverId}>
			<TldrawUiPopoverTrigger>{trigger}</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent
				side="top"
				align="center"
				sideOffset={POPOVER_GAP}
				collisionPadding={POPOVER_COLLISION_PADDING}
				autoFocusFirstButton={false}
			>
				<div className="code-contextual-panel" role="menu" aria-label={label}>
					{children(() => editor.menus.deleteOpenMenu(popoverId))}
				</div>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

function DropdownChevron() {
	return <ChevronDown className="code-contextual-control__chevron" size={16} strokeWidth={2.25} aria-hidden="true" />
}

function CodeLanguageControl({ editor, shape }: CodeContextualControlProps) {
	return (
		<CodePopover
			editor={editor}
			id="language"
			label="Code language"
			trigger={(
				<button
					type="button"
					className="code-contextual-control code-contextual-control--language"
					data-testid="code-language"
					aria-label={`Code language, ${LANGUAGE_LABELS[shape.props.language]}`}
					title="Code language"
				>
					<Code2 size={16} strokeWidth={2} aria-hidden="true" />
					<span>{LANGUAGE_LABELS[shape.props.language]}</span>
					<DropdownChevron />
				</button>
			)}
		>
			{(close) => (
				<>
					<div className="code-contextual-panel__heading">Language</div>
					<div className="code-contextual-panel__list" role="group" aria-label="Code languages">
						{CODE_LANGUAGES.map((language) => {
							const selected = shape.props.language === language
							return (
								<button
									key={language}
									type="button"
									className="code-contextual-panel__option"
									data-testid={`code-language-option-${language}`}
									role="menuitemradio"
									aria-checked={selected}
									onClick={() => {
										updateCode(editor, shape, { language })
										close()
									}}
								>
									<Check className="code-contextual-panel__check" data-current={selected || undefined} size={15} strokeWidth={2.25} aria-hidden="true" />
									<span>{LANGUAGE_LABELS[language]}</span>
								</button>
							)
						})}
					</div>
				</>
			)}
		</CodePopover>
	)
}

function CodeFontSizeControl({ editor, shape }: CodeContextualControlProps) {
	return (
		<CodePopover
			editor={editor}
			id="font-size"
			label="Code text size"
			trigger={(
				<button
					type="button"
					className="code-contextual-control code-contextual-control--font-size"
					data-testid="code-font-size"
					aria-label={`Code text size, ${shape.props.fontSize} pixels`}
					title="Code text size"
				>
					<Type size={16} strokeWidth={2} aria-hidden="true" />
					<span>{shape.props.fontSize} px</span>
					<DropdownChevron />
				</button>
			)}
		>
			{(close) => (
				<>
					<div className="code-contextual-panel__heading">Text size</div>
					<div className="code-contextual-panel__list" role="group" aria-label="Code text sizes">
						{CODE_FONT_SIZES.map((fontSize) => {
							const selected = shape.props.fontSize === fontSize
							return (
								<button
									key={fontSize}
									type="button"
									className="code-contextual-panel__option code-contextual-panel__option--font-size"
									data-testid={`code-font-size-option-${fontSize}`}
									role="menuitemradio"
									aria-checked={selected}
									onClick={() => {
										updateCode(editor, shape, codePropsForPresentation(shape.props, {
											fontSize,
											showLineNumbers: shape.props.showLineNumbers,
										}))
										close()
									}}
								>
									<Check className="code-contextual-panel__check" data-current={selected || undefined} size={15} strokeWidth={2.25} aria-hidden="true" />
									<span style={{ fontSize: `${fontSize}px` }}>{fontSize} px</span>
								</button>
							)
						})}
					</div>
				</>
			)}
		</CodePopover>
	)
}

function CodeLineNumbersControl({ editor, shape }: CodeContextualControlProps) {
	const pressed = shape.props.showLineNumbers
	return (
		<button
			type="button"
			className="code-contextual-control code-contextual-control--icon"
			data-testid="code-line-numbers"
			aria-label={`Line numbers, ${pressed ? 'on' : 'off'}`}
			title="Line numbers"
			aria-pressed={pressed}
			onClick={() => updateCode(editor, shape, codePropsForPresentation(shape.props, {
				fontSize: shape.props.fontSize,
				showLineNumbers: !pressed,
			}))}
		>
			<ListOrdered size={17} strokeWidth={2} aria-hidden="true" />
			<span className="code-contextual-control__sr-only">Line numbers</span>
		</button>
	)
}

function CodeWidthPanel({ editor, shape, close }: CodeContextualControlProps & { close: () => void }) {
	const [draft, setDraft] = useState(String(shape.props.characterWidth))
	useEffect(() => setDraft(String(shape.props.characterWidth)), [shape.props.characterWidth])
	const commit = () => {
		const parsed = Number.parseInt(draft, 10)
		if (!Number.isFinite(parsed)) {
			setDraft(String(shape.props.characterWidth))
			return
		}
		const characters = clampCodeCharacters(parsed)
		updateCode(editor, shape, codePropsForCharacters(shape.props, characters))
		setDraft(String(characters))
		close()
	}

	return (
		<>
			<div className="code-contextual-panel__heading">Width</div>
			<p className="code-contextual-panel__description">Set a readable measure, or drag any handle for a free width.</p>
			<div className="code-contextual-panel__presets" role="group" aria-label="Common code widths">
				{CODE_WIDTH_PRESETS.map((characters) => {
					const selected = shape.props.characterWidth === characters
					return (
						<button
							key={characters}
							type="button"
							className="code-contextual-panel__preset"
							data-active={selected || undefined}
							role="menuitemradio"
							aria-checked={selected}
							onClick={() => {
								updateCode(editor, shape, codePropsForCharacters(shape.props, characters))
								close()
							}}
						>
							<Check className="code-contextual-panel__check" data-current={selected || undefined} size={15} strokeWidth={2.25} aria-hidden="true" />
							<span>
								<strong>{WIDTH_LABELS[characters]}</strong>
								<small>{characters} ch</small>
							</span>
						</button>
					)
				})}
			</div>
			<div className="code-contextual-panel__custom">
				<label htmlFor={`code-width-${shape.id}`}>Custom width</label>
				<div className="code-contextual-panel__input-wrap">
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
			</div>
		</>
	)
}

function CodeWidthControl(props: CodeContextualControlProps) {
	const { shape } = props
	return (
		<CodePopover
			editor={props.editor}
			id="width"
			label="Code block width"
			trigger={(
				<button
					type="button"
					className="code-contextual-control code-contextual-control--width"
					data-testid="code-width-trigger"
					aria-label={`Code block width, ${shape.props.characterWidth} characters`}
					title="Code block width"
				>
					<Ruler size={16} strokeWidth={2} aria-hidden="true" />
					<span>{shape.props.characterWidth} ch</span>
					<DropdownChevron />
				</button>
			)}
		>
			{(close) => <CodeWidthPanel {...props} close={close} />}
		</CodePopover>
	)
}

const CODE_CONTEXTUAL_CONTROLS: readonly CodeContextualControl[] = [
	{ id: 'language', Component: CodeLanguageControl },
	{ id: 'font-size', Component: CodeFontSizeControl },
	{ id: 'line-numbers', Component: CodeLineNumbersControl },
	{ id: 'width', Component: CodeWidthControl },
]

/**
 * Code owns only the controls that have domain meaning; their ordered recipe
 * is intentionally data-led so the incoming generic contextual-menu surface
 * can host these same modules without copying their behavior or labels.
 */
export function CodeContextualControls(props: CodeContextualControlProps) {
	return (
		<>
			{CODE_CONTEXTUAL_CONTROLS.map(({ id, Component }, index) => (
				<Fragment key={id}>
					{index > 0 ? <span className="code-contextual-control__separator" aria-hidden="true" /> : null}
					<Component {...props} />
				</Fragment>
			))}
		</>
	)
}
