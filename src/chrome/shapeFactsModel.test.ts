import { describe, expect, it } from 'vitest'
import {
  DefaultColorStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  type Editor,
  type SharedStyle,
  type StyleProp,
  type TLShape,
  type TLShapeId,
} from 'tldraw'

import { getShapeFactsModel, shapeFactsKey } from './shapeFactsModel'

function shape(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  overrides: Partial<TLShape> = {},
): TLShape {
  return {
    id: `shape:${id}` as TLShapeId,
    typeName: 'shape',
    type,
    parentId: 'page:main',
    index: 'a1',
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props,
    ...overrides,
  } as unknown as TLShape
}

interface Bounds { x: number; y: number; w: number; h: number }

function editor({
  shapes,
  bounds,
  selectionBounds,
  styles = new Map(),
}: {
  shapes: TLShape[]
  bounds?: Record<string, Bounds>
  selectionBounds?: Bounds
  styles?: Map<StyleProp<unknown>, SharedStyle<unknown>>
}): Editor {
  return {
    getSelectedShapes: () => shapes,
    getShapePageBounds: (target: TLShape) => bounds?.[target.id] ?? null,
    getSelectionPageBounds: () => selectionBounds ?? null,
    getSharedStyles: () => ({
      get: (style: StyleProp<unknown>) => styles.get(style),
    }),
  } as unknown as Editor
}

describe('getShapeFactsModel', () => {
  it('reports nothing when nothing is selected', () => {
    expect(getShapeFactsModel(editor({ shapes: [] }))).toBeNull()
    expect(shapeFactsKey(null)).toBeNull()
  })

  it('names a geo shape by its geo prop rather than its record type', () => {
    const rectangle = shape('r', 'geo', { geo: 'rectangle' })
    const model = getShapeFactsModel(editor({
      shapes: [rectangle],
      bounds: { [rectangle.id]: { x: 120.4, y: 40.6, w: 200, h: 100 } },
    }))
    expect(model?.title).toBe('Rectangle')
    expect(model?.shapeId).toBe(rectangle.id)
  })

  it('rounds position and size into board units', () => {
    const arrow = shape('a', 'arrow')
    const model = getShapeFactsModel(editor({
      shapes: [arrow],
      bounds: { [arrow.id]: { x: 120.4, y: 40.6, w: 200.2, h: 99.5 } },
    }))
    expect(model?.geometry).toEqual([
      { label: 'Position', value: '120, 41' },
      { label: 'Size', value: '200 × 100' },
    ])
  })

  it('reports rotation in degrees, and only when the shape is rotated', () => {
    const straight = shape('s', 'geo', { geo: 'ellipse' })
    expect(getShapeFactsModel(editor({ shapes: [straight] }))?.geometry).toEqual([])

    const turned = shape('t', 'geo', { geo: 'ellipse' }, { rotation: Math.PI / 2 })
    const model = getShapeFactsModel(editor({ shapes: [turned] }))
    expect(model?.geometry).toEqual([{ label: 'Rotation', value: '90°' }])
  })

  it('pluralises one kind and falls back to "shapes" for a mixed set', () => {
    const twoRectangles = [shape('a', 'geo', { geo: 'rectangle' }), shape('b', 'geo', { geo: 'rectangle' })]
    expect(getShapeFactsModel(editor({
      shapes: twoRectangles,
      selectionBounds: { x: 0, y: 0, w: 400, h: 120 },
    }))?.title).toBe('2 rectangles')

    expect(getShapeFactsModel(editor({
      shapes: [shape('a', 'geo', { geo: 'rectangle' }), shape('b', 'arrow')],
    }))?.title).toBe('2 shapes')
  })

  it('gives a multi-selection its combined bounds instead of a position', () => {
    const model = getShapeFactsModel(editor({
      shapes: [shape('a', 'arrow'), shape('b', 'arrow')],
      selectionBounds: { x: 10, y: 10, w: 380.7, h: 120 },
    }))
    expect(model?.geometry).toEqual([{ label: 'Bounds', value: '381 × 120' }])
    expect(model?.shapeId).toBeNull()
  })

  it('reads shared stock styles and says Mixed where the selection disagrees', () => {
    const styles = new Map<StyleProp<unknown>, SharedStyle<unknown>>([
      [DefaultColorStyle, { type: 'shared', value: 'light-blue' }],
      [DefaultFillStyle, { type: 'mixed' }],
    ])
    const model = getShapeFactsModel(editor({ shapes: [shape('a', 'geo', { geo: 'rectangle' })], styles }))
    expect(model?.styles).toEqual([
      { label: 'Colour', value: 'Light blue' },
      { label: 'Fill', value: 'Mixed' },
    ])
  })

  it('omits a style the selection does not carry at all', () => {
    const styles = new Map<StyleProp<unknown>, SharedStyle<unknown>>([
      [DefaultSizeStyle, { type: 'shared', value: 'm' }],
    ])
    const model = getShapeFactsModel(editor({ shapes: [shape('a', 'arrow')], styles }))
    expect(model?.styles.map((fact) => fact.label)).toEqual(['Size'])
  })

  it('names locked and faded state, and only when it applies', () => {
    const plain = getShapeFactsModel(editor({ shapes: [shape('a', 'arrow')] }))
    expect(plain?.flags).toEqual([])
    expect(plain?.locked).toBe(false)

    const locked = getShapeFactsModel(editor({
      shapes: [shape('a', 'arrow', {}, { isLocked: true, opacity: 0.5 })],
    }))
    expect(locked?.locked).toBe(true)
    expect(locked?.flags).toEqual([
      { label: 'Locked', value: 'Editing is blocked' },
      { label: 'Opacity', value: '50%' },
    ])
  })

  it('does not claim the whole selection is locked when only one shape is', () => {
    const model = getShapeFactsModel(editor({
      shapes: [shape('a', 'arrow', {}, { isLocked: true }), shape('b', 'arrow')],
    }))
    expect(model?.locked).toBe(false)
    expect(model?.flags).toEqual([])
  })

  it('reports mixed opacity rather than one shape s value', () => {
    const model = getShapeFactsModel(editor({
      shapes: [shape('a', 'arrow', {}, { opacity: 0.25 }), shape('b', 'arrow')],
    }))
    expect(model?.flags).toEqual([{ label: 'Opacity', value: 'Mixed' }])
  })
})

describe('shapeFactsKey', () => {
  it('is stable while a drag changes nothing the panel shows', () => {
    const arrow = shape('a', 'arrow')
    const reading = () => getShapeFactsModel(editor({ shapes: [arrow] }))
    expect(shapeFactsKey(reading())).toBe(shapeFactsKey(reading()))
  })

  it('changes when a displayed fact changes', () => {
    const arrow = shape('a', 'arrow')
    const before = shapeFactsKey(getShapeFactsModel(editor({
      shapes: [arrow],
      bounds: { [arrow.id]: { x: 0, y: 0, w: 100, h: 100 } },
    })))
    const after = shapeFactsKey(getShapeFactsModel(editor({
      shapes: [arrow],
      bounds: { [arrow.id]: { x: 0, y: 0, w: 140, h: 100 } },
    })))
    expect(before).not.toBe(after)
  })
})
