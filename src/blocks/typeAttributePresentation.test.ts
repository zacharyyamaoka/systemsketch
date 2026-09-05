import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TYPE_ATTRIBUTE_PRESENTATION,
  TYPE_ATTRIBUTE_PRESENTATION_KEY,
  readTypeAttributePresentation,
  writeTypeAttributePresentation,
} from './typeAttributePresentation'

describe('Type attribute presentation', () => {
  it('defaults to inline chevrons and restores the code-style gutter choice', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    expect(readTypeAttributePresentation(storage)).toEqual(DEFAULT_TYPE_ATTRIBUTE_PRESENTATION)
    writeTypeAttributePresentation({ chevronPlacement: 'gutter' }, storage)
    expect(values.get(TYPE_ATTRIBUTE_PRESENTATION_KEY)).toContain('gutter')
    expect(readTypeAttributePresentation(storage)).toEqual({ chevronPlacement: 'gutter' })
  })

  it('does not treat malformed browser-local data as a board error', () => {
    expect(readTypeAttributePresentation({ getItem: () => 'not json' })).toEqual(DEFAULT_TYPE_ATTRIBUTE_PRESENTATION)
  })
})
