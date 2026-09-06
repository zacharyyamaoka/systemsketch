/**
 * Measure what a drag actually costs, in pixels, by driving the REAL
 * resolution pipeline — the number behind Zach's orientation-sensitivity
 * complaint (2026-09-06 recordings: one swap took ~68 page px on a `right`
 * tree and 150–370 px per gesture on a `down` tree, same document, same
 * spacing).
 *
 * `measureSwapTravel` emulates one drag session exactly the way the live
 * lane does: one `DragListContext` (so the hysteresis deadband's
 * path-dependence is real), the dragged member's base-layout rect swept
 * along the cross axis in 1px steps. Capture travel is the first offset at
 * which resolution commits a different tree; release-back travel is how far
 * back past that point the pointer must return before the original order is
 * restored — the felt "stickiness" of the deadband. Shared verbatim by the
 * Drag Model Tuner's readout table and the sensitivity regression test, so
 * the numbers Zach tunes against are the numbers the tests pin.
 */
import { parseBehaviorTreeXml, selectTree } from './btcppXml'
import {
	buildDragListContext,
	resolveDragListDrop,
	type DragListOptions,
} from './dragListReorder'
import { layoutTree } from './treeLayout'
import { type BtRect } from './behaviorTreeModel'

export interface SwapTravelMeasurement {
	/** Pixels of cross-axis travel until the first committed reorder, or null if none within range. */
	capturePx: number | null
	/** Pixels of travel BACK past the capture point until the original order returns, or null. */
	releaseBackPx: number | null
	/** The dragged member's own cross-axis extent — the term the deadband scales with. */
	crossExtentPx: number
	/** The container's median inner gap — the deadband's other term. */
	gapPx: number
}

export interface SwapTravelProbe {
	xml: string
	treeId: string
	/** The member to drag, in the xml's own numbering. */
	path: string
	options: DragListOptions
	/** +1 sweeps toward the next sibling, -1 toward the previous. */
	direction?: 1 | -1
	maxTravelPx?: number
}

export function measureSwapTravel(probe: SwapTravelProbe): SwapTravelMeasurement {
	const direction = probe.direction ?? 1
	const maxTravel = probe.maxTravelPx ?? 800
	const down = probe.options.orientation === 'down'
	const tree = selectTree(parseBehaviorTreeXml(probe.xml), probe.treeId)
	if (!tree?.root) return { capturePx: null, releaseBackPx: null, crossExtentPx: 0, gapPx: 0 }
	const baseScene = layoutTree(tree, {
		orientation: probe.options.orientation,
		nodeFace: probe.options.nodeFace,
		controlFace: probe.options.controlFace,
		edgeStyle: 'straight',
		spacing: probe.options.spacing,
		nodeViewOverrides: probe.options.nodeViewOverrides,
	})
	const entry = baseScene.nodes.find((candidate) => candidate.path === probe.path)
	const ctx = buildDragListContext(probe.xml, probe.treeId, probe.path, probe.options)
	if (!entry || !ctx) return { capturePx: null, releaseBackPx: null, crossExtentPx: 0, gapPx: 0 }
	const rest = entry.rect
	const crossExtentPx = down ? rest.w : rest.h
	const container = ctx.containersByParent.get(ctx.draggedParentPath)
	const gapPx = container?.container.gap ?? 0

	const rectAt = (offset: number): BtRect =>
		down
			? { x: rest.x + offset * direction, y: rest.y, w: rest.w, h: rest.h }
			: { x: rest.x, y: rest.y + offset * direction, w: rest.w, h: rest.h }

	let capturePx: number | null = null
	for (let offset = 0; offset <= maxTravel; offset += 1) {
		const result = resolveDragListDrop(ctx, rectAt(offset))
		if (result.ok && result.xml !== probe.xml) {
			capturePx = offset
			break
		}
	}
	if (capturePx === null) return { capturePx, releaseBackPx: null, crossExtentPx, gapPx }

	let releaseBackPx: number | null = null
	for (let offset = capturePx; offset >= capturePx - maxTravel; offset -= 1) {
		const result = resolveDragListDrop(ctx, rectAt(offset))
		if (result.ok && result.xml === probe.xml) {
			releaseBackPx = capturePx - offset
			break
		}
	}
	return { capturePx, releaseBackPx, crossExtentPx, gapPx }
}
