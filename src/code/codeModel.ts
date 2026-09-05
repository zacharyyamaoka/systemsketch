import { T, type TLShape } from 'tldraw'

export const CODE_SHAPE_TYPE = 'code' as const
export const CODE_TOOL_ID = 'code' as const

/** Values deliberately kept small enough to read in the selected-object ribbon. */
export const CODE_LANGUAGES = [
	'plaintext',
	'python',
	'javascript',
	'typescript',
	'json',
	'html',
	'css',
	'sql',
	'markdown',
] as const
export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export const CODE_FONT_SIZES = [12, 14, 16, 18, 20, 24] as const
export type CodeFontSize = (typeof CODE_FONT_SIZES)[number]
export const CODE_WIDTH_PRESETS = [32, 48, 64, 80] as const

export const CODE_MIN_CHARACTERS = 16
export const CODE_MAX_CHARACTERS = 160
export const CODE_DEFAULT_CHARACTERS = 48
export const CODE_DEFAULT_FONT_SIZE: CodeFontSize = 16
export const CODE_MIN_HEIGHT = 112
export const CODE_SIDE_PADDING = 28
export const CODE_GUTTER_WIDTH = 42

export const CODE_DEFAULT_TEXT = `def greet(name: str) -> str:
    return f"Hello, {name}!"`

export const CODE_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	code: T.string,
	language: T.literalEnum(...CODE_LANGUAGES),
	fontSize: T.literalEnum(...CODE_FONT_SIZES),
	showLineNumbers: T.boolean,
	/** A presentation measurement, never a semantic interpretation of the code. */
	characterWidth: T.number,
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CODE_SHAPE_TYPE]: {
			w: number
			h: number
			code: string
			language: CodeLanguage
			fontSize: CodeFontSize
			showLineNumbers: boolean
			characterWidth: number
		}
	}
}

export type CodeShape = TLShape<typeof CODE_SHAPE_TYPE>
export type CodeShapeProps = CodeShape['props']

export function isCodeShape(shape: TLShape | null | undefined): shape is CodeShape {
	return shape?.type === CODE_SHAPE_TYPE
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value))
}

export function clampCodeCharacters(value: number): number {
	return Math.round(clamp(Number.isFinite(value) ? value : CODE_DEFAULT_CHARACTERS, CODE_MIN_CHARACTERS, CODE_MAX_CHARACTERS))
}

export function isCodeLanguage(value: string): value is CodeLanguage {
	return CODE_LANGUAGES.includes(value as CodeLanguage)
}

export function codeFontSize(value: number): CodeFontSize {
	return CODE_FONT_SIZES.reduce((closest, candidate) => (
		Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest
	), CODE_DEFAULT_FONT_SIZE)
}

/** The mono-cell approximation used by the canvas and the resize readout. */
export function codeCharacterPixels(fontSize: number): number {
	return Math.max(1, fontSize * 0.61)
}

export function codeWidthForCharacters(
	characters: number,
	fontSize: number,
	showLineNumbers: boolean,
): number {
	return Math.round(
		CODE_SIDE_PADDING * 2
		+ (showLineNumbers ? CODE_GUTTER_WIDTH : 0)
		+ clampCodeCharacters(characters) * codeCharacterPixels(fontSize),
	)
}

export function charactersForCodeWidth(
	width: number,
	fontSize: number,
	showLineNumbers: boolean,
): number {
	const fixedWidth = CODE_SIDE_PADDING * 2 + (showLineNumbers ? CODE_GUTTER_WIDTH : 0)
	return clampCodeCharacters((Math.max(fixedWidth, width) - fixedWidth) / codeCharacterPixels(fontSize))
}

export function getDefaultCodeProps(): CodeShapeProps {
	const characterWidth = CODE_DEFAULT_CHARACTERS
	const fontSize = CODE_DEFAULT_FONT_SIZE
	const showLineNumbers = true
	return {
		w: codeWidthForCharacters(characterWidth, fontSize, showLineNumbers),
		h: 148,
		code: CODE_DEFAULT_TEXT,
		language: 'python',
		fontSize,
		showLineNumbers,
		characterWidth,
	}
}

export function codePropsForCharacters(
	props: CodeShapeProps,
	characters: number,
): Pick<CodeShapeProps, 'w' | 'characterWidth'> {
	const characterWidth = clampCodeCharacters(characters)
	return {
		characterWidth,
		w: codeWidthForCharacters(characterWidth, props.fontSize, props.showLineNumbers),
	}
}

/** Preserve the authored column count when type scale or gutters change. */
export function codePropsForPresentation(
	props: CodeShapeProps,
	next: Pick<CodeShapeProps, 'fontSize' | 'showLineNumbers'>,
): Pick<CodeShapeProps, 'w' | 'fontSize' | 'showLineNumbers' | 'characterWidth'> {
	const fontSize = codeFontSize(next.fontSize)
	const showLineNumbers = next.showLineNumbers
	const characterWidth = clampCodeCharacters(props.characterWidth)
	return {
		fontSize,
		showLineNumbers,
		characterWidth,
		w: codeWidthForCharacters(characterWidth, fontSize, showLineNumbers),
	}
}

/** A free tldraw resize is intentionally not snapped; its nearest `ch` is shown live. */
export function codePropsForResize(
	props: CodeShapeProps,
	width: number,
	height: number,
): Pick<CodeShapeProps, 'w' | 'h' | 'characterWidth'> {
	const minimumWidth = codeWidthForCharacters(CODE_MIN_CHARACTERS, props.fontSize, props.showLineNumbers)
	const w = Math.max(minimumWidth, Math.round(width))
	return {
		w,
		h: Math.max(CODE_MIN_HEIGHT, Math.round(height)),
		characterWidth: charactersForCodeWidth(w, props.fontSize, props.showLineNumbers),
	}
}

export function nextCodeFontSize(current: CodeFontSize, direction: -1 | 1): CodeFontSize {
	const index = CODE_FONT_SIZES.indexOf(current)
	return CODE_FONT_SIZES[clamp(index + direction, 0, CODE_FONT_SIZES.length - 1)]
}
