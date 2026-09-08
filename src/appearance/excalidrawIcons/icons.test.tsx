import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import * as icons from './icons'
import { createIcon } from './createIcon'

/**
 * Every export from `./icons` that is a static glyph (a `ReactNode` built at
 * module load, same as upstream Excalidraw) rather than an Arrowhead
 * component (which takes a `flip` prop and is tested separately below).
 */
const ARROWHEAD_ICON_NAMES = [
  'ArrowheadNoneIcon',
  'ArrowheadArrowIcon',
  'ArrowheadTriangleIcon',
  'ArrowheadTriangleOutlineIcon',
  'ArrowheadCircleIcon',
  'ArrowheadCircleOutlineIcon',
  'ArrowheadDiamondIcon',
  'ArrowheadDiamondOutlineIcon',
  'ArrowheadBarIcon',
] as const

const staticIconEntries = Object.entries(icons).filter(
  ([name]) => !ARROWHEAD_ICON_NAMES.includes(name as (typeof ARROWHEAD_ICON_NAMES)[number]),
)

describe('vendored Excalidraw icons render', () => {
  it('has the expected static glyph count (catches an accidental drop or duplicate export)', () => {
    // 4 fill + 3 strokeWidth + 1 strokeStyle alias + 2 strokeStyle + 3 sloppiness
    // + 2 edges + 4 fontSize + 6 textAlign + 4 z-order + 4 align + 2 distribute
    // + 2 center + 3 arrow-type = 40.
    expect(staticIconEntries.length).toBe(40)
  })

  it.each(staticIconEntries)('%s renders a single <svg>', (_name, node) => {
    const markup = renderToStaticMarkup(node as React.ReactElement)
    expect(markup.startsWith('<svg')).toBe(true)
  })

  it.each(staticIconEntries)('%s carries no icon-fill-color CSS variable', (_name, node) => {
    const markup = renderToStaticMarkup(node as React.ReactElement)
    expect(markup).not.toContain('icon-fill-color')
  })

  it.each(ARROWHEAD_ICON_NAMES)('%s renders a single <svg>', (name) => {
    const Icon = icons[name]
    const markup = renderToStaticMarkup(Icon({}))
    expect(markup.startsWith('<svg')).toBe(true)
  })

  it.each(ARROWHEAD_ICON_NAMES)('%s carries no icon-fill-color CSS variable', (name) => {
    const Icon = icons[name]
    const markup = renderToStaticMarkup(Icon({}))
    expect(markup).not.toContain('icon-fill-color')
  })

  it('an Arrowhead icon rendered with flip differs from without', () => {
    const plain = renderToStaticMarkup(icons.ArrowheadArrowIcon({}))
    const flipped = renderToStaticMarkup(icons.ArrowheadArrowIcon({ flip: true }))
    expect(flipped).not.toBe(plain)
    expect(flipped).toContain('scale(-1, 1)')
    expect(plain).not.toContain('scale(-1, 1)')
  })

  it('StrokeStyleSolidIcon is Excalidraw\'s own alias to StrokeWidthBaseIcon, not a fourth glyph', () => {
    // Confirmed by reading actionProperties.tsx directly (source L865): the
    // solid stroke-style radio button reuses StrokeWidthBaseIcon rather than
    // the unused, separately-exported StrokeStyleSolidIcon upstream. This
    // module follows what Excalidraw actually draws.
    expect(icons.StrokeStyleSolidIcon).toBe(icons.StrokeWidthBaseIcon)
  })
})

describe('createIcon', () => {
  it('renders a bare path string with a currentColor fill, never the CSS variable', () => {
    const markup = renderToStaticMarkup(createIcon('M0 0h10v10H0z', 24) as React.ReactElement)
    expect(markup).toContain('fill="currentColor"')
    expect(markup).not.toContain('icon-fill-color')
  })

  it('applies the rtl-mirror class only when mirror is requested', () => {
    const mirrored = renderToStaticMarkup(createIcon('M0 0h1v1H0z', { mirror: true }) as React.ReactElement)
    const plain = renderToStaticMarkup(createIcon('M0 0h1v1H0z', {}) as React.ReactElement)
    expect(mirrored).toContain('rtl-mirror')
    expect(plain).not.toContain('class=')
  })

  it('defaults height to width when only width is given', () => {
    const markup = renderToStaticMarkup(createIcon('M0 0h1v1H0z', 32) as React.ReactElement)
    expect(markup).toContain('viewBox="0 0 32 32"')
  })
})
