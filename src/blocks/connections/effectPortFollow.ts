/**
 * An outer effect port follows the cable that leaves the block.
 *
 * Inside an expanded `run()`, a call like `poses.append()` mutates an argument
 * and grows its own effect port. The cable off that port has to get out of
 * `run()` — and `run()` mutates `poses` too, because it handed its own argument
 * to a call that writes it. So `run()` has an effect port of its own, and the
 * only sensible place for it is **wherever that cable actually crosses the
 * frame**. Nobody should have to position it: drag the cable and the port goes
 * with it.
 *
 * That is the whole rule. The geometry is
 * `src/blocks/elbow/boundaryCrossing.ts`, which knows nothing about mutations —
 * this file is only the policy that decides *which* port moves and *when*.
 *
 * Two decisions worth stating:
 *
 *  - **Matched by name, not by position.** An effect port carries the name of
 *    the argument it writes back to, and propagation outward carries that same
 *    object under that same name (`outer.poses → run.poses → add_pose.poses`).
 *    So the inner cable moves the outer port with the same name. Position would
 *    be a guess; the name is the fact.
 *  - **Only when the cable leaves by the top.** The whiteboard may route a cable
 *    out of any edge, and doing so does not drag the port around to that edge —
 *    the port lives on the top. A cable routed elsewhere simply stops steering
 *    it, and `effectExitLint` is what reports that.
 *
 * Pure: no editor, no tldraw. The caller supplies geometry already in the
 * frame's own coordinates.
 */

import { clampEdgeT, isEffectPort } from '../blockModel'
import type { BlockPort } from '../blockModel'
import { firstExit } from '../elbow'
import type { ElbowPoint, ElbowRect } from '../elbow'

export interface EffectPortMove {
	/** The port on the enclosing block that should move. */
	portId: string
	/** Where along its top edge, 0 at the left corner and 1 at the right. */
	edgeT: number
}

export interface FollowInput {
	/** The routed cable, in the enclosing frame's coordinate space. */
	points: readonly ElbowPoint[]
	/** The enclosing frame's box, same space. */
	frame: ElbowRect
	/** The name of the argument the cable carries out. */
	carries: string
	/** The enclosing block's own ports. */
	outerPorts: readonly BlockPort[]
}

/**
 * Where the enclosing block's effect port belongs, given the cable that left
 * it — or null when nothing should move.
 */
export function effectPortFollow(input: FollowInput): EffectPortMove | null {
	const { points, frame, carries, outerPorts } = input
	if (frame.w <= 0 || points.length < 2) return null
	const target = outerPorts.find((port) => isEffectPort(port) && port.name === carries)
	if (!target) return null
	const exit = firstExit(points, frame)
	if (!exit || exit.side !== 'top') return null
	const edgeT = clampEdgeT((exit.point.x - frame.x) / frame.w)
	// A port already where the cable puts it must not be rewritten: this runs on
	// every route change, and an update that changes nothing is still an undo
	// entry and a re-render.
	const current = target.edgeT
	if (current !== undefined && Math.abs(current - edgeT) < 0.001) return null
	return { portId: target.id, edgeT }
}
