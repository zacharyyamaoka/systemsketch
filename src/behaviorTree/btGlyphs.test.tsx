import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BtGlyphSvg } from './btGlyphs'

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
})
