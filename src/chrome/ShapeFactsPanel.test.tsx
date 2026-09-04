import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ShapeFactsView } from './ShapeFactsPanel'
import type { ShapeFactsModel } from './shapeFactsModel'

const MODEL: ShapeFactsModel = {
  count: 1,
  title: 'arrow',
  shapeId: 'shape:arrow',
  geometry: [],
  styles: [],
  flags: [],
  locked: false,
}

describe('Shape facts arrow routing', () => {
  it('keeps the uncommon Slanted route in the inspector and gives it the requested glyph', () => {
    const html = renderToStaticMarkup(
      <ShapeFactsView
        model={MODEL}
        arrowRouting="slanted"
        onSetArrowRouting={vi.fn()}
        onUnlock={vi.fn()}
        onZoomToSelection={vi.fn()}
      />,
    )

    expect(html).toContain('data-inspector-section="Arrow routing"')
    expect(html).toContain('data-testid="shape-facts-arrow-routing-slanted"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('M 3 17 H 20 L 33 4')
    expect(html).toContain('Leaves horizontally, then climbs or descends diagonally.')
  })
})
