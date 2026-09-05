/**
 * The Process view: Intrinsic Flowstate's grammar for the same tree.
 *
 *   Sequence   — nodes stacked along the flow, joined by thin arrows;
 *                a *named* Sequence is a titled group frame
 *   Parallel   — a double fork bar, one lane per child, a double join bar
 *   Fallback   — the first child stays on the rail; each later child is a
 *                recovery lane reached through a "Failure" chip, and every
 *                lane merges back onto the rail below; AlwaysFailure at the
 *                end of a lane is the bold "Fail" terminal
 *   Decorator  — its child, with a chip on the incoming wire
 *   IfThenElse — condition and then-branch on the rail, else as recovery
 *
 * The layout is a recursive box model in abstract (flow, cross) coordinates
 * mapped to the canvas at the end, so top-to-bottom and left-to-right are the
 * same code. Every metric below was read off the Flowstate frames relative to
 * a card's height; the numbers are named so a future tune touches one place.
 */
import type { BtNode, BtTree } from './btcppXml'
import {
	BT_START_H,
	BT_START_W,
	btDecoratorLabel,
	btNodeSize,
	emptyScene,
	sceneExtent,
	translateScene,
	type BtControlFace,
	type BtNodeFace,
	type BtOrientation,
	type BtPoint,
	type BtRect,
	type BtScene,
	type BtSceneEdge,
} from './behaviorTreeModel'

export interface ProcessLayoutOptions {
	orientation: BtOrientation
	nodeFace: BtNodeFace
	controlFace: BtControlFace
	offsets?: Record<string, { dx: number; dy: number }>
}

/** Flow gap between two stacked nodes: Flowstate leaves ~0.55 card heights. */
export const PROCESS_NODE_GAP = 60
/** Cross gap between parallel lanes. */
export const PROCESS_LANE_GAP = 96
/** Cross gap from a node to its recovery lane; the "Failure" chip lives here. */
export const PROCESS_RECOVERY_GAP = 150
/** Flow gap from a fork bar to the first node of a lane, and from a lane's last node to the join bar. */
export const PROCESS_BAR_GAP = 56
/** Flow gap from a group header band to its first node. */
export const PROCESS_GROUP_HEADER_H = 48
export const PROCESS_GROUP_PAD = 44
export const PROCESS_GROUP_GAP = 72
/** The merge line under a fallback's lanes sits this far below the lowest lane. */
export const PROCESS_MERGE_GAP = 40
export const PROCESS_CHIP_W = 104
export const PROCESS_CHIP_H = 34
export const PROCESS_FAIL_W = 120
export const PROCESS_FAIL_H = 56
export const PROCESS_START_GAP = 64
export const PROCESS_DECORATOR_GAP = 44
export const PROCESS_END_GAP = 56

interface Abstract { f: number; c: number }

interface Placed {
	entry: Abstract
	exit: Abstract
}

interface Item {
	/** Extent along the flow. */
	flow: number
	/** Extent across the flow. */
	cross: number
	/** Cross offset of the rail (where wires enter and leave) inside [0, cross]. */
	rail: number
	place(origin: Abstract): Placed
}

interface Emitter {
	scene: BtScene
	toCanvas(point: Abstract): BtPoint
	rectToCanvas(origin: Abstract, flow: number, cross: number): BtRect
	options: ProcessLayoutOptions
	down: boolean
	/** +1 puts recovery lanes on the +cross side (right, top-to-bottom); -1 above the rail (left-to-right). */
	recoverySign: 1 | -1
}

