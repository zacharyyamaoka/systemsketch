import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SelectionLayoutActions } from './SelectionLayoutActions'

describe('selection layout actions', () => {
  it('renders only the applicable compact actions with names, tooltips, and distinct glyphs', () => {
    const both = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges
        organizeNodes
        onTidyEdges={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )

    expect(both).toContain('role="group"')
    expect(both).toContain('aria-label="Layout actions"')
    expect(both).toContain('title="Tidy edges"')
    expect(both).toContain('aria-label="Tidy edges"')
    expect(both).toContain('data-testid="selection-action-tidy-edges"')
    expect(both).toContain('title="Organize nodes"')
    expect(both).toContain('aria-label="Organize nodes"')
    expect(both).toContain('data-testid="selection-action-organize-nodes"')
    expect(both).toContain('<circle')
    expect(both).toContain('<path')

    const tidyOnly = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges
        organizeNodes={false}
        onTidyEdges={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )
    expect(tidyOnly).toContain('Tidy edges')
    expect(tidyOnly).not.toContain('Organize nodes')
  })

  it('adds no empty divider group when neither command applies', () => {
    const html = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges={false}
        organizeNodes={false}
        onTidyEdges={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )
    expect(html).toBe('')
  })
})
