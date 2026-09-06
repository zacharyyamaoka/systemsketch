import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { btGlyphFor } from './behaviorTreeModel'
import { BtGlyphSvg } from './btGlyphs'

/**
 * FNV-1a: the same "hash the rendered SVG" check the original bug report
 * used to prove `Fallback` and `ReactiveFallback` painted byte-identical
 * output. No crypto module needed for a collision check this small, and `src`
 * isn't built with Node's type defs (see tsconfig.app.json's `types`).
 */
function hash(text: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return (h >>> 0).toString(16)
}

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

describe('latched vs. reactive control glyphs', () => {
	// WHY: BT.CPP's `Fallback` latches `current_child_idx_` across ticks
	// (src/controls/fallback_node.cpp) — it does not re-check an earlier
	// child while a later one is RUNNING — while `ReactiveFallback` re-checks
	// every child from index 0 on every tick. Both used to map to the same
	// `controlKind: 'fallback'` and render a byte-identical glyph, hiding a
	// genuine runtime behavior difference. Same for Sequence/ReactiveSequence.
	it('gives ReactiveFallback a different controlKind-derived glyph than Fallback', () => {
		expect(btGlyphFor({ id: 'Fallback', kind: 'control', controlKind: 'fallback' })).toBe('fallback')
		expect(btGlyphFor({ id: 'ReactiveFallback', kind: 'control', controlKind: 'fallback' })).toBe('fallback-reactive')
	})

	it('gives ReactiveSequence a different controlKind-derived glyph than Sequence', () => {
		expect(btGlyphFor({ id: 'Sequence', kind: 'control', controlKind: 'sequence' })).toBe('sequence')
		expect(btGlyphFor({ id: 'ReactiveSequence', kind: 'control', controlKind: 'sequence' })).toBe('sequence-reactive')
	})

	it('renders Fallback and ReactiveFallback to genuinely different SVG output', () => {
		const fallbackHtml = renderToStaticMarkup(<BtGlyphSvg glyph="fallback" orientation="down" />)
		const reactiveFallbackHtml = renderToStaticMarkup(<BtGlyphSvg glyph="fallback-reactive" orientation="down" />)
		expect(hash(reactiveFallbackHtml)).not.toBe(hash(fallbackHtml))
		// The reactive variant must still carry the base fallback glyph, plus something extra.
		expect(reactiveFallbackHtml).toContain('M8.5 9a3.5 3.5 0 1 1 5 3.2c-1.2.7-1.5 1.4-1.5 2.8M12 18.5v.1')
		expect(reactiveFallbackHtml.length).toBeGreaterThan(fallbackHtml.length)
	})

	it('renders Sequence and ReactiveSequence to genuinely different SVG output', () => {
		const sequenceHtml = renderToStaticMarkup(<BtGlyphSvg glyph="sequence" orientation="down" />)
		const reactiveSequenceHtml = renderToStaticMarkup(<BtGlyphSvg glyph="sequence-reactive" orientation="down" />)
		expect(hash(reactiveSequenceHtml)).not.toBe(hash(sequenceHtml))
		expect(reactiveSequenceHtml).toContain('H20')
		expect(reactiveSequenceHtml.length).toBeGreaterThan(sequenceHtml.length)
	})

	it('renders identically for the same glyph across independent calls (sanity check on the hash comparison itself)', () => {
		const a = renderToStaticMarkup(<BtGlyphSvg glyph="fallback-reactive" orientation="down" />)
		const b = renderToStaticMarkup(<BtGlyphSvg glyph="fallback-reactive" orientation="down" />)
		expect(hash(a)).toBe(hash(b))
	})
})
