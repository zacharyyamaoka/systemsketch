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
  LineShapeSplineStyle,
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
  unofferedValue,
  withEdgeValues,
  EDGE_MIXED,
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

/**
 * Roughly what tldraw reports for a selected geo shape: `useRelevantStyles()`
 * reports font/size/align/verticalAlign as relevant whether or not the shape
 * actually has text, which is why `buildAppearanceControls` takes a separate
 * `hasText` flag rather than reading typography off this map directly.
 */
const SHAPE_WITH_TEXT = styleMap([
  [GeoShapeGeoStyle, shared('rectangle')],
  [DefaultColorStyle, shared('blue')],
  [DefaultFillStyle, shared('solid')],
  [DefaultDashStyle, shared('solid')],
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

/**
 * What tldraw actually reports for a labelled arrow: font, alignment and
 * vertical alignment are just as "relevant" as they are for a bare one — the
 * arrow carries `richText`, so tldraw's own relevance check doesn't know or
 * care whether it's empty. FigJam's connector pill never shows any of the
 * three either way (`docs/assets/menu-diff-figjam-arrow-text-2026-09-03.json`).
 */
const CONNECTOR_WITH_TEXT = styleMap([
  [DefaultColorStyle, shared('black')],
  [DefaultDashStyle, shared('draw')],
  [DefaultSizeStyle, shared('m')],
  [DefaultFontStyle, shared('sans')],
  [DefaultHorizontalAlignStyle, shared('middle')],
  [DefaultVerticalAlignStyle, shared('middle')],
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
    expect(buildAppearanceControls(null, true)).toEqual([])
    expect(buildAppearanceControls(styleMap([]), true)).toEqual([])
  })

  it('gives a shape its shape, paint and typography once it has text, in FigJam order', () => {
    // Captured from FigJam's shape-with-text pill: `Shape | Change color, Line
    // style | Typeface, Font size | ... | Text alignment`. Font size follows
    // Typeface.
    expect(ids(buildAppearanceControls(SHAPE_WITH_TEXT, true))).toEqual([
      'geo', 'color', 'strokeColor', 'font', 'size', 'align', 'verticalAlign',
    ])
  })

  it('hides typography until the shape actually has text', () => {
    // FigJam's rectangle-with-no-text pill is `Shape · Change color · Line
    // style`, full stop — three controls, never Typeface/Font size/alignment,
    // even though tldraw reports all three as relevant regardless of content.
    expect(ids(buildAppearanceControls(SHAPE_WITH_TEXT, false))).toEqual([
      'geo', 'color', 'strokeColor',
    ])
  })

  it('gives a connector its routing and endpoints instead', () => {
    // FigJam's connector pill has one Line style holding both weight and
    // dash, so neither `dash` nor `size` appears on its own.
    expect(ids(buildAppearanceControls(CONNECTOR, true))).toEqual([
      'color', 'lineStyle', 'arrowheadStart', 'lineShape', 'arrowheadEnd',
    ])
  })

  it('never gives a connector typography, labelled or not', () => {
    // Unlike a shape, a connector's label typography is fixed, not
    // user-editable, in FigJam — confirmed by its own labelled-connector
    // capture carrying no Typeface or Font size control. `hasText` therefore
    // makes no difference here.
    for (const hasText of [true, false]) {
      const order = ids(buildAppearanceControls(CONNECTOR_WITH_TEXT, hasText))
      expect(order).not.toContain('font')
      expect(order).not.toContain('align')
      expect(order).not.toContain('verticalAlign')
    }
  })

  it('merges a connector\'s thickness and dash into one Line style, beside each other', () => {
    const lineStyle = buildAppearanceControls(CONNECTOR, true).find((c) => c.id === 'lineStyle')!
    expect(lineStyle.style).toBe(DefaultDashStyle)
    expect(lineStyle.trigger).toBe('icon')
    expect(lineStyle.modePlacement).toBe('beside')
    // The connector row is the SHAPE's thickness control, not a second
    // vocabulary: same kind, same options, same meta-backed write. The old
    // connector-only Weight wrote the stock `size` style, which a cable's
    // painter ignored and which dragged a shape's label size along with it.
    expect(lineStyle.modeControl?.kind).toBe('strokeWidth')
    expect(lineStyle.modeControl?.style).toBeUndefined()
    expect(lineStyle.modeControl?.meta).toBe('width')
    expect(lineStyle.modeControl?.options.map((option) => option.label))
      .toEqual(['Thin', 'Medium', 'Thick'])
    expect(lineStyle.modeControl?.options.map((option) => option.value))
      .toEqual(['thin', 'medium', 'thick'])
    // `draw` is offered now too, as "Hand-drawn" — the excalidraw-vendored
    // sloppiness glyph joining the vocabulary (see `AppearanceGlyph.tsx`).
    expect(triggerLabel(lineStyle)).toBe('Line style, hand-drawn')
  })

  it('names both halves of the stacked Line style trigger, since its icon shows neither', () => {
    const stroke = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'strokeColor')!
    // Three stacked sections, deepest first — thickness, line style, palette.
    expect(triggerLabel(stroke)).toBe('Line style, mixed solid blue')
    expect(triggerLabel(withEdgeValues(
      stroke,
      { color: 'black', pattern: 'async', width: 'thick' },
    ))).toBe('Line style, thick async black')
    // A trigger that draws its own value still names only that value.
    const color = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'color')!
    expect(triggerLabel(color)).toBe('Color, blue')
  })

  it('gives a shape\'s Line style its own palette, with the chips stacked above it', () => {
    // FigJam's Stroke popover: the line-style chips, a hairline, then a
    // palette — so an edge can be a different colour from the fill, which one
    // tldraw `color` cannot express on its own.
    const stroke = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'strokeColor')!
    expect(stroke.label).toBe('Line style')
    expect(stroke.layout).toBe('swatches')
    expect(stroke.trigger).toBe('icon')
    expect(stroke.meta).toBe('color')
    expect(stroke.options.map((option) => option.value)).toEqual([...APPEARANCE_COLORS])
    expect(stroke.modePlacement).toBe('above')
    expect(stroke.modeControl?.id).toBe('lineStyle')
    expect(stroke.modeControl?.layout).toBe('chips')
    expect(stroke.modeControl?.meta).toBe('pattern')
    expect(stroke.modeControl?.options.map((option) => option.label))
      .toEqual(['Hand-drawn', 'Solid', 'Dashed', 'Dotted', 'Async', 'None'])
    // ...and the thickness rungs above those again, the same `above` link one
    // more time rather than a second kind of relationship.
    expect(stroke.modeControl?.modePlacement).toBe('above')
    expect(stroke.modeControl?.modeControl?.id).toBe('strokeWidth')
    expect(stroke.modeControl?.modeControl?.layout).toBe('row')
    expect(stroke.modeControl?.modeControl?.meta).toBe('width')
  })

  it('drops the thickness row when nothing in the selection could paint one', () => {
    // A Block cable carries a dash but paints its own semantic width, so its
    // reading folds to null — the row goes away rather than lying about a
    // write the canvas would ignore.
    const stroke = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'strokeColor')!
    const withNone = withEdgeValues(stroke, { color: null, pattern: null, width: null })
    expect(withNone.modeControl?.id).toBe('lineStyle')
    expect(withNone.modeControl?.modeControl).toBeUndefined()
    const withSome = withEdgeValues(stroke, { color: null, pattern: null, width: 'thin' })
    expect(withSome.modeControl?.modeControl?.value).toEqual({ type: 'shared', value: 'thin' })
  })

  it('gives a shape with no edge palette the same chips, without the palette', () => {
    // A freehand stroke has a dash but no geo, so there is no edge colour to
    // choose — its outline is its only colour. It still gets the one
    // line-style vocabulary, not a second, shorter one.
    const draw = styleMap([
      [DefaultColorStyle, shared('black')],
      [DefaultDashStyle, shared('solid')],
      [DefaultSizeStyle, shared('m')],
    ])
    const control = buildAppearanceControls(draw, false).find((c) => c.id === 'lineStyle')!
    expect(control.layout).toBe('chips')
    // No palette under it — but the same thickness row above it, because a
    // freehand stroke has a width like every other edge.
    expect(control.modeControl?.id).toBe('strokeWidth')
    expect(control.options.map((option) => option.value))
      .toEqual(['draw', 'solid', 'dashed', 'dotted', 'async', 'none'])
  })

  it('gives a connector the shape\'s own line styles with the labels turned off', () => {
    // Zach's rule for these menus: the connector's little row IS the shape's
    // control with the text toggled off. Same options, same order, same
    // meta-backed writes — only `layout` differs, which is the label toggle.
    const shape = buildAppearanceControls(SHAPE_WITH_TEXT, false)
      .find((c) => c.id === 'strokeColor')!.modeControl!
    const connector = buildAppearanceControls(CONNECTOR, true).find((c) => c.id === 'lineStyle')!
    expect(connector.options).toEqual(shape.options)
    expect(connector.meta).toBe(shape.meta)
    expect(connector.label).toBe(shape.label)
    expect(shape.layout).toBe('chips')
    expect(connector.layout).toBe('row')
  })

  it('shows a shape\'s fixed Shape-trigger icon, not a preview of the current geo', () => {
    // FigJam's Shape trigger is the same circle-and-square glyph whichever
    // geo is actually selected.
    const geo = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'geo')!
    expect(geo.trigger).toBe('icon')
  })

  it('names a shape\'s size the way FigJam does: a Font size combobox after Typeface', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT, true)
    const size = controls.find((c) => c.id === 'size')!
    expect(size.label).toBe('Font size')
    expect(size.trigger).toBe('text')
    expect(size.layout).toBe('list')
    expect(ids(controls).indexOf('font')).toBe(ids(controls).indexOf('size') - 1)
    expect(controls.find((c) => c.id === 'font')!.trigger).toBe('icon')
  })

  it('keeps Font size for text selected beside a cable, which has no dash to merge into', () => {
    const textAndCable = styleMap([
      [DefaultColorStyle, shared('black')],
      [DefaultSizeStyle, shared('m')],
      [DefaultFontStyle, shared('sans')],
      [ConnectionRoutingStyle, shared('elbow')],
    ])
    // Not gated by `hasText`: this is a Text object's own size, not a
    // shape's typography-before-text or a connector's fixed label style.
    expect(ids(buildAppearanceControls(textAndCable, false)))
      .toEqual(['color', 'size', 'font', 'lineShape'])
  })

  it('orders the connector controls the way the arrow itself reads', () => {
    // FigJam's connector menu, captured from the running app, is
    // `Change color | Line style | Add text | Start point | Line shape | End
    // point`: where the arrow leaves, how it travels, where it lands. Any
    // control whose label is `Line shape` must sit between the two ends.
    // ("Add text" has no style to hold a value, so it is not part of this
    // model — `AppearanceControls` renders it directly.)
    const order = ids(buildAppearanceControls(CONNECTOR, true))
    const controls = buildAppearanceControls(CONNECTOR, true)
    const shape = controls.findIndex((control) => control.label === 'Line shape')
    expect(order.indexOf('arrowheadStart')).toBeLessThan(shape)
    expect(shape).toBeLessThan(order.indexOf('arrowheadEnd'))
  })

  it('offers a cable all three of FigJam line shapes, in the canonical vocabulary', () => {
    // FigJam shows `Elbowed Curved Straight`; a SystemSketch cable is the one
    // connector that can hold all three, so it must show all three.
    const controls = buildAppearanceControls(CABLE, true)
    const shape = controls.find((control) => control.id === 'lineShape')!
    expect(shape.options.map((option) => option.label)).toEqual([
      'Elbowed', 'Curved', 'Straight',
    ])
    // The cable's own `elbow` routing reads straight into the shared value.
    expect(shape.value).toEqual({ type: 'shared', value: 'elbow' })
  })

  it('offers an arrow the same elbowed, curved, and straight vocabulary', () => {
    const shape = buildAppearanceControls(CONNECTOR, true, 'curve')
      .find((control) => control.id === 'lineShape')!
    expect(shape.options.map((option) => option.label)).toEqual([
      'Elbowed', 'Curved', 'Straight',
    ])
    expect(shape.value).toEqual({ type: 'shared', value: 'curve' })
  })

  it('collapses every selected connector kind into ONE Line shape control', () => {
    // An arrow, a stock line and a cable are three StyleProps for one user
    // concept. Selected together they must produce one control — three
    // near-identical "Line shape" dropdowns in one pill was the reported bug.
    const everyKind = styleMap([
      [DefaultColorStyle, shared('black')],
      [ArrowShapeKindStyle, shared('arc')],
      [LineShapeSplineStyle, shared('cubic')],
      [ConnectionRoutingStyle, shared('curved')],
    ])
    const controls = buildAppearanceControls(everyKind, true, 'curve')
    expect(controls.filter((control) => control.label === 'Line shape')).toHaveLength(1)
    // All three read `curve` through their own vocabularies, so the one
    // control reports the agreement rather than three private spellings.
    expect(controls.find((control) => control.id === 'lineShape')!.value)
      .toEqual({ type: 'shared', value: 'curve' })
  })

  it('reads a disagreeing Line shape as mixed, never as one kind\'s value', () => {
    const disagreeing = styleMap([
      [DefaultColorStyle, shared('black')],
      [ArrowShapeKindStyle, shared('arc')],
      [ConnectionRoutingStyle, shared('elbow')],
    ])
    const control = buildAppearanceControls(disagreeing, true, 'straight')
      .find((candidate) => candidate.id === 'lineShape')!
    expect(control.value).toEqual({ type: 'mixed' })
  })

  it('takes the arrow routing from the caller, since the kind style cannot say', () => {
    // Stock tldraw stores Straight and Curved both as `kind: 'arc'` — only
    // per-shape `bend` separates them — so without the caller's per-shape
    // reading the model must claim nothing rather than guess.
    const uninformed = buildAppearanceControls(CONNECTOR, true)
      .find((control) => control.id === 'lineShape')!
    expect(uninformed.value).toEqual({ type: 'mixed' })
    const informed = buildAppearanceControls(CONNECTOR, true, 'straight')
      .find((control) => control.id === 'lineShape')!
    expect(informed.value).toEqual({ type: 'shared', value: 'straight' })
  })

  it('never offers a control the selection cannot accept', () => {
    // A bare connector has no fill and no geo, so neither may appear.
    const controls = buildAppearanceControls(CONNECTOR, true)
    expect(controls.some((control) => control.id === 'geo')).toBe(false)
    expect(controls.find((control) => control.id === 'color')?.modeControl).toBeUndefined()
  })

  it('stacks fill above the palette the way FigJam does, rather than beside it', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'color')!
    expect(color.modeControl?.style).toBe(DefaultFillStyle)
    expect(color.modePlacement).toBe('above')
    // Four fills, not tldraw's six (`fill` and `lined-fill` are migrated
    // legacy values `fillPaint.ts` still repaints, never offered here): most
    // opaque first, `pattern` beside its Solid sibling, most transparent last.
    expect(color.modeControl?.options.map((option) => option.label)).toEqual([
      'Solid', 'Hatched', 'Transparent', 'No fill',
    ])
  })

  it('gives the palette its 22nd cell, and reads a custom colour as Custom rather than mixed', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'color')!
    expect(color.custom).toBe(true)
    expect(color.options).toHaveLength(21)

    const custom = buildAppearanceControls(styleMap([[DefaultColorStyle, shared('custom-a3f2c1')]]), true)[0]
    expect(selectedOption(custom)).toEqual({ value: 'custom-a3f2c1', label: 'Custom' })
    expect(triggerLabel(custom)).toBe('Color, custom')
    // A name that is not a custom colour is still nothing.
    const stranger = buildAppearanceControls(styleMap([[DefaultColorStyle, shared('chartreuse')]]), true)[0]
    expect(selectedOption(stranger)).toBeUndefined()
  })

  it('offers every value the style accepts, so the menu can show any document state', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT, true)
    const byId = Object.fromEntries(controls.map((control) => [control.id, control]))
    // `draw` (Excalidraw-parity "Hand-drawn") is back, leading the vocabulary
    // — `seedDefaultLineStyle` is what keeps a freshly drawn shape off it by
    // default regardless. `async` is ours rather than tldraw's.
    expect(byId.strokeColor.modeControl?.options.map((option) => option.value))
      .toEqual(['draw', 'solid', 'dashed', 'dotted', 'async', 'none'])
    expect(byId.color.modeControl?.options.map((option) => option.value))
      .toEqual(['solid', 'pattern', 'semi', 'none'])
    expect(byId.size.options.map((option) => option.value)).toEqual(['s', 'm', 'l', 'xl'])
    expect(byId.font.options.map((option) => option.value)).toEqual(['sans', 'serif', 'mono', 'draw'])
    expect(byId.color.options.map((option) => option.value)).toEqual([...APPEARANCE_COLORS])
  })

  it('fills the edge controls in from the selection, style fallbacks and all', () => {
    // The model only ever sees tldraw's shared style map, so the edge values
    // arrive from `AppearanceControls`, which is the only place that can read
    // shape metadata. Until they do, the control shows the stock style the
    // edge follows — never a blank palette.
    const stroke = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'strokeColor')!
    expect(stroke.value).toEqual({ type: 'shared', value: 'blue' })
    expect(stroke.modeControl?.value).toEqual({ type: 'shared', value: 'solid' })

    const filled = withEdgeValues(stroke, { color: 'black', pattern: 'async', width: 'thin' })
    expect(filled.value).toEqual({ type: 'shared', value: 'black' })
    expect(filled.modeControl?.value).toEqual({ type: 'shared', value: 'async' })
    expect(selectedOption(filled)).toEqual({ value: 'black', label: 'black' })
    expect(selectedOption(filled.modeControl!)).toEqual({ value: 'async', label: 'Async' })

    const disagreeing = withEdgeValues(stroke, { color: EDGE_MIXED, pattern: null, width: EDGE_MIXED })
    expect(disagreeing.value).toEqual({ type: 'mixed' })
    // A control the selection has nothing to say about keeps its fallback.
    expect(disagreeing.modeControl?.value).toEqual({ type: 'shared', value: 'solid' })
  })

  it('names a stored value the menu no longer offers, rather than calling it mixed', () => {
    // `lined-fill` is one of the two legacy fill values `fillPaint.ts` still
    // migrates real boards through (see `fillPaint.test.ts`) — genuinely
    // absent from FILL_OPTIONS even after `pattern` joined it as "Hatched".
    // A single shape with one definite value is not mixed: the pill says what
    // the shape is; the panel stays honest that nothing in it is chosen.
    const legacy = styleMap([
      [GeoShapeGeoStyle, shared('rectangle')],
      [DefaultColorStyle, shared('blue')],
      [DefaultFillStyle, shared('lined-fill')],
      [DefaultDashStyle, shared('draw')],
    ])
    const controls = buildAppearanceControls(legacy, false)
    const fill = controls.find((c) => c.id === 'color')!.modeControl!
    expect(selectedOption(fill)).toBeUndefined()
    expect(unofferedValue(fill)).toBe('lined-fill')
    expect(triggerLabel(fill)).toBe('Fill, lined-fill')

    // Every stock dash value (including `draw`) is offered now — there is no
    // real leftover value left to stand in for "the menu no longer offers
    // this", so the mechanism is exercised with a value tldraw itself never
    // stores (a stand-in for whatever a future stock addition might be).
    const chips = controls.find((c) => c.id === 'strokeColor')!.modeControl!
    expect(unofferedValue(chips)).toBeUndefined()
    const chipsWithUnknown = withEdgeValues(chips, { color: null, pattern: 'wobbly', width: null })
    expect(unofferedValue(chipsWithUnknown)).toBe('wobbly')
  })

  it('names typefaces the way FigJam does, so the reference app transfers', () => {
    const font = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'font')!
    expect(font.options.map((option) => option.label))
      .toEqual(['Simple', 'Bookish', 'Technical', 'Scribbled'])
  })

  it('reports the applied option, and nothing when the selection disagrees', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT, true)
    const color = controls.find((c) => c.id === 'color')!
    expect(selectedOption(color)?.label).toBe('blue')

    const mixedControls = buildAppearanceControls(styleMap([[DefaultColorStyle, mixed]]), true)
    expect(selectedOption(mixedControls[0])).toBeUndefined()
  })

  it('labels the trigger with its value, and says mixed when there is none', () => {
    const controls = buildAppearanceControls(SHAPE_WITH_TEXT, true)
    expect(triggerLabel(controls.find((c) => c.id === 'geo')!)).toBe('Shape, rectangle')
    expect(triggerLabel(controls.find((c) => c.id === 'size')!)).toBe('Font size, medium')

    const mixedColor = buildAppearanceControls(styleMap([[DefaultColorStyle, mixed]]), true)[0]
    expect(triggerLabel(mixedColor)).toBe('Color, mixed')
  })

  it('lays the palette out as FigJam does: eleven hues over their light twins', () => {
    const color = buildAppearanceControls(SHAPE_WITH_TEXT, true).find((c) => c.id === 'color')!
    expect(color.layout).toBe('swatches')
    expect(color.columns).toBe(11)
    expect(APPEARANCE_COLORS).toHaveLength(21)
    // Each light twin sits directly under its hue, one full row down.
    for (const hue of ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink']) {
      const names: readonly string[] = APPEARANCE_COLORS
      expect(names.indexOf(`light-${hue}`)).toBe(names.indexOf(hue) + 11)
    }
  })

  it('presents each stored colour token without changing its characters', () => {
    expect(colorLabel('dark-gray')).toBe('dark-gray')
    expect(colorLabel('light-teal')).toBe('light-teal')
  })
})
