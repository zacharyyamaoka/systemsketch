import type { Editor, TLShapeId } from 'tldraw'

import { CONNECTION_SHAPE_TYPE, type ConnectionRoutingKind } from './connectionModel'
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
