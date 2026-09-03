/**
 * A cable that leaves an effect port is not an ordinary data cable.
 *
 * `list.append(self, object, /) -> None` has no return channel, so a call that
 * writes its argument in place gives the new value no name and no right-hand
 * port to leave by. The only way it reaches a consumer is the mutation itself,
 * which makes such a cable *load-bearing*: erase it and the consumer downstream
 * has no input at all. It should not be drawn the same as a return.
 *
 * Nothing is persisted for this. The fact lives on the source port — an effect
 * port is the one that says it — so the cable derives its appearance rather
 * than carrying a second copy that could drift out of step with the block.
 */

import type { Editor } from 'tldraw'

import { clampEdgeT, isBlockShape, isEffectPort } from '../blockModel'
import type { BlockPort } from '../blockModel'
import { firstExit } from '../elbow'
import type { ElbowPoint, ElbowRect } from '../elbow'
import { getConnectionBindings } from './ConnectionBindingUtil'
import type { ConnectionShape } from './ConnectionShapeUtil'

/**
 * Warm and heavy, deliberately not the near-black that control cables own.
 * `--ss-warning` is the palette's existing cautionary register, which is exactly
 * the register an effect wants — the call is about to change your object — and
 * reusing it keeps every theme working without a new token to define four times.
 */
export const EFFECT_CABLE_INK = 'var(--ss-warning)'
export const EFFECT_CABLE_WIDTH = 2.6
export const EFFECT_PILL_LABEL = 'mut'

/** The port a connection's start terminal is bound to, if it is bound at all. */
export function connectionSourcePort(editor: Editor, connection: ConnectionShape): BlockPort | null {
	const bindings = getConnectionBindings(editor, connection)
	const start = bindings.start
	if (!start) return null
	const shape = editor.getShape(start.toId)
	if (!isBlockShape(shape)) return null
	const portId = start.props.portId
	return shape.props.outputs.find((port) => port.id === portId)
		?? shape.props.inputs.find((port) => port.id === portId)
		?? null
}

/** Whether this cable carries a value that only exists because of a mutation. */
export function isEffectCable(editor: Editor, connection: ConnectionShape): boolean {
	const port = connectionSourcePort(editor, connection)
	return port !== null && isEffectPort(port)
}

/**
 * Where an effect port belongs, given the cable someone actually drew.
 *
 * The port has no slot: its existence comes from the signature and its position
 * from the route. `boundaryCrossing` answers the geometry for any container, so
 * this is only the policy — take the first place the cable leaves the block, and
 * use it when that place is the top edge. A cable routed out of another edge is
 * not an error (the whiteboard may do as it likes), it simply does not move the
 * port, and `effectExitLint` is what reports it.
 */
export function effectPortEdgeTFromRoute(
	points: readonly ElbowPoint[],
	box: ElbowRect,
): number | null {
	const exit = firstExit(points, box)
	if (!exit || exit.side !== 'top' || box.w <= 0) return null
	return clampEdgeT(exit.point.x / box.w)
}

export interface EffectExitDefect {
	connectionId: string
	side: 'left' | 'right' | 'bottom' | 'none'
}

/**
 * Zach's rule (2026-09-03): the linter prefers an effect leaving the top edge,
 * because left is values in, right is named values out and the bottom is the
 * loop lane. A preference, never a rewrite — it reports and stops.
 */
export function effectExitLint(
	cables: ReadonlyArray<{ connectionId: string; points: readonly ElbowPoint[]; box: ElbowRect }>,
): EffectExitDefect[] {
	const defects: EffectExitDefect[] = []
	for (const cable of cables) {
		const exit = firstExit(cable.points, cable.box)
		if (!exit) {
			defects.push({ connectionId: cable.connectionId, side: 'none' })
			continue
		}
		if (exit.side !== 'top') {
			defects.push({ connectionId: cable.connectionId, side: exit.side })
		}
	}
	return defects
}
