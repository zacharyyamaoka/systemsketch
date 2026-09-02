import type { Editor, TLShapeId } from 'tldraw'

import { CONNECTION_SHAPE_TYPE, PILL_POSITION_DEFAULT, type ConnectionRoutingKind } from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'

export type ConnectionRoutingResult =
  | { ok: true; shapeId: TLShapeId; routing: ConnectionRoutingKind }
  | { ok: false; reason: 'missing-connection' | 'unchanged' }

/** One semantic routing command shared by every present and future gesture. */
export function setConnectionRouting(
  editor: Editor,
  shapeId: TLShapeId,
  routing: ConnectionRoutingKind,
): ConnectionRoutingResult {
  const shape = editor.getShape(shapeId)
  if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) {
    return { ok: false, reason: 'missing-connection' }
  }
  const connection = shape as ConnectionShape
  if (connection.props.routing === routing) return { ok: false, reason: 'unchanged' }

  editor.markHistoryStoppingPoint(`use ${routing} connection routing`)
  editor.updateShape<ConnectionShape>({
    id: connection.id,
    type: connection.type,
    props: { routing },
  })
  return { ok: true, shapeId: connection.id, routing }
}

/** Name (or clear) the initial value a delayed cable shows in its z⁻¹ pill. */
export function setConnectionDelayValue(
  editor: Editor,
  shapeId: TLShapeId,
  delayValue: string,
): boolean {
  const shape = editor.getShape(shapeId)
  if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return false
  const connection = shape as ConnectionShape
  const next = delayValue.trim()
  if (connection.props.delayValue === next) return false
  editor.markHistoryStoppingPoint(next ? 'name the initial value' : 'clear the initial value')
  editor.updateShape<ConnectionShape>({ id: connection.id, type: connection.type, props: { delayValue: next } })
  return true
}

/** Put the z⁻¹ pill back at the middle of the cable. */
export function centreConnectionPill(editor: Editor, shapeId: TLShapeId): boolean {
  const shape = editor.getShape(shapeId)
  if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return false
  const connection = shape as ConnectionShape
  if (connection.props.pillPosition === PILL_POSITION_DEFAULT) return false
  editor.markHistoryStoppingPoint('centre the z⁻¹ pill')
  editor.updateShape<ConnectionShape>({
    id: connection.id,
    type: connection.type,
    props: { pillPosition: PILL_POSITION_DEFAULT },
  })
  return true
}
