import { describe, expect, it } from 'vitest'
import type { Editor, TLGeoShape, TLShape, TLShapeId } from 'tldraw'

import {
  CALLOUT_META_KEY,
  calloutCardIdForLeader,
  isCalloutCard,
  isCalloutLeader,
  nearestCardFaceAnchor,
} from './calloutModel'

const CARD_ID = 'shape:card' as TLShapeId

function card(): TLGeoShape {
  return {
    id: CARD_ID,
    typeName: 'shape',
    type: 'geo',
    parentId: 'page:one',
    index: 'a1',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    isLocked: false,
    props: {},
    meta: { [CALLOUT_META_KEY]: { version: 1, role: 'card' } },
  } as unknown as TLGeoShape
}

const faceEditor = {
  getShapeGeometry: () => ({ bounds: { x: 0, y: 0, w: 240, h: 80 } }),
  getPointInShapeSpace: (_shape: TLShape, point: { x: number; y: number }) => point,
} as unknown as Editor

describe('Callout stock-record contract', () => {
  it('recognizes the semantic relationship without creating a custom shape type', () => {
    const leader = {
      ...card(),
      id: 'shape:leader' as TLShapeId,
      type: 'arrow',
      meta: { [CALLOUT_META_KEY]: { version: 1, role: 'leader', cardId: CARD_ID } },
    } as unknown as TLShape

    expect(isCalloutCard(card())).toBe(true)
    expect(isCalloutLeader(leader)).toBe(true)
    expect(calloutCardIdForLeader(leader)).toBe(CARD_ID)
    expect(calloutCardIdForLeader(card())).toBeNull()
  })

  it('uses the nearest cardinal card face in every orientation', () => {
    const subject = card()
    expect(nearestCardFaceAnchor(faceEditor, subject, { x: -60, y: 40 })).toEqual({ x: 0, y: 0.5 })
    expect(nearestCardFaceAnchor(faceEditor, subject, { x: 300, y: 40 })).toEqual({ x: 1, y: 0.5 })
    expect(nearestCardFaceAnchor(faceEditor, subject, { x: 120, y: -60 })).toEqual({ x: 0.5, y: 0 })
    expect(nearestCardFaceAnchor(faceEditor, subject, { x: 120, y: 140 })).toEqual({ x: 0.5, y: 1 })
  })
})
