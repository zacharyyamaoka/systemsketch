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

import { ConnectionRoutingStyle } from '../blocks/connections/connectionModel'
import {
  APPEARANCE_COLORS,
  buildAppearanceControls,
  colorLabel,
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

/** A SystemSketch cable: the one connector that carries all three line shapes. */
const CABLE = styleMap([
  [DefaultColorStyle, shared('black')],
  [ConnectionRoutingStyle, shared('elbow')],
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
      'color', 'dash', 'size', 'arrowheadStart', 'arrowKind', 'arrowheadEnd',
    ])
  })

  it('orders the connector controls the way the arrow itself reads', () => {
    // FigJam's connector menu, captured from the running app, is
    // `Change color | Line style | Add text | Start point | Line shape | End
    // point`: where the arrow leaves, how it travels, where it lands. Any
    // control whose label is `Line shape` must sit between the two ends.
    const order = ids(buildAppearanceControls(CONNECTOR))
    const controls = buildAppearanceControls(CONNECTOR)
    const shape = controls.findIndex((control) => control.label === 'Line shape')
    expect(order.indexOf('arrowheadStart')).toBeLessThan(shape)
    expect(shape).toBeLessThan(order.indexOf('arrowheadEnd'))
  })

  it('offers a cable all three of FigJam line shapes', () => {
    // FigJam shows `Elbowed Curved Straight`; a SystemSketch cable is the one
    // connector that can hold all three, so it must show all three.
    const controls = buildAppearanceControls(CABLE)
    const shape = controls.find((control) => control.id === 'connectionRouting')!
    expect(shape.options.map((option) => option.label)).toEqual([
      'Elbowed', 'Curved', 'Straight',
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

  it('lays the palette out as FigJam does: eleven hues over their light twins', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT).find((c) => c.id === 'color')!
    expect(color.layout).toBe('swatches')
    expect(color.columns).toBe(11)
    expect(APPEARANCE_COLORS).toHaveLength(21)
    // Each light twin sits directly under its hue, one full row down.
    for (const hue of ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink']) {
      const names: readonly string[] = APPEARANCE_COLORS
      expect(names.indexOf(`light-${hue}`)).toBe(names.indexOf(hue) + 11)
    }
  })

  it('names each colour the way FigJam names it', () => {
    expect(colorLabel('dark-gray')).toBe('Dark gray')
    expect(colorLabel('light-teal')).toBe('Light teal')
  })
})
