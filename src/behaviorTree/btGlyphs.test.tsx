import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BtGlyphSvg } from './btGlyphs'
import { btGlyphFor } from './behaviorTreeModel'

describe('BtGlyphSvg control-node arrows', () => {
	it('points sequence with the reading direction and parallel across it (orientation: down)', () => {
		const sequenceHtml = renderToStaticMarkup(<BtGlyphSvg glyph="sequence" orientation="down" />)
		expect(sequenceHtml).toContain('H20')

		const parallelHtml = renderToStaticMarkup(<BtGlyphSvg glyph="parallel" orientation="down" />)
		const parallelPaths = parallelHtml.match(/<path/g) ?? []
		expect(parallelPaths).toHaveLength(2)
		expect(parallelHtml).toContain('V20')
		expect(parallelHtml).not.toContain('H20')
	})

	it('points sequence with the reading direction and parallel across it (orientation: right)', () => {
		const sequenceHtml = renderToStaticMarkup(<BtGlyphSvg glyph="sequence" orientation="right" />)
		expect(sequenceHtml).toContain('V20')

		const parallelHtml = renderToStaticMarkup(<BtGlyphSvg glyph="parallel" orientation="right" />)
		const parallelPaths = parallelHtml.match(/<path/g) ?? []
		expect(parallelPaths).toHaveLength(2)
		expect(parallelHtml).toContain('H20')
		expect(parallelHtml).not.toContain('V20')
	})

	it('gives RecoveryNode its own glyph, distinct from Fallback, Retry and Repeat/Loop', () => {
		const glyph = btGlyphFor({ id: 'RecoveryNode', kind: 'control', controlKind: 'recoveryLoop' })
		expect(glyph).toBe('recovery-loop')
		const recoveryHtml = renderToStaticMarkup(<BtGlyphSvg glyph={glyph} orientation="down" />)
		const fallbackHtml = renderToStaticMarkup(<BtGlyphSvg glyph="fallback" orientation="down" />)
		const retryHtml = renderToStaticMarkup(<BtGlyphSvg glyph="retry" orientation="down" />)
		const loopHtml = renderToStaticMarkup(<BtGlyphSvg glyph="loop" orientation="down" />)
		expect(recoveryHtml).not.toBe(fallbackHtml)
		expect(recoveryHtml).not.toBe(retryHtml)
		expect(recoveryHtml).not.toBe(loopHtml)
		// Not the unknown-glyph fallback (a plain rounded rect) either.
		expect(recoveryHtml).not.toContain('rx="2.5"')
	})
})
