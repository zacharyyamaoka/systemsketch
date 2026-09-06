import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SelectionLayoutActions } from './SelectionLayoutActions'

describe('selection layout actions', () => {
  it('renders only the applicable compact actions with names, tooltips, and distinct glyphs', () => {
    const all = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges
        resetRouting
        organizeNodes
        onTidyEdges={() => {}}
        onResetRouting={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )

    expect(all).toContain('role="group"')
    expect(all).toContain('aria-label="Layout actions"')
    expect(all).toContain('title="Tidy edges"')
    expect(all).toContain('aria-label="Tidy edges"')
    expect(all).toContain('data-testid="selection-action-tidy-edges"')
    expect(all).toContain('title="Reset to automatic"')
    expect(all).toContain('aria-label="Reset to automatic"')
    expect(all).toContain('data-testid="selection-action-reset-routing"')
    expect(all).toContain('title="Organize nodes"')
    expect(all).toContain('aria-label="Organize nodes"')
    expect(all).toContain('data-testid="selection-action-organize-nodes"')
    expect(all).toContain('<circle')
    expect(all).toContain('<path')

    const tidyOnly = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges
        resetRouting={false}
        organizeNodes={false}
        onTidyEdges={() => {}}
        onResetRouting={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )
    expect(tidyOnly).toContain('Tidy edges')
    expect(tidyOnly).not.toContain('Reset to automatic')
    expect(tidyOnly).not.toContain('Organize nodes')

    const resetOnly = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges={false}
        resetRouting
        organizeNodes={false}
        onTidyEdges={() => {}}
        onResetRouting={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )
    expect(resetOnly).toContain('Reset to automatic')
    expect(resetOnly).not.toContain('Tidy edges')
    expect(resetOnly).not.toContain('Organize nodes')
  })

  it('adds no empty divider group when no command applies', () => {
    const html = renderToStaticMarkup(
      <SelectionLayoutActions
        tidyEdges={false}
        resetRouting={false}
        organizeNodes={false}
        onTidyEdges={() => {}}
        onResetRouting={() => {}}
        onOrganizeNodes={() => {}}
      />,
    )
    expect(html).toBe('')
  })
})