export function layoutProcess(tree: BtTree, options: ProcessLayoutOptions): BtScene {
	const scene = emptyScene()
	const down = options.orientation === 'down'
	const emitter: Emitter = {
		scene,
		options,
		down,
		recoverySign: down ? 1 : -1,
		toCanvas: (point) => (down ? { x: point.c, y: point.f } : { x: point.f, y: point.c }),
		rectToCanvas: (origin, flow, cross) => (down
			? { x: origin.c, y: origin.f, w: cross, h: flow }
			: { x: origin.f, y: origin.c, w: flow, h: cross }),
	}

	const startSize = down ? { flow: BT_START_H, cross: BT_START_W } : { flow: BT_START_W, cross: BT_START_H }
	if (!tree.root) {
		scene.start = emitter.rectToCanvas({ f: 0, c: 0 }, startSize.flow, startSize.cross)
		const at = emitter.toCanvas({ f: startSize.flow + PROCESS_START_GAP, c: startSize.cross / 2 })
		scene.edges.push({ id: 'start→root', kind: 'control', points: [emitter.toCanvas({ f: startSize.flow, c: startSize.cross / 2 }), at], arrowEnd: false })
		scene.inserts.push({ id: 'root', at, parentPath: null, index: 0, kind: 'root', persistent: true })
		scene.bounds = sceneExtent(scene)
		return scene
	}

	const item = buildItem(tree.root, emitter, true)
	const railCross = Math.max(item.rail, startSize.cross / 2)
	scene.start = emitter.rectToCanvas({ f: 0, c: railCross - startSize.cross / 2 }, startSize.flow, startSize.cross)
	const startExit: Abstract = { f: startSize.flow, c: railCross }
	const placed = item.place({ f: startSize.flow + PROCESS_START_GAP, c: railCross - item.rail })
	scene.edges.push({ id: 'start→root', kind: 'control', points: [emitter.toCanvas(startExit), emitter.toCanvas(placed.entry)], arrowEnd: true, to: tree.root.path })
	// Flowstate ends the process with a small "+" square on the rail.
	const endAt: Abstract = { f: placed.exit.f + PROCESS_END_GAP, c: placed.exit.c }
	scene.edges.push({ id: 'root→end', kind: 'control', points: [emitter.toCanvas(placed.exit), emitter.toCanvas({ f: endAt.f - 14, c: endAt.c })], arrowEnd: false })
	scene.inserts.push({
		id: 'end',
		at: emitter.toCanvas(endAt),
		parentPath: tree.root.children.length > 0 && tree.root.controlKind === 'sequence' ? tree.root.path : null,
		index: tree.root.children.length,
		kind: 'end',
		persistent: true,
	})

	applyOffsets(scene, options.offsets)
	scene.bounds = sceneExtent(scene)
	return translateScene(scene, -scene.bounds.x, -scene.bounds.y)
}

function applyOffsets(scene: BtScene, offsets: ProcessLayoutOptions['offsets']) {
	if (!offsets) return
	for (const entry of scene.nodes) {
		const offset = offsets[entry.path]
		if (!offset) continue
		entry.rect = { ...entry.rect, x: entry.rect.x + offset.dx, y: entry.rect.y + offset.dy }
	}
}

function nodeExtents(node: BtNode, emitter: Emitter): { flow: number; cross: number } {
	const size = btNodeSize(node, { nodeFace: emitter.options.nodeFace, controlFace: emitter.options.controlFace })
	return emitter.down ? { flow: size.h, cross: size.w } : { flow: size.w, cross: size.h }
}

function isSequenceLike(node: BtNode): boolean {
	return node.controlKind === 'sequence' || (node.controlKind === 'other') || node.controlKind === 'switch'
}

function isFail(node: BtNode): boolean {
	return node.id === 'AlwaysFailure'
}

function buildItem(node: BtNode, emitter: Emitter, isRoot = false): Item {
	if (node.kind === 'decorator') return decoratorItem(node, emitter)
	if (node.kind === 'control' || (node.kind === 'unknown' && node.children.length > 0)) {
		if (node.children.length === 0) return emptyControlItem(node, emitter)
		switch (node.controlKind) {
			case 'parallel': return parallelItem(node, emitter)
			case 'fallback': return fallbackItem(node, emitter)
			case 'branch': return branchItem(node, emitter)
			default:
				return node.name && !isRoot ? groupItem(node, emitter) : sequenceItem(node, emitter)
		}
	}
	return leafItem(node, emitter)
}

/* ---------------------------------- leaf ----------------------------------- */

