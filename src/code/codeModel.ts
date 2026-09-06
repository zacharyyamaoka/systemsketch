import { DefaultSizeStyle, StyleProp, T, type TLShape } from 'tldraw'

export const CODE_SHAPE_TYPE = 'code' as const
export const CODE_TOOL_ID = 'code' as const

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

export const CODE_LANGUAGE_LABELS: Record<CodeLanguage, string> = {
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

/**
 * Language is a style, not a plain prop, for the same reason a cable's routing
 * is (`ConnectionRoutingStyle`): selecting several Code blocks and choosing
 * Python must be one stock style write with shared-value reporting, and the
 * next Code block drawn should remember the last language picked — both of
 * which tldraw's style machinery already provides. It also makes the control
 * an ordinary row in the shared appearance menu instead of bespoke chrome.
 */
export const CodeLanguageStyle = StyleProp.defineEnum('systemsketch:codeLanguage', {
	defaultValue: 'python',
	values: CODE_LANGUAGES,
})

/**
 * The Code block's type scale rides tldraw's own four-rung size style — the
 * SAME control (and the same stored values) as every other text-bearing shape.
 *
 * WHY: Zach's rule for the composable selection menu is "we don't want to
 * relearn new menu items for each of these things" — so a Code block must not
 * grow a second, px-labelled font-size widget beside the standard Small/
 * Medium/Large ladder. The rung→pixel mapping below is the only Code-specific
 * part; Medium is 16px because the chosen babble direction (V5, see
 * docs/code-block-primitive-babble-2026-09-05.json) fixed 16px as the
 * reference specimen's default.
 */
export const CODE_FONT_SIZES = { s: 12, m: 16, l: 20, xl: 24 } as const
export type CodeSizeRung = keyof typeof CODE_FONT_SIZES

/**
 * The Code block's analogue of stock tldraw's per-shape `scale`: rendered
 * pixels are `CODE_FONT_SIZES[size] × fontScale`, so the shared Font size
 * menu's Custom row can hit any exact px here the same way it does on a stock
 * text shape (see `src/appearance/customFontSize.ts`). A plain prop — not a
 * StyleProp — matching stock, where `scale` is per-record and never part of
 * next-shape style memory.
 */
export const CODE_DEFAULT_FONT_SCALE = 1

/**
 * Three widths, each a real convention rather than a round guess: 72 is the
 * traditional plain-text/Fortran-column wrap, 80 is the canonical one (PEP 8,
 * Google's own C++ and Python style guides, and the 80-column terminal/punch
 * card it descends from), 100 is the modern wide-monitor allowance (Google's
 * Java guide, Rust's default).
 */
export const CODE_WIDTH_PRESETS = [72, 80, 100] as const

export const CODE_MIN_CHARACTERS = 16
export const CODE_MAX_CHARACTERS = 160
export const CODE_DEFAULT_CHARACTERS = 48
export const CODE_MIN_HEIGHT = 96
export const CODE_SIDE_PADDING = 16
export const CODE_GUTTER_WIDTH = 36

/**
 * Line numbers and width are styles, not plain props, for the same reason
 * `language` is (see above): a new Code block should remember the last one's
 * settings — `editor.createShapes` seeds every registered `StyleProp` from
 * `stylesForNextShape` automatically, so this is the whole fix, not a
 * per-tool memory of our own to build and keep in sync.
 */
export const CodeShowLineNumbersStyle = StyleProp.define('systemsketch:codeShowLineNumbers', {
	defaultValue: true,
	type: T.boolean,
})

export const CodeCharacterWidthStyle = StyleProp.define('systemsketch:codeCharacterWidth', {
	defaultValue: 48,
	type: T.number,
})

export const CODE_DEFAULT_TEXT = `def greet(name: str) -> str:
    return f"Hello, {name}!"`

export const CODE_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	code: T.string,
	language: CodeLanguageStyle,
	size: DefaultSizeStyle,
	fontScale: T.nonZeroNumber,
	showLineNumbers: CodeShowLineNumbersStyle,
	/** A presentation measurement, never a semantic interpretation of the code. */
	characterWidth: CodeCharacterWidthStyle,
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CODE_SHAPE_TYPE]: {
			w: number
			h: number
			code: string
			language: CodeLanguage
			size: CodeSizeRung
			fontScale: number
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

export function codeFontPixels(size: CodeSizeRung, fontScale = 1): number {
	return (CODE_FONT_SIZES[size] ?? CODE_FONT_SIZES.m) * normalizeFontScale(fontScale)
}

/** A stored record predating the prop (or a garbage value) reads as 1. */
export function normalizeFontScale(fontScale: unknown): number {
	return typeof fontScale === 'number' && Number.isFinite(fontScale) && fontScale > 0
		? fontScale
		: CODE_DEFAULT_FONT_SCALE
}

/** The mono-cell approximation used by the canvas and the resize readout. */
export function codeCharacterPixels(size: CodeSizeRung, fontScale = 1): number {
	return Math.max(1, codeFontPixels(size, fontScale) * 0.61)
}

export function codeWidthForCharacters(
	characters: number,
	size: CodeSizeRung,
	showLineNumbers: boolean,
	fontScale = 1,
): number {
	return Math.round(
		CODE_SIDE_PADDING * 2
		+ (showLineNumbers ? CODE_GUTTER_WIDTH : 0)
		+ clampCodeCharacters(characters) * codeCharacterPixels(size, fontScale),
	)
}

export function charactersForCodeWidth(
	width: number,
	size: CodeSizeRung,
	showLineNumbers: boolean,
	fontScale = 1,
): number {
	const fixedWidth = CODE_SIDE_PADDING * 2 + (showLineNumbers ? CODE_GUTTER_WIDTH : 0)
	return clampCodeCharacters((Math.max(fixedWidth, width) - fixedWidth) / codeCharacterPixels(size, fontScale))
}

export function getDefaultCodeProps(): CodeShapeProps {
	const characterWidth = CODE_DEFAULT_CHARACTERS
	const size: CodeSizeRung = 'm'
	const showLineNumbers = true
	return {
		w: codeWidthForCharacters(characterWidth, size, showLineNumbers),
		h: 148,
		code: CODE_DEFAULT_TEXT,
		language: 'python',
		size,
		fontScale: CODE_DEFAULT_FONT_SCALE,
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
		w: codeWidthForCharacters(characterWidth, props.size, props.showLineNumbers, normalizeFontScale(props.fontScale)),
	}
}

/**
 * Preserve the authored column count when the type scale or gutter changes.
 * The character measure is the authored fact (babble FR2: "presets, exact
 * entry, and live drag feedback all agree on one visible character count");
 * pixels are derived from it, never the other way around — except during a
 * stock resize, where the drag owns pixels and `ch` is derived.
 */
export function codePropsForPresentation(
	props: CodeShapeProps,
	next: Pick<CodeShapeProps, 'size' | 'showLineNumbers'> & { fontScale?: number },
): Pick<CodeShapeProps, 'w' | 'size' | 'fontScale' | 'showLineNumbers' | 'characterWidth'> {
	const characterWidth = clampCodeCharacters(props.characterWidth)
	const fontScale = normalizeFontScale(next.fontScale ?? props.fontScale)
	return {
		size: next.size,
		fontScale,
		showLineNumbers: next.showLineNumbers,
		characterWidth,
		w: codeWidthForCharacters(characterWidth, next.size, next.showLineNumbers, fontScale),
	}
}

/** A free tldraw resize is intentionally not snapped; its nearest `ch` is shown live. */
export function codePropsForResize(
	props: CodeShapeProps,
	width: number,
	height: number,
): Pick<CodeShapeProps, 'w' | 'h' | 'characterWidth'> {
	const fontScale = normalizeFontScale(props.fontScale)
	const minimumWidth = codeWidthForCharacters(CODE_MIN_CHARACTERS, props.size, props.showLineNumbers, fontScale)
	const w = Math.max(minimumWidth, Math.round(width))
	return {
		w,
		h: Math.max(CODE_MIN_HEIGHT, Math.round(height)),
		characterWidth: charactersForCodeWidth(w, props.size, props.showLineNumbers, fontScale),
	}
}

/**
 * v0 -> v1: seed `fontScale` on Code records stored before the custom font
 * size landed. Exported (like `blockShapeMigrations`' upgrades) so the test
 * exercises the transform without constructing an editor.
 */
export function upgradeCodePropsV0ToV1(props: Record<string, unknown>): Record<string, unknown> {
	return { ...props, fontScale: normalizeFontScale(props.fontScale) }
}
