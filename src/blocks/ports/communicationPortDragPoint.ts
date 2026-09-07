/**
 * Where a held communication port is RIGHT NOW, in page space.
 *
 * A leaf beside the drag state for the same reason `portLens` is one: the
 * connection layer has to ask this question, and the state node reaches back
 * into commands that reach into `blocks/connections`. Importing the state node
 * from `blockPorts.ts` would close that ring. This file depends on tldraw, the
 * Block model, and the layout only.
 */
import { Vec, type Editor, type TLShapeId } from 'tldraw'

import { isBlockShape } from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import { getCommunicationPortDrag } from './communicationPortDrag'

export function communicationPortDragPagePoint(
	editor: Editor,
	shapeId: TLShapeId,
	portId: string,
): Vec | null {
	const drag = getCommunicationPortDrag(editor)
	if (!drag || drag.shapeId !== shapeId || drag.portId !== portId) return null
	const shape = editor.getShape(shapeId)
	if (!isBlockShape(shape)) return null
	const lane = shape.props[drag.side]
	const port = lane.find((candidate) => candidate.id === portId)
	if (!port) return null
	// The same one-port layout pass the dot's own preview runs, so the cable
	// cannot disagree with the dot about where the port is mid-flight.
	const preview = layoutBlock(
		{
			...shape.props,
			[drag.side]: lane.map((candidate) => (
				candidate.id === portId
					? { ...candidate, commEdge: drag.edge, commEdgeT: drag.edgeT }
					: candidate
			)),
		},
		{ lens: 'communication' },
	).ports.find((placed) => placed.port.id === portId)
	if (!preview) return null
	const transform = editor.getShapePageTransform(shapeId)
	if (!transform) return null
	return transform.applyToPoint(new Vec(preview.x, preview.y))
}
