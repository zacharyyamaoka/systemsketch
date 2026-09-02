import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeKindStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  type ReadonlySharedStyleMap,
  type SharedStyle,
  type StyleProp,
} from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
  APPEARANCE_COLORS,
  buildAppearanceControls,
  selectedOption,
  triggerLabel,
  type AppearanceControl,
} from './appearanceModel'

/**
 * A stand-in for what `useRelevantStyles()` hands back: the styles that apply
 * to the current selection, each either shared or mixed.
 */
function styleMap(entries: Array<[StyleProp<unknown>, SharedStyle<string>]>): ReadonlySharedStyleMap {
  const map = new Map(entries.map(([style, value]) => [style, value]))
  return { get: (style: StyleProp<unknown>) => map.get(style) } as unknown as ReadonlySharedStyleMap
}

const shared = (value: string): SharedStyle<string> => ({ type: 'shared', value })
const mixed: SharedStyle<string> = { type: 'mixed' }

/** Roughly what tldraw reports for a selected geo shape carrying text. */
const SHAPE_WITH_TEXT = styleMap([
  [GeoShapeGeoStyle, shared('rectangle')],
  [DefaultColorStyle, shared('blue')],
  [DefaultFillStyle, shared('solid')],
  [DefaultDashStyle, shared('draw')],
  [DefaultSizeStyle, shared('m')],
  [DefaultFontStyle, shared('sans')],
  [DefaultHorizontalAlignStyle, shared('middle')],
  [DefaultVerticalAlignStyle, shared('middle')],
])

const CONNECTOR = styleMap([
  [DefaultColorStyle, shared('black')],
  [DefaultDashStyle, shared('draw')],
  [DefaultSizeStyle, shared('m')],
  [ArrowShapeKindStyle, shared('arc')],
  [ArrowShapeArrowheadStartStyle, shared('none')],
  [ArrowShapeArrowheadEndStyle, shared('arrow')],
])

const ids = (controls: AppearanceControl[]) => controls.map((control) => control.id)

describe('appearance controls', () => {
  it('shows nothing when tldraw reports no relevant styles', () => {
    expect(buildAppearanceControls(null)).toEqual([])
    expect(buildAppearanceControls(styleMap([]))).toEqual([])
  })

  it('gives a shape its shape, paint and typography, in FigJam order', () => {
    expect(ids(buildAppearanceControls(SHAPE_WITH_TEXT))).toEqual([
      'geo', 'color', 'dash', 'size', 'font', 'align', 'verticalAlign',
    ])
  })

  it('gives a connector its routing and endpoints instead', () => {
    expect(ids(buildAppearanceControls(CONNECTOR))).toEqual([
      'color', 'dash', 'size', 'arrowKind', 'arrowheadStart', 'arrowheadEnd',
    ])
  })

  it('never offers a control the selection cannot accept', () => {
    // A bare connector has no fill and no geo, so neither may appear.
    const controls = buildAppearanceControls(CONNECTOR)
    expect(controls.some((control) => control.id === 'geo')).toBe(false)
    expect(controls.some((control) => control.modeControl)).toBe(false)
  })

  it('stacks fill above the palette the way FigJam does, rather than beside it', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT).find((c) => c.id === 'color')!
    expect(color.modeControl?.style).toBe(DefaultFillStyle)
    expect(color.modeControl?.options.map((option) => option.label)).toEqual([
      'No fill', 'Transparent', 'Solid', 'Fill', 'Pattern', 'Lined',
    ])
  })

  it('offers every value the style accepts, so the menu can show any document state', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT)
    const byId = Object.fromEntries(controls.map((control) => [control.id, control]))
    // `draw` is tldraw's default dash: omitting it for FigJam's three would
    // leave a freshly drawn shape with nothing selected in its own menu.
    expect(byId.dash.options.map((option) => option.value))
      .toEqual(['draw', 'solid', 'dashed', 'dotted', 'none'])
    expect(byId.size.options.map((option) => option.value)).toEqual(['s', 'm', 'l', 'xl'])
    expect(byId.font.options.map((option) => option.value)).toEqual(['sans', 'serif', 'mono', 'draw'])
    expect(byId.color.options.map((option) => option.value)).toEqual([...APPEARANCE_COLORS])
  })

  it('names typefaces the way FigJam does, so the reference app transfers', () => {
    const font = buildAppearanceControls(SHAPE_WITH_TEXT).find((c) => c.id === 'font')!
    expect(font.options.map((option) => option.label))
      .toEqual(['Simple', 'Bookish', 'Technical', 'Scribbled'])
  })

  it('reports the applied option, and nothing when the selection disagrees', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT)
    const color = controls.find((c) => c.id === 'color')!
    expect(selectedOption(color)?.label).toBe('Blue')

    const mixedControls = buildAppearanceControls(styleMap([[DefaultColorStyle, mixed]]))
    expect(selectedOption(mixedControls[0])).toBeUndefined()
  })

  it('labels the trigger with its value, and says mixed when there is none', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT)
    expect(triggerLabel(controls.find((c) => c.id === 'geo')!)).toBe('Shape, rectangle')
    expect(triggerLabel(controls.find((c) => c.id === 'size')!)).toBe('Size, medium')

    const mixedColor = buildAppearanceControls(styleMap([[DefaultColorStyle, mixed]]))[0]
    expect(triggerLabel(mixedColor)).toBe('Color, mixed')
  })

  it('lays the palette out as a grid, with light variants beside their hue', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT).find((c) => c.id === 'color')!
    expect(color.layout).toBe('swatches')
    expect(color.columns).toBe(7)
    expect(APPEARANCE_COLORS.indexOf('light-red')).toBe(APPEARANCE_COLORS.indexOf('red') + 1)
    expect(APPEARANCE_COLORS.indexOf('light-blue')).toBe(APPEARANCE_COLORS.indexOf('blue') + 1)
  })
})
