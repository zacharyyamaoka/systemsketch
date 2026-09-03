/**
 * Keep an enclosing block's effect port under the cable that leaves it.
 *
 * Draw a cable off a mutating call inside an expanded `run()` and route it out
 * of the frame; `run()`'s own effect port slides to the crossing. Nobody
 * positions it — the port's existence comes from the signature and its position
 * from the drawing, which is the whole point of it being derived.
 *
 * Batched on operation-complete, the way `keepConnectionsAtBottom` is: a drag
 * changes a route many times, and one settle per operation is enough. Written
 * with `history: 'ignore'` so following a cable never becomes its own undo
 * step — undoing the drag must put the port back, not peel it off one frame at
 * a time.
 *
 * The rule itself is `effectPortFollow`, which is pure and knows nothing about
 * the editor; this is only the wiring that finds the frame and the cable.
 */

import type { Editor, TLShapeId } from 'tldraw'

import {
	isEffectPort,
	isExpandedBlockShape,
	setEffectPortEdgeT,
} from '../blockModel'
import type { BlockShape } from '../blockModel'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { connectionSourcePort } from './effectCable'
import { effectPortFollow } from './effectPortFollow'
import { getConnectionRenderPoints, type ConnectionShape } from './ConnectionShapeUtil'

const isConnection = (shape: { type: string } | undefined): shape is ConnectionShape =>
	shape?.type === CONNECTION_SHAPE_TYPE

/** The nearest expanded Block above this shape, if any. */
function enclosingFrame(editor: Editor, shapeId: TLShapeId): BlockShape | null {
	const ancestors = editor.getShapeAncestors(shapeId)
	for (let index = ancestors.length - 1; index >= 0; index -= 1) {
		const ancestor = ancestors[index]
		if (isExpandedBlockShape(ancestor)) return ancestor
	}
	return null
}

export function installEffectPortFollow(editor: Editor) {
	let pending = new Set<TLShapeId>()

	const note = (shape: { id: TLShapeId; type: string }, source: string) => {
		if (source === 'remote') return
		if (isConnection(shape)) pending.add(shape.id)
	}

	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) =>
		note(shape, source))
	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (_before, after, source) =>
		note(after, source))

	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
		if (pending.size === 0) return
		const touched = pending
		pending = new Set()

		const moves: Array<{ frame: BlockShape; portId: string; edgeT: number }> = []
		for (const id of touched) {
			const connection = editor.getShape(id)
			if (!isConnection(connection)) continue
			const port = connectionSourcePort(editor, connection)
			// Only a cable that carries a mutation outward has anything to steer.
			if (!port || !isEffectPort(port)) continue
			const frame = enclosingFrame(editor, connection.id)
			if (!frame) continue
			const bounds = editor.getShapePageBounds(frame.id)
			if (!bounds) continue
			const transform = editor.getShapePageTransform(connection)
			if (!transform) continue
			const points = getConnectionRenderPoints(editor, connection)
				.map((point) => transform.applyToPoint(point))
			const move = effectPortFollow({
				points,
				frame: { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height },
				carries: port.name,
				outerPorts: frame.props.outputs,
			})
			if (move) moves.push({ frame, portId: move.portId, edgeT: move.edgeT })
		}
		if (moves.length === 0) return

		editor.run(() => {
			for (const move of moves) {
				const current = editor.getShape(move.frame.id)
				if (!current || current.type !== move.frame.type) continue
				const next = setEffectPortEdgeT(
					(current as BlockShape).props,
					move.portId,
					move.edgeT,
				)
				if (next === (current as BlockShape).props) continue
				editor.updateShape({ id: move.frame.id, type: move.frame.type, props: next })
			}
		}, { history: 'ignore' })
	})

	return () => {
		stopCreate()
		stopChange()
		stopComplete()
	}
}
