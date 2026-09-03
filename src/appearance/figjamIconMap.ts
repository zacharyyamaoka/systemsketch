/**
 * Which FigJam icon stands for which tldraw style value.
 *
 * The two vocabularies are not the same size — tldraw has nine arrowheads to
 * FigJam's six, four sizes to its two — so this map is deliberately partial.
 * A value FigJam has an icon for gets FigJam's icon; anything else falls back
 * to the drawn glyph, which is the honest outcome: inventing a FigJam-looking
 * icon for a state FigJam does not have would be worse than not matching.
 */
import type { AppearanceControlId } from './appearanceModel'

type ValueToIcon = Readonly<Record<string, string>>

const ARROWHEADS: ValueToIcon = {
  none: 'arrowhead/None',
  arrow: 'arrowhead/Line arrow',
  triangle: 'arrowhead/Solid arrow',
  dot: 'arrowhead/Circle',
  diamond: 'arrowhead/Diamond',
  inverted: 'arrowhead/Triangle',
  // tldraw's `square`, `pipe` and `bar` have no FigJam counterpart.
}

const DASH: ValueToIcon = {
  solid: 'line-style/Solid',
  dashed: 'line-style/Dashed',
  // tldraw's `draw` and `dotted` are its own; `none` is FigJam's No-line icon.
  none: 'line-style/None',
}

/**
 * The icons a trigger shows regardless of its value. FigJam's Line style
 * trigger is three bars — a line, then two outlined bars — on both a shape and
 * a connector; its Typeface trigger is `Aa`. Both are read off the pill itself.
 */
export const FIGJAM_TRIGGER_ICON: Partial<Record<AppearanceControlId, string>> = {
  dash: 'trigger/Line style',
  lineStyle: 'trigger/Line style',
  font: 'trigger/Typeface',
}

/** FigJam's menu check, beside the chosen row of Typeface and Font size. */
export const FIGJAM_CHECK_ICON = 'menu/Check'

/** FigJam's eyedropper, in the picker behind Custom. */
export const FIGJAM_EYEDROPPER_ICON = 'picker/Eyedropper'

/** All three line-shape styles share FigJam's three icons. */
const LINE_SHAPE: ValueToIcon = {
  elbow: 'line-shape/Elbowed',
  curved: 'line-shape/Curved',
  curve: 'line-shape/Curved',
  arc: 'line-shape/Curved',
  cubic: 'line-shape/Curved',
  straight: 'line-shape/Straight',
  line: 'line-shape/Straight',
}

export const FIGJAM_ICON_FOR: Partial<Record<AppearanceControlId, ValueToIcon>> = {
  arrowheadStart: ARROWHEADS,
  arrowheadEnd: ARROWHEADS,
  connectionRouting: LINE_SHAPE,
  arrowKind: LINE_SHAPE,
  spline: LINE_SHAPE,
  dash: DASH,
  // A connector's Line style is the dash control with the weight beside it.
  lineStyle: DASH,
  fill: {
    none: 'fill/No fill',
    semi: 'fill/Transparent',
    solid: 'fill/Fill',
  },
  size: {
    // FigJam offers two weights; tldraw four. The ends match, the middle does not.
    s: 'line-style/Thin',
    xl: 'line-style/Thick',
  },
  font: {
    // FigJam names its four faces rather than the family, and they line up
    // one-for-one with tldraw's.
    sans: 'typeface/Simple',
    serif: 'typeface/Bookish',
    mono: 'typeface/Technical',
    draw: 'typeface/Cute',
  },
  align: {
    start: 'align/Text align left',
    middle: 'align/Text align center',
    end: 'align/Text align right',
  },
  geo: {
    rectangle: 'shape/Square',
    ellipse: 'shape/Ellipse',
    oval: 'shape/Ellipse',
    triangle: 'shape/Triangle',
    diamond: 'shape/Diamond',
    pentagon: 'shape/Pentagon',
    hexagon: 'shape/Hexagon',
    octagon: 'shape/Octagon',
    trapezoid: 'shape/Trapezoid',
  },
}

/** FigJam's icon name for a value, when FigJam draws that value at all. */
export function figjamIconName(
  control: AppearanceControlId,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  return FIGJAM_ICON_FOR[control]?.[value]
}
