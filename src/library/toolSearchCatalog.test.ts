import { describe, expect, it } from 'vitest'

import {
  TOOL_SEARCH_ALIAS_ITEMS,
  TOOLBAR_TOOL_SEARCH_ITEMS,
  filterToolSearchItems,
  toolSearchItemId,
  toolSearchItemLabel,
} from './toolSearchCatalog'

const availableToolbarTools = new Set(TOOLBAR_TOOL_SEARCH_ITEMS.map((item) => item.toolId))

describe('S tool-search catalog', () => {
  it('registers every visible product-toolbar label exactly once for search and aliases', () => {
    expect(TOOLBAR_TOOL_SEARCH_ITEMS.map((item) => item.label)).toEqual([
      'Cursor', 'Frame',
      'Block', 'Branch', 'Loop', 'Behavior Tree', 'Code', 'Pill', 'Type', 'Callout',
      'Rectangle', 'Ellipse', 'Triangle', 'Diamond', 'Line',
      'Straight arrow', 'Curved arrow', 'Elbow arrow',
      'Pen', 'Highlighter', 'Text',
    ])

    const aliasIds = TOOL_SEARCH_ALIAS_ITEMS.map((item) => item.id)
    expect(new Set(aliasIds).size).toBe(aliasIds.length)
    expect(TOOLBAR_TOOL_SEARCH_ITEMS.every((item) => aliasIds.includes(item.id))).toBe(true)
  })

  it('finds every visible toolbar tool through its displayed name and prefers that literal name', () => {
    for (const expected of TOOLBAR_TOOL_SEARCH_ITEMS) {
      const matches = filterToolSearchItems(expected.label, {}, availableToolbarTools)
      expect(matches.map(toolSearchItemLabel)).toContain(expected.label)
      expect(toolSearchItemLabel(matches[0]!)).toBe(expected.label)
    }

    // Text has long treated "type" as a search synonym. The real Type tool
    // must nevertheless win when that is exactly what someone asks for.
    expect(filterToolSearchItems('type', {}, availableToolbarTools).map(toolSearchItemLabel).slice(0, 2))
      .toEqual(['Type', 'Text'])
  })

  it('only offers a toolbar row when its registered tool can be armed', () => {
    const blockOnly = filterToolSearchItems('block', {}, new Set(['text']))
    expect(blockOnly.map(toolSearchItemId)).not.toContain('block')

    const aliases = filterToolSearchItems('@function', { block: ['@function'] }, availableToolbarTools)
    expect(aliases.map(toolSearchItemId)).toContain('block')
  })
})