function leafItem(node: BtNode, emitter: Emitter): Item {
	if (isFail(node)) return failItem(node, emitter)
	const extents = nodeExtents(node, emitter)
	return {
		flow: extents.flow,
		cross: extents.cross,
		rail: extents.cross / 2,
		place(origin) {
			emitter.scene.nodes.push({ path: node.path, node, rect: emitter.rectToCanvas(origin, extents.flow, extents.cross), role: 'leaf' })
			return {
				entry: { f: origin.f, c: origin.c + extents.cross / 2 },
				exit: { f: origin.f + extents.flow, c: origin.c + extents.cross / 2 },
			}
		},
	}
}

/** Flowstate's bold "Fail" terminal. Semantically an AlwaysFailure leaf. */
function failItem(node: BtNode, emitter: Emitter): Item {
	const flow = emitter.down ? PROCESS_FAIL_H : PROCESS_FAIL_W
	const cross = emitter.down ? PROCESS_FAIL_W : PROCESS_FAIL_H
	return {
		flow,
		cross,
		rail: cross / 2,
		place(origin) {
			emitter.scene.chips.push({ id: `fail:${node.path}`, rect: emitter.rectToCanvas(origin, flow, cross), text: node.name || 'Fail', kind: 'fail', path: node.path })
			return {
				entry: { f: origin.f, c: origin.c + cross / 2 },
				exit: { f: origin.f + flow, c: origin.c + cross / 2 },
			}
		},
	}
}

/* -------------------------------- sequence --------------------------------- */

function stack(items: Item[]): { flow: number; cross: number; rail: number; offsets: Abstract[] } {
	const railLeft = Math.max(...items.map((item) => item.rail))
	const railRight = Math.max(...items.map((item) => item.cross - item.rail))
	let flow = 0
	const offsets: Abstract[] = []
	items.forEach((item, index) => {
		if (index > 0) flow += PROCESS_NODE_GAP
		offsets.push({ f: flow, c: railLeft - item.rail })
		flow += item.flow
	})
	return { flow, cross: railLeft + railRight, rail: railLeft, offsets }
}

function connect(emitter: Emitter, id: string, from: Abstract, to: Abstract, toPath: string | undefined, kind: BtSceneEdge['kind'] = 'control') {
	emitter.scene.edges.push({ id, kind, points: [emitter.toCanvas(from), emitter.toCanvas(to)], arrowEnd: true, to: toPath })
}

function sequenceItem(node: BtNode, emitter: Emitter): Item {
	const items = node.children.map((child) => buildItem(child, emitter))
	const laid = stack(items)
	return {
		flow: laid.flow,
		cross: laid.cross,
		rail: laid.rail,
		place(origin) {
			let entry: Abstract | null = null
			let previous: Placed | null = null
			items.forEach((item, index) => {
				const offset = laid.offsets[index]
				const placed = item.place({ f: origin.f + offset.f, c: origin.c + offset.c })
				if (previous) {
					connect(emitter, `${node.path}:${index - 1}→${index}`, previous.exit, placed.entry, node.children[index].path)
					emitter.scene.inserts.push({
						id: `between:${node.path}:${index}`,
						at: emitter.toCanvas({ f: (previous.exit.f + placed.entry.f) / 2, c: placed.entry.c }),
						parentPath: node.path,
						index,
						kind: 'between',
						persistent: false,
					})
				}
				entry ??= placed.entry
				previous = placed
			})
			return { entry: entry!, exit: previous!.exit }
		},
	}
}

/** A named Sequence: Flowstate's titled group frame with a header band. */
function groupItem(node: BtNode, emitter: Emitter): Item {
	const inner = sequenceItem(node, emitter)
	const headerFlow = emitter.down ? PROCESS_GROUP_HEADER_H : 0
	const headerCross = emitter.down ? 0 : PROCESS_GROUP_HEADER_H
	const flow = headerFlow + PROCESS_GROUP_PAD + inner.flow + PROCESS_GROUP_PAD
	const cross = headerCross + PROCESS_GROUP_PAD + inner.cross + PROCESS_GROUP_PAD
	const rail = headerCross + PROCESS_GROUP_PAD + inner.rail
	return {
		flow,
		cross,
		rail,
		place(origin) {
			const rect = emitter.rectToCanvas(origin, flow, cross)
			emitter.scene.groups.push({ path: node.path, rect, title: node.name })
			const placed = inner.place({ f: origin.f + headerFlow + PROCESS_GROUP_PAD, c: origin.c + headerCross + PROCESS_GROUP_PAD })
			// The wire crosses the frame: in at the header, out at the far edge.
			const entry: Abstract = { f: origin.f + headerFlow, c: origin.c + rail }
			const exit: Abstract = { f: origin.f + flow, c: origin.c + rail }
			connect(emitter, `${node.path}:in`, entry, placed.entry, node.children[0]?.path)
			emitter.scene.edges.push({ id: `${node.path}:out`, kind: 'control', points: [emitter.toCanvas(placed.exit), emitter.toCanvas(exit)], arrowEnd: false })
			return { entry: { f: origin.f, c: origin.c + rail }, exit }
		},
	}
}

