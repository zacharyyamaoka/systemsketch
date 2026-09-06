import { describe, expect, it } from 'vitest'
import {
	CODE_DEFAULT_CHARACTERS,
	CODE_DEFAULT_FONT_SIZE,
	CODE_MIN_CHARACTERS,
	charactersForCodeWidth,
	codePropsForCharacters,
	codePropsForPresentation,
	codePropsForResize,
	codeWidthForCharacters,
	getDefaultCodeProps,
} from './codeModel'

describe('Code block width grammar', () => {
	it('makes the default width an explicit character measure', () => {
		const props = getDefaultCodeProps()
		expect(props.characterWidth).toBe(CODE_DEFAULT_CHARACTERS)
		expect(props.w).toBe(codeWidthForCharacters(CODE_DEFAULT_CHARACTERS, CODE_DEFAULT_FONT_SIZE, true))
	})

	it('changes a preset or custom number through the same character-width authority', () => {
		const props = getDefaultCodeProps()
		const next = codePropsForCharacters(props, 72)
		expect(next.characterWidth).toBe(72)
		expect(next.w).toBe(codeWidthForCharacters(72, props.fontSize, props.showLineNumbers))
	})

	it('preserves authored columns while the font size or line-number gutter changes', () => {
		const props = { ...getDefaultCodeProps(), ...codePropsForCharacters(getDefaultCodeProps(), 64) }
		const fontChanged = codePropsForPresentation(props, { fontSize: 20, showLineNumbers: true })
		const guttersChanged = codePropsForPresentation({ ...props, ...fontChanged }, { fontSize: 20, showLineNumbers: false })
		expect(fontChanged.characterWidth).toBe(64)
		expect(guttersChanged.characterWidth).toBe(64)
		expect(guttersChanged.w).toBeLessThan(fontChanged.w)
	})

	it('keeps a free resize in pixels while reporting its nearest ch', () => {
		const props = getDefaultCodeProps()
		const freeWidth = codeWidthForCharacters(57, props.fontSize, props.showLineNumbers) + 3
		const resized = codePropsForResize(props, freeWidth, 99)
		expect(resized.w).toBe(freeWidth)
		expect(resized.h).toBeGreaterThanOrEqual(112)
		expect(resized.characterWidth).toBe(charactersForCodeWidth(freeWidth, props.fontSize, props.showLineNumbers))
		expect(codePropsForResize(props, 0, 20).characterWidth).toBe(CODE_MIN_CHARACTERS)
	})
})
