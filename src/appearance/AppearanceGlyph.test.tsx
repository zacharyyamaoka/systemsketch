import { renderToStaticMarkup } from 'react-dom/server'
import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import {
  CONTEXTUAL_CONTROL_REGISTRY,
  bindContextualControl,
  type ContextualControl,
  type ContextualControlKind,
  type ContextualGlyphFamily,
} from '../contextualMenus/contextualControlRegistry'
import { AppearanceGlyph } from './AppearanceGlyph'

/** No family under test touches the editor; only `swatch` would. */
const editor = {} as Editor

function control(
  kind: ContextualControlKind,
  overrides: Partial<ContextualControl> = {},
): ContextualControl {
  return {
    ...bindContextualControl(kind, { id: kind, value: null, onSelect: vi.fn() }),
    ...overrides,
  }
}

function markup(subject: ContextualControl, value: string | undefined): string {
  return renderToStaticMarkup(
    <AppearanceGlyph control={subject} value={value} editor={editor} />,
  )
}

describe('glyph dispatch is the registry field, not the kind', () => {
  it('two kinds naming one family draw identically', () => {
    // `weight` reuses the `size` family: the whole point of the field is that
    // sharing a look is one word of registry data, not a renderer branch.
    // (Compared at `s`, a value neither kind has a traced icon for — the
    // per-kind FigJam icon data stays per kind, only the DRAWING is shared.)
    expect(CONTEXTUAL_CONTROL_REGISTRY.weight.glyph).toBe('size')
    expect(CONTEXTUAL_CONTROL_REGISTRY.size.glyph).toBe('size')
    expect(markup(control('weight'), 's'))
      .toBe(markup(control('size', { layout: 'row' }), 's'))
  })

  it('swapping a control\'s family swaps its drawing, kind untouched', () => {
    // An arrowhead control re-familied as lineShape draws the routing curve —
    // proof the renderer reads `glyph`, never `kind === ...` chains. (The
    // value has no traced icon, so the drawn family renders.)
    const refamilied = control('arrowheadEnd', { glyph: 'lineShape' as ContextualGlyphFamily })
    expect(markup(refamilied, 'weird')).toContain('c5 0 3-10 14-10')
    expect(markup(control('arrowheadEnd'), 'weird')).not.toContain('c5 0 3-10 14-10')
  })

  it('a control with no family draws nothing: its label is the preview', () => {
    // The language list's rows used to fall through to the arrowhead renderer
    // and wear a meaningless line in front of every language name.
    expect(CONTEXTUAL_CONTROL_REGISTRY.codeLanguage.glyph).toBeUndefined()
    expect(markup(control('codeLanguage'), 'python')).toBe('')
  })

  it('FigJam\'s traced icon still substitutes for a value it draws', () => {
    expect(markup(control('lineShape'), 'curve')).toContain('line-shape/Curved')
  })

  it('an own-drawing family beats a traced icon: the typeface list stays Aa', () => {
    // FigJam has typeface wordmark icons, but the registry's `font` family
    // draws the compact Aa — precedence is part of the family's contract.
    const rendered = markup(control('font'), 'serif')
    expect(rendered).toContain('Aa')
    expect(rendered).not.toContain('typeface/Bookish')
  })

  it('the Font size list stays glyph-free: each row previews itself', () => {
    expect(markup(control('size'), 'm')).toBe('')
  })
})