function emptyControlItem(node: BtNode, emitter: Emitter): Item {
	const flow = 28
	const cross = 28
	return {
		flow,
		cross,
		rail: cross / 2,
		place(origin) {
			const at = emitter.toCanvas({ f: origin.f + flow / 2, c: origin.c + cross / 2 })
			emitter.scene.inserts.push({ id: `empty:${node.path}`, at, parentPath: node.path, index: 0, kind: 'empty', persistent: true })
			// The name sits just past the "+" along the flow, so the two never overprint.
			emitter.scene.chips.push({
				id: `label:${node.path}`,
				rect: chipRect(emitter.toCanvas({ f: origin.f + flow / 2 + (emitter.down ? 44 : 96), c: origin.c + cross / 2 }), PROCESS_CHIP_W + 20, PROCESS_CHIP_H),
				text: node.name || node.id,
				kind: 'label',
				path: node.path,
			})
			return { entry: { f: origin.f, c: origin.c + cross / 2 }, exit: { f: origin.f + flow, c: origin.c + cross / 2 } }
		},
	}
}

/* -------------------------------- parallel --------------------------------- */

function parallelItem(node: BtNode, emitter: Emitter): Item {
	const lanes = node.children.map((child) => buildItem(child, emitter))
	let cross = 0
	const laneOffsets: number[] = []
	lanes.forEach((lane, index) => {
		if (index > 0) cross += PROCESS_LANE_GAP
		laneOffsets.push(cross)
		cross += lane.cross
	})
	const laneFlow = Math.max(...lanes.map((lane) => lane.flow))
	const flow = PROCESS_BAR_GAP + laneFlow + PROCESS_BAR_GAP
	const firstRail = laneOffsets[0] + lanes[0].rail
	const lastRail = laneOffsets[lanes.length - 1] + lanes[lanes.length - 1].rail
	const rail = (firstRail + lastRail) / 2
	return {
		flow,
		cross,
		rail,
		place(origin) {
			const forkF = origin.f
			const joinF = origin.f + flow
			emitter.scene.rails.push({
				id: `fork:${node.path}`,
				from: emitter.toCanvas({ f: forkF, c: origin.c + firstRail }),
				to: emitter.toCanvas({ f: forkF, c: origin.c + lastRail }),
				kind: 'fork',
			})
			emitter.scene.rails.push({
				id: `join:${node.path}`,
				from: emitter.toCanvas({ f: joinF, c: origin.c + firstRail }),
				to: emitter.toCanvas({ f: joinF, c: origin.c + lastRail }),
				kind: 'join',
			})
			lanes.forEach((lane, index) => {
				const placed = lane.place({ f: forkF + PROCESS_BAR_GAP, c: origin.c + laneOffsets[index] })
				connect(emitter, `${node.path}:fork→${index}`, { f: forkF, c: placed.entry.c }, placed.entry, node.children[index].path)
				connect(emitter, `${node.path}:${index}→join`, placed.exit, { f: joinF, c: placed.exit.c }, undefined)
			})
			emitter.scene.inserts.push({
				id: `lane:${node.path}`,
				at: emitter.toCanvas({ f: forkF, c: origin.c + lastRail + PROCESS_LANE_GAP / 2 }),
				parentPath: node.path,
				index: node.children.length,
				kind: 'child',
				persistent: false,
			})
			return { entry: { f: forkF, c: origin.c + rail }, exit: { f: joinF, c: origin.c + rail } }
		},
	}
}

