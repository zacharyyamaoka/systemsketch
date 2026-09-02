import {
  DefaultColorStyle,
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
  parseTldrawJsonFile,
  registerColorsFromThemes,
} from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
  customColorHex,
  customColorName,
  findCustomColorNames,
  hydrateCustomColors,
  isCustomColor,
  normalizeHex,
  registerCustomColors,
} from './customColors'
import { FIGJAM_COLOR_NAMES, FIGJAM_THEME, SYSTEMSKETCH_THEMES } from './figjamPalette'

/** A one-rectangle board, the way `serializeTldrawJson` writes one, painted in `color`. */
function boardPaintedIn(color: string): string {
  const schema = createTLSchema({ shapes: defaultShapeSchemas, bindings: defaultBindingSchemas })
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: schema.serialize(),
    records: [
      { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} },
      { typeName: 'page', id: 'page:page', name: 'Page 1', index: 'a1', meta: {} },
      {
        typeName: 'shape', id: 'shape:one', type: 'geo', parentId: 'page:page', index: 'a1',
        x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {},
        props: {
          w: 340, h: 160, geo: 'rectangle', dash: 'draw', growY: 0, url: '', scale: 1,
          flipX: false, flipY: false, color, labelColor: 'black', fill: 'none', size: 'm',
          font: 'draw', align: 'middle', verticalAlign: 'middle',
          richText: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
      },
    ],
  })
}

function parse(json: string) {
  const schema = createTLSchema({ shapes: defaultShapeSchemas, bindings: defaultBindingSchemas })
  return parseTldrawJsonFile({ json, schema })
}

describe('custom colour names', () => {
  it('carries the hex in the name, so a file describes its own colours', () => {
    expect(customColorName('#A3F2C1')).toBe('custom-a3f2c1')
    expect(customColorName('a3f2c1')).toBe('custom-a3f2c1')
    expect(customColorName('#abc')).toBe('custom-aabbcc')
    expect(customColorHex('custom-a3f2c1')).toBe('#a3f2c1')
  })

  it('refuses anything that is not a colour', () => {
    expect(customColorName('#a3f2c')).toBeUndefined()
    expect(customColorName('red')).toBeUndefined()
    expect(normalizeHex('#ggg')).toBeUndefined()
    expect(isCustomColor('custom-A3F2C1')).toBe(false)
    expect(isCustomColor('light-blue')).toBe(false)
    expect(customColorHex('custom-xyz')).toBeUndefined()
  })

  it('finds every custom colour a document names, once each', () => {
    const text = JSON.stringify({
      records: [
        { props: { color: 'custom-a3f2c1', labelColor: 'custom-a3f2c1' } },
        { props: { color: 'custom-1e1e1e' } },
        { props: { text: 'custom-ffffff is only a word here' } },
      ],
    })
    expect(findCustomColorNames(text)).toEqual(['custom-a3f2c1', 'custom-1e1e1e'])
  })
})

describe('registering a custom colour', () => {
  it('grows the colour style and removes nothing', () => {
    // Nothing has mounted `<Tldraw themes>` here, so the style starts with
    // tldraw's own thirteen; registering a custom colour registers the whole
    // theme, FigJam's twenty-one included, and removes none of them.
    const before = [...DefaultColorStyle.values] as string[]
    expect(before).toContain('grey')

    const added = registerCustomColors(['custom-a3f2c1'])
    expect(added).toEqual(['custom-a3f2c1'])
    const after = DefaultColorStyle.values as readonly string[]
    expect(after).toEqual(expect.arrayContaining([...before, ...FIGJAM_COLOR_NAMES, 'custom-a3f2c1']))
  })

  it('paints the colour in both colour modes, derived the way the palette is', () => {
    registerCustomColors(['custom-3dadff'])
    const light = FIGJAM_THEME.colors.light as unknown as Record<string, { solid: string; semi: string }>
    const dark = FIGJAM_THEME.colors.dark as unknown as Record<string, { solid: string }>
    expect(light['custom-3dadff'].solid).toBe('#3dadff')
    expect(dark['custom-3dadff'].solid).toBe('#3dadff')
    // The same derivation FigJam's palette uses, so `blue` and its custom twin agree.
    expect(light['custom-3dadff'].semi).toBe(light.blue.semi)
  })

  it('is idempotent and validates the value the way the store will', () => {
    registerCustomColors(['custom-a3f2c1'])
    expect(registerCustomColors(['custom-a3f2c1'])).toEqual([])
    expect(() => DefaultColorStyle.validate('custom-a3f2c1')).not.toThrow()
    expect(() => DefaultColorStyle.validate('custom-000000')).toThrow()
  })

  it('hydrates a document before it is parsed', () => {
    const text = '{"props":{"color":"custom-00ff88"}}'
    expect(() => DefaultColorStyle.validate('custom-00ff88')).toThrow()
    expect(hydrateCustomColors(text)).toEqual(['custom-00ff88'])
    expect(() => DefaultColorStyle.validate('custom-00ff88')).not.toThrow()
  })
})

describe("tldraw's file parser", () => {
  // `parseTldrawJsonFile` creates a store of its own with no themes, and that
  // store's colour registration removes every name absent from tldraw's
  // default theme. Both of these failed before the palette was written into
  // that theme as well: a board in FigJam's teal could not be reopened.
  it('reopens a board painted in a FigJam-only colour', () => {
    registerColorsFromThemes(SYSTEMSKETCH_THEMES)
    const result = parse(boardPaintedIn('teal'))
    expect(result.ok, result.ok ? '' : String((result.error as { cause?: unknown }).cause)).toBe(true)
    // And the app's own registration survives the parse.
    expect(DefaultColorStyle.values as readonly string[]).toContain('light-teal')
  })

  it('reopens a board naming a custom colour once the text has been hydrated', () => {
    const board = boardPaintedIn('custom-5a5aff')
    expect(parse(board).ok).toBe(false)
    hydrateCustomColors(board)
    const result = parse(board)
    expect(result.ok, result.ok ? '' : String((result.error as { cause?: unknown }).cause)).toBe(true)
    expect(DefaultColorStyle.values as readonly string[]).toContain('custom-5a5aff')
  })
})
