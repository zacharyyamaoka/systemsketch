/**
 * The faint line that says which argument an effect port belongs to.
 *
 * A Block with one mutated argument needs no explanation: there is one hook on
 * the left and one port on the top. With two or three, the ports are bare dots
 * on the top edge and nothing on the board says which is which — the model
 * knows (an effect port's id is derived from its input's), but the layout gives
 * top-edge ports no label, so the correspondence is invisible.
 *
 * So it is drawn, once, geometrically: out of the hook, into the gap under its
 * own row, across, and up the port's column. An elbow rather than a curve
 * because every cable in this app is elbow-routed — the tether is not a new
 * convention, only a quieter use of the existing one — and because three curves
 * bow into each other while three elbows do not.
 *
 * Two things it is deliberately not:
 *
 *  - **Interactive.** It takes no pointer events, so it can never swallow a
 *    click meant for the block, a port, a label or a cable. It is a paint pass.
 *  - **Present in every view.** Port view only. The expanded body is full of
 *    real blocks and real cables, and a dashed line threading through them
 *    would read as wiring; Simple view has no rows to correspond to.
 *
 * Tethers may cross. The effect port's position is not ours to choose — it
 * follows wherever its cable leaves the block — so once one is dragged past
 * another, their tethers cross. That is the honest picture and it is left
 * alone: the crossing is the board saying the ports no longer read in the
 * order their arguments do.
 *
 * Pure: no React, no tldraw, no DOM.
 */

import { isEffectPort, mutatedInputId } from './blockModel'
import type { BlockLayout, LaidOutBlockPort } from './layoutBlock'

export interface EffectTether {
	/** The effect port this tether explains. */
	portId: string
	/** The input it writes back to. */
	inputId: string
	/** SVG path data in Block-local coordinates. */
	d: string
}

/** How far the tether steps clear of the hook before it turns down. */
export const TETHER_STEP_PX = 10
/** How far below the row's centre the crossing lane sits. */
export const TETHER_LANE_PX = 13
/** The smallest gap worth dropping into; below this the tether stays on the row. */
const MIN_LANE_PX = 6

function laneFor(pitch: number): number {
	// Half a row, less the dot, so the lane lands in the space under the label
	// rather than on the next row's text. A cramped layout falls back to the
	// row itself rather than drawing into its neighbour.
	const half = pitch / 2 - 5
	if (half < MIN_LANE_PX) return 0
	return Math.min(TETHER_LANE_PX, half)
}

/**
 * One tether per effect port, or none when the view is not the one that shows
 * them. Ports whose input is missing (a half-reconciled document) are skipped
 * rather than drawn to nowhere.
 */
export function effectTethers(layout: BlockLayout): EffectTether[] {
	if (layout.view !== 'port') return []
	const inputs = new Map<string, LaidOutBlockPort>()
	for (const placed of layout.ports) {
		if (placed.side === 'input') inputs.set(placed.port.id, placed)
	}
	const tethers: EffectTether[] = []
	for (const placed of layout.ports) {
		if (placed.edge !== 'top' || !isEffectPort(placed.port)) continue
		const inputId = mutatedInputId(placed.port)
		if (!inputId) continue
		const source = inputs.get(inputId)
		if (!source) continue
		tethers.push({
			portId: placed.port.id,
			inputId,
			d: tetherPath(source.x, source.y, placed.x, placed.y, laneFor(layout.pitch)),
		})
	}
	return tethers
}

/**
 * Hook → gap under the row → port's column → port.
 *
 * The step away from the hook keeps the first corner off the dot, and the lane
 * keeps the long horizontal off the name and the type — running it along the
 * row's own baseline strikes through both, which is what made the first attempt
 * at this look like clutter rather than a cue.
 */
export function tetherPath(
	inputX: number,
	inputY: number,
	portX: number,
	portY: number,
	lane: number,
): string {
	const step = inputX + TETHER_STEP_PX
	if (lane <= 0) {
		// No room under the row: one corner, along the row and up.
		return `M${inputX},${inputY} L${portX},${inputY} L${portX},${portY}`
	}
	const laneY = inputY + lane
	return `M${inputX},${inputY} L${step},${inputY} L${step},${laneY} L${portX},${laneY} L${portX},${portY}`
}