/* -------------------------------- fallback --------------------------------- */

/**
 * children[0] stays on the rail; children[1..] are recovery lanes on the
 * recovery side, each entered through a "Failure" chip from the lane before
 * it, and all lanes merge back onto the rail below the deepest one.
 */
function fallbackItem(node: BtNode, emitter: Emitter): Item {
	const primary = buildItem(node.children[0], emitter)
	const recoveries = node.children.slice(1).map((child) => buildItem(child, emitter))
	return lanesWithRecovery(node, emitter, primary, recoveries, 0)
}

/** IfThenElse / WhileDoElse: condition and then-branch on the rail, else as recovery. */
function branchItem(node: BtNode, emitter: Emitter): Item {
	const onRail = node.children.slice(0, 2)
	const primary = onRail.length === 1 ? buildItem(onRail[0], emitter) : stackedItem(node, onRail.map((child) => buildItem(child, emitter)), emitter)
	const recoveries = node.children.slice(2).map((child) => buildItem(child, emitter))
	return lanesWithRecovery(node, emitter, primary, recoveries, 0)
}

function stackedItem(node: BtNode, items: Item[], emitter: Emitter): Item {
	const laid = stack(items)
	return {
		flow: laid.flow,
		cross: laid.cross,
		rail: laid.rail,
		place(origin) {
			let entry: Abstract | null = null
			let previous: Placed | null = null
			items.forEach((item, index) => {
				const placed = item.place({ f: origin.f + laid.offsets[index].f, c: origin.c + laid.offsets[index].c })
				if (previous) connect(emitter, `${node.path}:rail:${index}`, previous.exit, placed.entry, node.children[index].path)
				entry ??= placed.entry
				previous = placed
			})
			return { entry: entry!, exit: previous!.exit }
		},
	}
}

