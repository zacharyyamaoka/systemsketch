/**
 * The Connection kind's registration with the generic detach sweep.
 *
 * Cables are the edge phase: they lower while both endpoint shapes still
 * stand, so the stock arrow can bind to live geometry. A cable touching a
 * participating Block is not lowered here at all — the planner defers it to
 * the Block, whose own lowering keeps the rebuild promise.
 */
import type { Editor, TLShape } from 'tldraw'

import type { DetachableKind, LoweredEdge } from '../../detach/detachableKind'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'
import {
	connectionEndpointIds,
	detachConnectionToArrow,
	detachedEdgeGroupId,
} from './detachConnection'

export const connectionDetachable: DetachableKind = {
	kind: 'connection',
	role: 'edge',
	matches: (shape: TLShape) => shape.type === CONNECTION_SHAPE_TYPE,
	edgeEndpointIds: (editor: Editor, shape: TLShape) =>
		connectionEndpointIds(editor, shape as ConnectionShape),
	lowerEdge: (editor: Editor, shape: TLShape): LoweredEdge | null => {
		const arrowId = detachConnectionToArrow(editor, shape as ConnectionShape)
		if (arrowId === null) return null
		return {
			arrowId,
			rootId: detachedEdgeGroupId(editor, arrowId) ?? arrowId,
		}
	},
}
