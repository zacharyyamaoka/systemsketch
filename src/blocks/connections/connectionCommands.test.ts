import type { Editor, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'
import { setConnectionRouting } from './connectionCommands'

function connection(): ConnectionShape {
  return {
    id: 'shape:connection' as TLShapeId,
    typeName: 'shape',
    type: CONNECTION_SHAPE_TYPE,
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as ConnectionShape['index'],
    parentId: 'page:page' as ConnectionShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      routing: 'curved',
      curve: null,
      pins: [],
      elbowRoute: null,
	  routeMode: 'automatic',
      temporal: 'data',
      delayValue: '',
      pillPosition: 0.5,
    },
  }
}

describe('connection commands', () => {
  it('switches routing through one undo boundary', () => {
    let shape = connection()
    const history: string[] = []
    const editor = {
      getShape: (id: TLShapeId) => id === shape.id ? shape : undefined,
      markHistoryStoppingPoint: (label: string) => history.push(label),
      updateShape: (partial: { props: Partial<ConnectionShape['props']> }) => {
        shape = { ...shape, props: { ...shape.props, ...partial.props } }
      },
    } as unknown as Editor

    expect(setConnectionRouting(editor, shape.id, 'straight')).toEqual({
      ok: true,
      shapeId: shape.id,
      routing: 'straight',
    })
    expect(shape.props.routing).toBe('straight')
    expect(history).toEqual(['use straight connection routing'])
    expect(setConnectionRouting(editor, shape.id, 'straight')).toEqual({
      ok: false,
      reason: 'unchanged',
    })
    expect(history).toHaveLength(1)
  })
})
