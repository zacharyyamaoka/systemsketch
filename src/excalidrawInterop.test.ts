import { describe, expect, it } from 'vitest'
import type { TLGeoShape, TLShape } from 'tldraw'
import {
  EXCALIDRAW_ROUNDED_RECT_GEO,
  EXCALIDRAW_ROUNDNESS_META_KEY,
  createExcalidrawGeoShapeTransformer,
  getExcalidrawCornerRadius,
  getExcalidrawRoundedRectPath,
  parseExcalidrawRoundness,
} from './excalidrawInterop'

function fakeShape(type: string, geo = 'rectangle'): TLShape {
  return {
    typeName: 'shape',
    type,
    props: type === 'geo' ? { geo } : {},
    meta: {},
  } as unknown as TLShape
}

describe('Excalidraw roundness', () => {
  it('accepts only valid clipboard roundness values', () => {
    expect(parseExcalidrawRoundness({ type: 3 })).toEqual({ type: 3 })
    expect(parseExcalidrawRoundness({ type: 3, value: 18 })).toEqual({ type: 3, value: 18 })
    expect(parseExcalidrawRoundness(null)).toBeNull()
    expect(parseExcalidrawRoundness({ type: 4 })).toBeNull()
    expect(parseExcalidrawRoundness({ type: 3, value: -1 })).toBeNull()
    expect(parseExcalidrawRoundness({ type: 3, value: Number.NaN })).toBeNull()
  })

  it('matches Excalidraw proportional and adaptive corner-radius rules', () => {
    expect(getExcalidrawCornerRadius(200, 80, { type: 1 })).toBe(20)
    expect(getExcalidrawCornerRadius(200, 80, { type: 2 })).toBe(20)
    expect(getExcalidrawCornerRadius(400, 200, { type: 3 })).toBe(32)
    expect(getExcalidrawCornerRadius(80, 40, { type: 3 })).toBe(10)
    expect(getExcalidrawCornerRadius(400, 200, { type: 3, value: 14 })).toBe(14)
  })

  it('builds a closed path with four curved corners', () => {
    const roundedRect = getExcalidrawRoundedRectPath(200, 80, 20)
    const path = roundedRect.toD()

    expect(path).toMatch(/^M 20 0/)
    expect(path.match(/C/g)).toHaveLength(4)
    expect(roundedRect.toGeometry().isClosed).toBe(true)
  })
})

describe('Excalidraw paste shape transformation', () => {
  it('preserves source geo order across a mixed paste', () => {
    const transform = createExcalidrawGeoShapeTransformer({
      elements: [
        { id: 'rounded-a', type: 'rectangle', roundness: { type: 3, value: 18 } },
        { id: 'arrow', type: 'arrow', roundness: { type: 2 } },
        { id: 'ellipse', type: 'ellipse', roundness: { type: 2 } },
        { id: 'sharp', type: 'rectangle', roundness: null },
        { id: 'line', type: 'line', roundness: { type: 2 } },
        { id: 'diamond', type: 'diamond', roundness: { type: 2 } },
        { id: 'rounded-b', type: 'rectangle', roundness: { type: 2 } },
      ],
    })

    const roundedA = transform(fakeShape('geo')) as TLGeoShape
    expect(roundedA.props.geo).toBe(EXCALIDRAW_ROUNDED_RECT_GEO)
    expect(roundedA.meta[EXCALIDRAW_ROUNDNESS_META_KEY]).toEqual({ type: 3, value: 18 })

    expect(transform(fakeShape('arrow')).type).toBe('arrow')
    expect((transform(fakeShape('geo', 'ellipse')) as TLGeoShape).props.geo).toBe('ellipse')
    expect((transform(fakeShape('geo')) as TLGeoShape).props.geo).toBe('rectangle')
    expect(transform(fakeShape('group')).type).toBe('group')
    expect((transform(fakeShape('geo', 'diamond')) as TLGeoShape).props.geo).toBe('diamond')

    const roundedB = transform(fakeShape('geo')) as TLGeoShape
    expect(roundedB.props.geo).toBe(EXCALIDRAW_ROUNDED_RECT_GEO)
    expect(roundedB.meta[EXCALIDRAW_ROUNDNESS_META_KEY]).toEqual({ type: 2 })
  })

  it('leaves malformed clipboard content and non-geo shapes unchanged', () => {
    const transform = createExcalidrawGeoShapeTransformer({ elements: 'not-an-array' })
    const shape = fakeShape('arrow')

    expect(transform(shape)).toBe(shape)
    expect((transform(fakeShape('geo')) as TLGeoShape).props.geo).toBe('rectangle')
  })
})