function lanesWithRecovery(node: BtNode, emitter: Emitter, primary: Item, recoveries: Item[], firstRecoveryIndex: number): Item {
	const sign = emitter.recoverySign
	// Recovery lane i starts one chip-width beyond the lane before it.
	const laneCross: number[] = []
	let recoveryExtent = 0
	recoveries.forEach((lane) => {
		laneCross.push(recoveryExtent)
		recoveryExtent += PROCESS_RECOVERY_GAP + lane.cross
	})
	const recoveryFlowShift = (index: number) => primary.rail * 0 + index * 0 // lanes share the primary's entry flow
	void recoveryFlowShift
	// A recovery lane's first card starts half a card below the primary entry
	// (Flowstate's Failure line leaves the primary's mid-height).
	const laneStartFlow = Math.min(primary.flow / 2, 52)
	const deepest = Math.max(primary.flow, ...recoveries.map((lane) => laneStartFlow + lane.flow))
	const flow = recoveries.length > 0 ? deepest + PROCESS_MERGE_GAP : primary.flow
	const cross = primary.cross + recoveryExtent
	const rail = sign === 1 ? primary.rail : recoveryExtent + primary.rail
	const primaryCrossOffset = sign === 1 ? 0 : recoveryExtent
	return {
		flow,
		cross,
		rail,
		place(origin) {
			const placedPrimary = primary.place({ f: origin.f, c: origin.c + primaryCrossOffset })
			let previousExit: Abstract = { f: origin.f + laneStartFlow, c: sign === 1 ? origin.c + primaryCrossOffset + primary.cross : origin.c + primaryCrossOffset }
			let previousPath = node.children[firstRecoveryIndex]?.path
			const mergeF = origin.f + flow
			const railC = origin.c + rail
			const mergePoints: Abstract[] = []
			recoveries.forEach((lane, index) => {
				const laneOriginC = sign === 1
					? origin.c + primaryCrossOffset + primary.cross + PROCESS_RECOVERY_GAP + laneCross[index]
					: origin.c + recoveryExtent - laneCross[index] - PROCESS_RECOVERY_GAP - lane.cross
				const placed = lane.place({ f: origin.f + laneStartFlow, c: laneOriginC })
				// Failure: from the previous lane's side, across the gap, into the new lane's entry.
				const chipMid: Abstract = { f: previousExit.f, c: (previousExit.c + (sign === 1 ? laneOriginC : laneOriginC + lane.cross)) / 2 }
				const laneSide: Abstract = { f: previousExit.f, c: sign === 1 ? laneOriginC : laneOriginC + lane.cross }
				const childPath = node.children[firstRecoveryIndex + 1 + index].path
				emitter.scene.edges.push({
					id: `${node.path}:failure:${index}`,
					kind: 'recovery',
					points: [emitter.toCanvas(previousExit), emitter.toCanvas(laneSide)],
					arrowEnd: true,
					from: previousPath,
					to: childPath,
				})
				emitter.scene.chips.push({
					id: `failure:${node.path}:${index}`,
					rect: chipRect(emitter.toCanvas(chipMid), PROCESS_CHIP_W, PROCESS_CHIP_H),
					text: 'Failure',
					kind: 'failure',
					path: childPath,
				})
				void placed.entry
				// The lane's exit drops to the merge line and returns to the rail.
				mergePoints.push(placed.exit)
				previousExit = { f: origin.f + laneStartFlow + Math.min(lane.flow / 2, 52), c: sign === 1 ? laneOriginC + lane.cross : laneOriginC }
				previousPath = childPath
			})
			if (recoveries.length > 0) {
				// One merge polyline per lane: down to the merge flow, across to the rail.
				mergePoints.forEach((exit, index) => {
					emitter.scene.edges.push({
						id: `${node.path}:merge:${index}`,
						kind: 'merge',
						points: [emitter.toCanvas(exit), emitter.toCanvas({ f: mergeF, c: exit.c }), emitter.toCanvas({ f: mergeF, c: railC })],
						arrowEnd: false,
					})
				})
				emitter.scene.edges.push({
					id: `${node.path}:merge:rail`,
					kind: 'merge',
					points: [emitter.toCanvas(placedPrimary.exit), emitter.toCanvas({ f: mergeF, c: railC })],
					arrowEnd: false,
				})
				emitter.scene.inserts.push({
					id: `recovery:${node.path}`,
					at: emitter.toCanvas({ f: origin.f + laneStartFlow, c: sign === 1 ? origin.c + cross + PROCESS_RECOVERY_GAP / 2 : origin.c - PROCESS_RECOVERY_GAP / 2 }),
					parentPath: node.path,
					index: node.children.length,
					kind: 'child',
					persistent: false,
				})
				return { entry: placedPrimary.entry, exit: { f: mergeF, c: railC } }
			}
			return placedPrimary
		},
	}
}

/* -------------------------------- decorator -------------------------------- */

function decoratorItem(node: BtNode, emitter: Emitter): Item {
	const child = node.children[0]
	const inner = child ? buildItem(child, emitter) : emptyControlItem(node, emitter)
	const chipFlow = PROCESS_DECORATOR_GAP + PROCESS_CHIP_H
	return {
		flow: chipFlow + inner.flow,
		cross: inner.cross,
		rail: inner.rail,
		place(origin) {
			const placed = inner.place({ f: origin.f + chipFlow, c: origin.c })
			const chipCenter: Abstract = { f: origin.f + PROCESS_CHIP_H / 2, c: origin.c + inner.rail }
			const label = btDecoratorLabel(node)
			emitter.scene.chips.push({
				id: `decorator:${node.path}`,
				rect: chipRect(emitter.toCanvas(chipCenter), Math.max(PROCESS_CHIP_W, 24 + label.length * 9), PROCESS_CHIP_H),
				text: label,
				kind: 'decorator',
				path: node.path,
			})
			connect(emitter, `${node.path}:chip→child`, { f: origin.f + PROCESS_CHIP_H, c: origin.c + inner.rail }, placed.entry, child?.path)
			return { entry: { f: origin.f, c: origin.c + inner.rail }, exit: placed.exit }
		},
	}
}

function chipRect(center: BtPoint, w: number, h: number): BtRect {
	return { x: center.x - w / 2, y: center.y - h / 2, w, h }
}
