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
    // The whole point of the field is that sharing a look is one word of
    // registry data, not a renderer branch. (Compared at a value neither kind
    // has a traced icon for — the per-kind FigJam icon data stays per kind,
    // only the DRAWING is shared.)
    const refamilied = control('verticalAlign', { glyph: 'align' as ContextualGlyphFamily })
    expect(markup(refamilied, 'weird')).toBe(markup(control('align'), 'weird'))
  })

  it('draws one thickness ladder however the surface composes it', () => {
    // Zach's rule for the connector row: "all the icons by construction must
    // be the same". The shape's stacked chips and the connector's bare row are
    // ONE registered control, so the same value can only draw one way — the
    // layout differs, the glyph cannot.
    const stacked = control('strokeWidth', { layout: 'row' })
    const beside = control('strokeWidth', { layout: 'row', id: 'connectorThickness' })
    expect(markup(stacked, 'thick')).toBe(markup(beside, 'thick'))
    // Each rung is drawn at the width it paints: 2 / 3.5 / 7 scene units in a
    // 20-unit box shown at 24px.
    expect(markup(stacked, 'thin')).toContain('height="1.6666666666666667"')
    expect(markup(stacked, 'thick')).toContain('height="5.833333333333334"')
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
