import { describe, expect, it } from 'vitest'

import {
	CODE_DEFAULT_CHARACTERS,
	CODE_MAX_CHARACTERS,
	CODE_MIN_CHARACTERS,
	charactersForCodeWidth,
	clampCodeCharacters,
	codeFontPixels,
	codePropsForCharacters,
	codePropsForPresentation,
	codePropsForResize,
	codeWidthForCharacters,
	getDefaultCodeProps,
} from './codeModel'

describe('code width model', () => {
	it('clamps characters into the readable range', () => {
		expect(clampCodeCharacters(4)).toBe(CODE_MIN_CHARACTERS)
		expect(clampCodeCharacters(400)).toBe(CODE_MAX_CHARACTERS)
		expect(clampCodeCharacters(Number.NaN)).toBe(CODE_DEFAULT_CHARACTERS)
		expect(clampCodeCharacters(48.4)).toBe(48)
	})

	it('round-trips characters through pixels at every rung', () => {
		for (const size of ['s', 'm', 'l', 'xl'] as const) {
			for (const showLineNumbers of [true, false]) {
				const width = codeWidthForCharacters(72, size, showLineNumbers)
				expect(charactersForCodeWidth(width, size, showLineNumbers)).toBe(72)
			}
		}
	})

	it('keeps the authored character measure across a type-scale change', () => {
		const props = getDefaultCodeProps()
		const next = codePropsForPresentation(props, { size: 'xl', showLineNumbers: props.showLineNumbers })
		expect(next.characterWidth).toBe(props.characterWidth)
		expect(next.w).toBeGreaterThan(props.w)
	})

	it('keeps the character measure while removing only the gutter', () => {
		const props = getDefaultCodeProps()
		const next = codePropsForPresentation(props, { size: props.size, showLineNumbers: false })
		expect(next.characterWidth).toBe(props.characterWidth)
		expect(next.w).toBeLessThan(props.w)
	})

	it('derives characters from a free resize instead of snapping the drag', () => {
		const props = getDefaultCodeProps()
		const wider = codePropsForResize(props, props.w + 200, props.h)
		expect(wider.w).toBe(props.w + 200)
		expect(wider.characterWidth).toBeGreaterThan(props.characterWidth)
	})

	it('never resizes below the minimum readable measure', () => {
		const props = getDefaultCodeProps()
		const narrow = codePropsForResize(props, 10, 10)
		expect(narrow.characterWidth).toBe(CODE_MIN_CHARACTERS)
		expect(narrow.w).toBe(codeWidthForCharacters(CODE_MIN_CHARACTERS, props.size, props.showLineNumbers))
	})

	it('maps the shared size rungs to the code type scale with Medium at 16px', () => {
		expect(codeFontPixels('m')).toBe(16)
		expect(codeFontPixels('s')).toBeLessThan(codeFontPixels('m'))
		expect(codeFontPixels('l')).toBeGreaterThan(codeFontPixels('m'))
		expect(codeFontPixels('xl')).toBeGreaterThan(codeFontPixels('l'))
	})

	it('writes an exact preset as one characters-plus-width pair', () => {
		const props = getDefaultCodeProps()
		const next = codePropsForCharacters(props, 64)
		expect(next.characterWidth).toBe(64)
		expect(next.w).toBe(codeWidthForCharacters(64, props.size, props.showLineNumbers))
	})
})

describe('code font scale', () => {
	it('scales rendered pixels and the derived width together', async () => {
		const { codeFontPixels: fontPx, codeWidthForCharacters: widthFor, charactersForCodeWidth: charsFor } = await import('./codeModel')
		expect(fontPx('m')).toBe(16)
		expect(fontPx('m', 1.5)).toBe(24)
		const width = widthFor(48, 'm', true, 1.5)
		expect(charsFor(width, 'm', true, 1.5)).toBe(48)
		expect(width).toBeGreaterThan(widthFor(48, 'm', true))
	})

	it('defaults a current record missing only fontScale to 1 via the v0->v1 migration', async () => {
		const { upgradeCodePropsV0ToV1, normalizeFontScale } = await import('./codeModel')
		const legacy = { w: 500, h: 148, code: 'x', language: 'python', size: 'm', showLineNumbers: true, characterWidth: 48 }
		expect(upgradeCodePropsV0ToV1(legacy)).toEqual({ ...legacy, fontScale: 1 })
		expect(upgradeCodePropsV0ToV1({ ...legacy, fontScale: 2 }).fontScale).toBe(2)
		expect(normalizeFontScale(undefined)).toBe(1)
		expect(normalizeFontScale(0)).toBe(1)
		expect(normalizeFontScale(1.25)).toBe(1.25)
	})

	it('keeps the authored column count when fontScale changes', async () => {
		const { codePropsForPresentation, getDefaultCodeProps } = await import('./codeModel')
		const props = getDefaultCodeProps()
		const scaled = codePropsForPresentation(props, { size: props.size, showLineNumbers: props.showLineNumbers, fontScale: 2 })
		expect(scaled.characterWidth).toBe(props.characterWidth)
		expect(scaled.fontScale).toBe(2)
		expect(scaled.w).toBeGreaterThan(props.w)
	})
})
