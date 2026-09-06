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
	type BtNodeViewOverride,
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
	/**
	 * Leaves pinned to a size other than their `nodeFace` formula — an
	 * Expanded Block, or a Port-view Block whose ports the person resized by
	 * hand. Only leaves carry one; a control's size still follows
	 * `controlFace` alone. See `behaviorTreeProjection.ts`'s `leafBlockProps`.
	 */
	nodeViewOverrides?: Record<string, BtNodeViewOverride>
	/**
	 * Multiplier on `PROCESS_GAP` (the region's `spacingScale` prop). The one
	 * unit scales as one unit — every derived clearance, lane offset and "+"
	 * midpoint keeps its proportion. `PROCESS_RECOVERY_GAP` deliberately does
	 * not scale: it is content-driven (the Failure chip rides inside it), the
	 * documented exception to the unit.
	 */
	spacing?: number
}

/**
 * THE spacing unit of the Process view — one constant, both axes.
 *
 * WHY: Zach's 2026-09-05 ruling, after a day of one-off spacing patches
 * (chip-width, terminus-offset, join-centering) each fixed a symptom and
 * still left other cases wrong: "We need much more simple, reliable, robust
 * placement of all of the blue + icons." His annotated Flowstate reference
 * marks the SAME gap everywhere — node→node along the flow, branch→branch
 * across it, Start→group band, band→fork bar, bar→node, node→bar, and
 * join→terminal "+" — and he stated it directly: "the space between any
 * edge and node should match the space between nodes." So every flow-axis
 * clearance and the parallel lane gap read from this one number; a new gap
 * constant beside it is the failure mode, not a tuning knob.
 *
 * Insert markers ride the unit, all through `midInsertAt`/`terminalInsertAt`:
 *  - a "+" inside a gap sits at the gap's midpoint — PROCESS_GAP/2 from each
 *    face, so its 28px box clears every feature by 16px;
 *  - a terminal "+" (the wire ends in it) stands where the next node's entry
 *    face would be — one unit past the exit, wire touching its face;
 *  - a "+" only ever sits on a straight single-direction segment. Never on a
 *    corner, junction, or a cross-axis leg: "if you have a top-to-bottom
 *    process flow, there should only ever be a top-to-bottom line going
 *    through the plus icon ... the icon adds things that are sequential."
 */
export const PROCESS_GAP = 60
/**
 * The gap the CURRENT layout pass actually uses: `PROCESS_GAP` ×
 * `ProcessLayoutOptions.spacing`. Module-scoped rather than threaded through
 * every `Item` builder because the whole recursive box model runs
 * synchronously inside one `layoutProcess` call, which stamps this first —
 * a previous pass can never leak into the next one, and the ~18 arithmetic
 * sites keep reading one short name.
 */
let processGap = PROCESS_GAP
/**
 * Cross gap from a node to its recovery lane. Deliberately NOT the unit:
 * the "Failure" chip (PROCESS_CHIP_W wide) rides the horizontal failure
 * line inside this gap, so it is content-driven — the one exception to
 * PROCESS_GAP, kept from the Flowstate frames.
 */
export const PROCESS_RECOVERY_GAP = 150
/**
 * Extra cross-space `recoveryLoopItem` reserves beyond the recovery lane's
 * own far edge for the loop-back trunk to run through, clear of whatever a
 * parent packs beside this item (a Parallel lane neighbour, the next node in
 * a Sequence's stack). Not the unit either, for the same reason
 * PROCESS_RECOVERY_GAP isn't: it is a routing clearance, not a rhythm gap.
 */
export const PROCESS_LOOP_OUTSET = 50
/**
 * Headroom `recoveryLoopItem` reserves above the primary child. The loop-back
 * trunk must turn down into the primary's real entry somewhere, and every
 * point this layout draws has to stay at flow ≥ 0 — `stack()` only ever
 * reserves one `processGap` before an item's own `f: 0`, so anything painted
 * above that risks the previous sibling or the wire feeding this item. Living
 * inside this item's own declared `flow` extent instead keeps every
 * coordinate non-negative and gives `place()` one honest `entry` (the top of
 * the headroom) where the parent's incoming wire and the loop-back both
 * land, with an ordinary short drop carrying either into the primary's real
 * entry below it.
 */
export const PROCESS_LOOP_HEADROOM = 64
/** Height of a titled group frame's header band (a box, not a gap). */
export const PROCESS_GROUP_HEADER_H = 48
export const PROCESS_CHIP_W = 104
export const PROCESS_CHIP_H = 34
export const PROCESS_FAIL_W = 120
export const PROCESS_FAIL_H = 56
/** The blue "+" is a 28px square (`.BehaviorTree-insert`); placement math keeps every line-corner and box outside it. */
export const PROCESS_INSERT_SIZE = 28

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
	processGap = PROCESS_GAP * (options.spacing ?? 1)
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
		// The root "+" is terminal: it stands where the root node's entry face
		// will be — one unit past Start — with the wire ending at its face.
		const at = terminalInsertAt({ f: startSize.flow, c: startSize.cross / 2 })
		scene.edges.push({ id: 'start→root', kind: 'control', points: [emitter.toCanvas({ f: startSize.flow, c: startSize.cross / 2 }), emitter.toCanvas({ f: at.f - PROCESS_INSERT_SIZE / 2, c: at.c })], arrowEnd: false })
		scene.inserts.push({ id: 'root', at: emitter.toCanvas(at), parentPath: null, index: 0, kind: 'root', persistent: true })
		scene.bounds = sceneExtent(scene)
		return scene
	}

	const item = buildItem(tree.root, emitter, true)
	const railCross = Math.max(item.rail, startSize.cross / 2)
	scene.start = emitter.rectToCanvas({ f: 0, c: railCross - startSize.cross / 2 }, startSize.flow, startSize.cross)
	const startExit: Abstract = { f: startSize.flow, c: railCross }
	const placed = item.place({ f: startSize.flow + processGap, c: railCross - item.rail })
	scene.edges.push({ id: 'start→root', kind: 'control', points: [emitter.toCanvas(startExit), emitter.toCanvas(placed.entry)], arrowEnd: true, to: tree.root.path })
	// WHY: Zach's 2026-09-05 follow-up — the gap between Start and whatever is
	// currently the first real node first shipped as a persistent "+" (to
	// match the root sequence's other always-on terminus inserts), but he
	// then called that placement out as wrong: it's an interior gap like any
	// other, so it should hover-reveal like the rest rather than stay
	// permanently visible. `persistent: false` here is that correction, not a
	// new rule — see `.BehaviorTree-insertZone` in BehaviorTreeCanvas.tsx for
	// what that flag actually gates. `sequenceHeadPath` still finds the
	// insert's target generally: the root sequence's actual first step if the
	// root is already a chain, or the bare root itself (which then gets
	// wrapped in a fresh Sequence, same as any other `before: false` prepend)
	// if it is not sequence-like yet.
	scene.inserts.push({
		id: 'start',
		at: emitter.toCanvas(midInsertAt(startExit, placed.entry)),
		parentPath: tree.root.path,
		index: 0,
		beforePath: sequenceHeadPath(tree.root),
		kind: 'start',
		persistent: false,
	})
	// Flowstate ends the process with a small "+" square on the rail — a
	// terminal insert: the wire runs one unit and ends at the icon's face.
	const endAt = terminalInsertAt(placed.exit)
	scene.edges.push({ id: 'root→end', kind: 'control', points: [emitter.toCanvas(placed.exit), emitter.toCanvas({ f: endAt.f - PROCESS_INSERT_SIZE / 2, c: endAt.c })], arrowEnd: false })
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
	// An overridden leaf reports its own real box instead of the nodeFace
	// formula — the whole reason a rail, a lane or a merge line can react to
	// an Expanded Block or a hand-resized Port-view card sitting among
	// otherwise-uniform siblings.
	const override = emitter.options.nodeViewOverrides?.[node.path]
	const size = override ?? btNodeSize(node, { nodeFace: emitter.options.nodeFace, controlFace: emitter.options.controlFace })
	return emitter.down ? { flow: size.h, cross: size.w } : { flow: size.w, cross: size.h }
}

function isSequenceLike(node: BtNode): boolean {
	return node.controlKind === 'sequence' || (node.controlKind === 'other') || node.controlKind === 'switch'
}

/**
 * The node an "append after" targets to keep growing a chain in flow order:
 * walk down the last child as long as it is itself sequence-like, landing on
 * the deepest last-in-flow node. For a bare leaf (the common recovery-arm
 * case, e.g. a lone `CorrectGrip` Skill) this is the node itself; for an arm
 * already grown into a `Sequence(A, B, C)` it is `C`, so appending never
 * double-wraps an arm that has already been turned sequential once.
 */
function sequenceTerminusPath(node: BtNode): string {
	let current = node
	while (isSequenceLike(current) && current.children.length > 0) {
		current = current.children[current.children.length - 1]
	}
	return current.path
}

/**
 * The mirror of `sequenceTerminusPath`, for "insert before this node's own
 * chain": walk into the first child as long as it is itself sequence-like,
 * landing on the shallowest first-in-flow node. For a bare leaf (a fresh
 * recovery arm, or the root before it has grown) this is the node itself;
 * for a `Sequence(A, B, C)` — an arm already grown, or a real root — it is
 * `A`, so prepending lands before the chain's actual first step rather than
 * wrapping the whole chain in a redundant second Sequence.
 */
function sequenceHeadPath(node: BtNode): string {
	let current = node
	while (isSequenceLike(current) && current.children.length > 0) {
		current = current.children[0]
	}
	return current.path
}

function isFail(node: BtNode): boolean {
	return node.id === 'AlwaysFailure'
}

/**
 * A "+" hosted INSIDE a gap: the midpoint of the straight flow-axis run
 * between two features that share a cross position — two node faces, or a
 * corner and the face below it. With every gap one PROCESS_GAP unit, the
 * midpoint puts the 28px icon 16px clear of both features, and the only
 * line through the icon is the flow-direction wire itself.
 *
 * WHY: Zach rejected both earlier terminus placements on 2026-09-05 — the
 * "+" exactly on a merge junction, AND the "+" offset along the junction's
 * cross-axis leg ("BOTH OF THESE ARE WRONG"). The correct geometry he
 * marked is a short single-direction stub distinctly apart from the corner:
 * the icon lives on the gap's own straight run, never on a corner or a
 * cross-axis leg, because "the icon adds things that are sequential."
 */
function midInsertAt(from: Abstract, to: Abstract): Abstract {
	return { f: (from.f + to.f) / 2, c: to.c }
}

/**
 * A terminal "+": the wire ends in the icon. It stands where the next
 * node's entry face would be — one PROCESS_GAP past the exit — with the
 * wire drawn up to its face (Zach on the end "+": "I like how this cable
 * terminates in the plus, that seems correct", 2026-09-05).
 */
function terminalInsertAt(exit: Abstract): Abstract {
	return { f: exit.f + processGap + PROCESS_INSERT_SIZE / 2, c: exit.c }
}

function buildItem(node: BtNode, emitter: Emitter, isRoot = false): Item {
	if (node.kind === 'decorator') return decoratorItem(node, emitter)
	if (node.kind === 'control' || (node.kind === 'unknown' && node.children.length > 0)) {
		if (node.children.length === 0) return emptyControlItem(node, emitter)
		switch (node.controlKind) {
			case 'parallel': return parallelItem(node, emitter)
			case 'fallback': return fallbackItem(node, emitter)
			case 'branch': return branchItem(node, emitter)
			case 'recoveryLoop': return recoveryLoopItem(node, emitter)
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
		if (index > 0) flow += processGap
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
						at: emitter.toCanvas(midInsertAt(previous.exit, placed.entry)),
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
	// Frame padding is the unit too: band→first node reads as an ordinary gap.
	const flow = headerFlow + processGap + inner.flow + processGap
	const cross = headerCross + processGap + inner.cross + processGap
	const rail = headerCross + processGap + inner.rail
	return {
		flow,
		cross,
		rail,
		place(origin) {
			const rect = emitter.rectToCanvas(origin, flow, cross)
			emitter.scene.groups.push({ path: node.path, rect, title: node.name })
			const placed = inner.place({ f: origin.f + headerFlow + processGap, c: origin.c + headerCross + processGap })
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
	const insertSize = 28
	const cross = insertSize
	const label = node.name || node.id
	const chipW = chipTextWidth(label)
	// The label chip is painted past the "+" along the flow, not inside the
	// insert's own 28×28 box. Down orientation maps the flow axis to the
	// chip's short, fixed side (PROCESS_CHIP_H); the other orientation maps it
	// to the chip's long, label-dependent side (chipW). Either way, anchor the
	// chip's NEAR edge a fixed gap past the box — not its center at a fixed
	// offset, which is what the original code did — and let a longer label
	// push only the FAR edge out. A center anchor would walk the chip's near
	// edge backwards as chipW grows, creeping into the previous sibling's
	// space for a long enough label.
	const chipGap = emitter.down ? 27 : 34
	const chipSpanF = emitter.down ? PROCESS_CHIP_H : chipW
	const chipNearF = insertSize / 2 + chipGap
	const chipCenterF = chipNearF + chipSpanF / 2
	// `flow` is what stack()/sequenceItem reserve for this item downstream,
	// and what a between-insert's midpoint is computed from — it has to reach
	// the chip's own far edge, or a sibling placed PROCESS_NODE_GAP later
	// lands its between-insert on top of this chip's own text.
	const flow = chipNearF + chipSpanF
	return {
		flow,
		cross,
		rail: cross / 2,
		place(origin) {
			const at = emitter.toCanvas({ f: origin.f + insertSize / 2, c: origin.c + cross / 2 })
			emitter.scene.inserts.push({ id: `empty:${node.path}`, at, parentPath: node.path, index: 0, kind: 'empty', persistent: true })
			emitter.scene.chips.push({
				id: `label:${node.path}`,
				rect: chipRect(emitter.toCanvas({ f: origin.f + chipCenterF, c: origin.c + cross / 2 }), chipW, PROCESS_CHIP_H),
				text: label,
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
		// Branch→branch across the flow is the same unit as node→node along
		// it — Zach's annotated Flowstate reference marks them equal.
		if (index > 0) cross += processGap
		laneOffsets.push(cross)
		cross += lane.cross
	})
	const laneFlow = Math.max(...lanes.map((lane) => lane.flow))
	const flow = processGap + laneFlow + processGap
	const laneCenters = laneOffsets.map((offset, index) => offset + lanes[index].rail)
	const firstRail = laneCenters[0]
	const lastRail = laneCenters[laneCenters.length - 1]
	// WHY: Zach's ruling (2026-09-05) — the trunk line above the fork bar and
	// below the join bar has to be the TRUE center of the branches, not an
	// average of only the outer two lanes' centers (the old `(firstRail +
	// lastRail) / 2`, which silently ignores every lane in between and only
	// happened to be right when the two outer lanes were the same width).
	// Reading the physical middle lane's own already-accurate center
	// (`laneCenters`, built from each lane's real measured `rail`) instead
	// gives exactly what he asked for: odd count lands the trunk exactly on
	// the middle lane, even count lands it exactly between the two middle
	// lanes — and it still moves with "the sizing of the other nodes"
	// because a lane's offset is cumulative: a wider lane before the middle
	// one shifts the middle lane's own measured position, same as it always
	// did for `firstRail`/`lastRail`.
	const midIndex = laneCenters.length / 2
	const rail = laneCenters.length % 2 === 1
		? laneCenters[Math.floor(midIndex)]
		: (laneCenters[midIndex - 1] + laneCenters[midIndex]) / 2
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
				const placed = lane.place({ f: forkF + processGap, c: origin.c + laneOffsets[index] })
				connect(emitter, `${node.path}:fork→${index}`, { f: forkF, c: placed.entry.c }, placed.entry, node.children[index].path)
				connect(emitter, `${node.path}:${index}→join`, placed.exit, { f: joinF, c: placed.exit.c }, undefined)
				// WHY: Zach's ruling (2026-09-05) — a Parallel keeps splitting, so
				// every gap BETWEEN two existing branches gets its own hover-reveal
				// "+" to insert a new branch right there: N branches means exactly
				// N-1 of these ("two, one icon in the middle; three, two icons"),
				// one per interior gap, sitting on the fork bar's own level. This is
				// the interior counterpart to the trailing `lane:` insert below,
				// which only covers appending past the LAST branch. `index` here is
				// already the position a new child lands at (same `parentPath` +
				// `index` contract as `insertBehaviorTreeChild`), so no beforePath/
				// afterPath juggling is needed.
				if (index > 0) {
					emitter.scene.inserts.push({
						id: `between:${node.path}:${index}`,
						// Midpoint of the box-edge gap between the two lanes: the
						// only line through the icon is the fork bar itself, and the
						// nearest lane taps sit at the lanes' rails, well outside it.
						at: emitter.toCanvas({ f: forkF, c: origin.c + laneOffsets[index] - processGap / 2 }),
						parentPath: node.path,
						index,
						kind: 'between',
						persistent: false,
					})
				}
			})
			emitter.scene.inserts.push({
				id: `lane:${node.path}`,
				// Half a unit past the LAST lane's outer box edge — measured from
				// the box, not the lane's rail, so a wide last lane can never
				// swallow the icon (the rail is its center, not its edge).
				at: emitter.toCanvas({ f: forkF, c: origin.c + cross + processGap / 2 }),
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
	// A recovery lane's first card starts half a card below the primary entry
	// (Flowstate's Failure line leaves the primary's mid-height).
	const laneStartFlow = Math.min(primary.flow / 2, 52)
	// WHY: Zach's annotated PickAndPlace report (2026-09-05, the
	// failure-branch-formatting board): recovery lanes CASCADE. Every lane's
	// box sits one unit below the Failure line that feeds it — the room the
	// turn-down elbow needs to enter the box's top instead of grafting into
	// its side — and that line leaves the PREVIOUS lane at its own
	// mid-height. One shared box height would put the 2nd+ lane's Failure
	// corner INSIDE the arm's first card (the line would enter from below).
	// Computed here, before any lane is placed, so the reservation accounts
	// for the deepest branch of the whole chain up front.
	const laneBoxFlow: number[] = []
	{
		let failureLineFlow = laneStartFlow
		recoveries.forEach((lane) => {
			laneBoxFlow.push(failureLineFlow + processGap)
			failureLineFlow = failureLineFlow + processGap + Math.min(lane.flow / 2, 52)
		})
	}
	// The merge line sits one unit below the deepest lane, so every arm's
	// exit has at least a full unit of straight flow-direction drop — the
	// segment its terminus "+" lives on.
	const deepest = Math.max(primary.flow, ...recoveries.map((lane, index) => laneBoxFlow[index] + lane.flow))
	const flow = recoveries.length > 0 ? deepest + processGap : primary.flow
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
				const placed = lane.place({ f: origin.f + laneBoxFlow[index], c: laneOriginC })
				// Failure: from the previous lane's side, across the gap, then a
				// real turn down into the new lane's actual entry (its top-center,
				// not its side) — the same face every other node-to-node
				// connection enters from. The corner shares the Failure line's
				// height; the drop from there to `placed.entry` is
				// one PROCESS_GAP unit, the gap the arm's prepend "+" centers in.
				const corner: Abstract = { f: previousExit.f, c: placed.entry.c }
				const chipMid: Abstract = { f: previousExit.f, c: (previousExit.c + corner.c) / 2 }
				const childPath = node.children[firstRecoveryIndex + 1 + index].path
				emitter.scene.edges.push({
					id: `${node.path}:failure:${index}`,
					kind: 'recovery',
					points: [emitter.toCanvas(previousExit), emitter.toCanvas(corner), emitter.toCanvas(placed.entry)],
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
				// The lane's exit drops to the merge line and returns to the rail.
				mergePoints.push(placed.exit)
				const laneNode = node.children[firstRecoveryIndex + 1 + index]
				// WHY: Zach's before/after mockups (2026-09-05) — the turn-down gap
				// above the arm's first node has real room now, so it gets the
				// mirror of the terminus insert below: a "+" to prepend before the
				// arm's current first node. `beforePath` carries the arm's
				// shallowest first-in-flow node, wrapping it in a Sequence first if
				// it is still a bare leaf (see insertBehaviorTreeSibling).
				//
				// `persistent: false` — CORRECTED 2026-09-06. This first shipped
				// `true` the same night, on Zach's own ruling that a recovery arm
				// is "just another sequential branch … its terminus needs the same
				// always-visible + a Sequence's tail gets." That reads fine for one
				// flat Fallback with one arm. Once his literal PickAndPlace board
				// had multiple arms AND a nested Fallback (a node inside a recovery
				// arm growing its own recovery arm), every arm at every level lit
				// its own always-on lane-start/lane-end simultaneously — "every
				// single insert icon is visible... the only icon that should show
				// by default is the one at the bottom [the true end-of-tree
				// terminus]." Only the outermost `id: 'end'` insert (this
				// function's caller, `layoutProcess`) stays persistent; every arm's
				// own start/end, at any depth, hover-reveals like an interior gap.
				emitter.scene.inserts.push({
					id: `lane-start:${node.path}:${index}`,
					at: emitter.toCanvas(midInsertAt(corner, placed.entry)),
					parentPath: laneNode.path,
					index: 0,
					beforePath: sequenceHeadPath(laneNode),
					kind: 'start',
					persistent: false,
				})
				// WHY: the append-after mirror of the prepend above — see that
				// comment for the persistent→hover correction, which applies here
				// identically. `afterPath` carries the real node to grow from —
				// the lane's deepest last-in-flow node, wrapping it in a Sequence
				// first if it is still a bare leaf (see insertBehaviorTreeSibling).
				//
				// Placement: centered in the first unit of the arm's own straight
				// flow-direction drop toward the merge line — which always exists,
				// because the merge sits a full unit below the DEEPEST lane. Never
				// at the arm's exit itself (for a nested Fallback arm that exit IS
				// its own merge corner) and never on the horizontal merge leg (a
				// cross-axis line through a sequential "+") — Zach marked both of
				// those placements wrong on the same annotated screenshot.
				emitter.scene.inserts.push({
					id: `lane-end:${node.path}:${index}`,
					at: emitter.toCanvas(midInsertAt(placed.exit, { f: placed.exit.f + processGap, c: placed.exit.c })),
					parentPath: laneNode.path,
					index: 1,
					afterPath: sequenceTerminusPath(laneNode),
					kind: 'end',
					persistent: false,
				})
				previousExit = { f: origin.f + laneBoxFlow[index] + Math.min(lane.flow / 2, 52), c: sign === 1 ? laneOriginC + lane.cross : laneOriginC }
				previousPath = childPath
			})
			if (recoveries.length > 0) {
				// WHY: Zach's annotated PickAndPlace mockup (2026-09-05, the
				// failure-branch-formatting board, "Note the arrow ends"): every
				// landing on the convergence is marked with an arrowhead pointing
				// into it. So each arm's return is TWO edges, not one polyline —
				// the flow-direction drop ends in an arrowhead AT the merge line…
				mergePoints.forEach((exit, index) => {
					emitter.scene.edges.push({
						id: `${node.path}:merge:${index}`,
						kind: 'merge',
						points: [emitter.toCanvas(exit), emitter.toCanvas({ f: mergeF, c: exit.c })],
						arrowEnd: true,
					})
				})
				// …and ONE shared straight run carries every landing back to the
				// rail, with a single arrowhead into the junction (his mockup
				// pastes the same arrow crop rotated 90° there). One run, not
				// per-lane overlapping copies: Zach explicitly likes "one single
				// straight horizontal line returning to the main flow", and the
				// farthest landing's run passes through every nearer landing.
				const farthest = mergePoints.reduce((a, b) => (Math.abs(b.c - railC) > Math.abs(a.c - railC) ? b : a))
				emitter.scene.edges.push({
					id: `${node.path}:merge:run`,
					kind: 'merge',
					points: [emitter.toCanvas({ f: mergeF, c: farthest.c }), emitter.toCanvas({ f: mergeF, c: railC })],
					arrowEnd: true,
				})
				// The primary rail's own drop to the junction stays headless — it
				// IS the main line the arms merge into, continuing straight through.
				emitter.scene.edges.push({
					id: `${node.path}:merge:rail`,
					kind: 'merge',
					points: [emitter.toCanvas(placedPrimary.exit), emitter.toCanvas({ f: mergeF, c: railC })],
					arrowEnd: false,
				})
				emitter.scene.inserts.push({
					id: `recovery:${node.path}`,
					// Half a unit past this Fallback's own box — NOT half the
					// recovery gap (75px), which reaches into whatever the parent
					// packs beside this item now that the lane gap is one unit.
					at: emitter.toCanvas({ f: origin.f + laneStartFlow, c: sign === 1 ? origin.c + cross + processGap / 2 : origin.c - processGap / 2 }),
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

/* ------------------------------ recovery loop ------------------------------ */

/**
 * RecoveryNode: entry → primary, exactly like any node. Primary FAILURE peels
 * off through a "Failure" chip into the recovery lane — identical geometry to
 * a Fallback's own single-lane case, reusing `kind: 'recovery'`, because that
 * half of the mechanism genuinely IS the same move ("on failure, go try
 * something else").
 *
 * What Fallback never has, because it never re-runs anything: the recovery
 * lane's own completion fans out to two different places, mirroring how
 * primary itself already has two exits at two different points (its real
 * exit for SUCCESS, its mid-height for FAILURE):
 *  - the lane's real exit (its SUCCESS) draws the one backward-travelling
 *    wire in this whole layout engine — `kind: 'retryLoop'`, styled and
 *    routed to be unmistakable — back out around the assembly and into the
 *    primary's own entry, because BT.CPP genuinely re-ticks the primary node
 *    fresh from the top.
 *  - the lane's mid-height (its FAILURE — recovery itself can fail, ending
 *    the node for good) continues forward to the shared exit, reusing
 *    `kind: 'merge'`: structurally the same "this arm is done, rejoin the
 *    through-line" move a Fallback arm's own failure-less merge makes.
 * RecoveryNode only ever SUCCEEDS via the primary — never the recovery child
 * — so unlike `lanesWithRecovery`'s merge point, the shared exit sits
 * directly below the primary's own rail, fed by a headless straight
 * continuation of it plus the recovery lane's failure line.
 *
 * A 1-child node (still being built) draws the primary alone with a
 * persistent prompt for the required recovery step. 3+ children (an XML
 * error BT.CPP would throw on) still draw every node — nothing this app
 * shows is ever silently hidden — stacking the extras after the merge point;
 * `interpretNode`'s diagnostic is what actually flags the real problem.
 */
function recoveryLoopItem(node: BtNode, emitter: Emitter): Item {
	const sign = emitter.recoverySign
	const primary = buildItem(node.children[0], emitter)
	const recovery = node.children.length > 1 ? buildItem(node.children[1], emitter) : null
	const extra = node.children.slice(2).map((child) => buildItem(child, emitter))
	const extraLaid = stack(extra)

	const recoveryExtent = recovery ? PROCESS_RECOVERY_GAP + recovery.cross : 0
	const loopOutset = recovery ? PROCESS_LOOP_OUTSET : 0
	const primaryCrossOffset = sign === 1 ? 0 : recoveryExtent + loopOutset
	const bodyCross = primary.cross + recoveryExtent + loopOutset
	const cross = Math.max(bodyCross, extraLaid.cross)
	const rail = primaryCrossOffset + primary.rail

	// Primary's own Failure-peel-off point — same reasoning as
	// `lanesWithRecovery`'s `laneStartFlow`: the line leaves the primary at
	// its own mid-height, not its exit, so the exit stays free for the rail's
	// straight continuation.
	const laneStartFlow = Math.min(primary.flow / 2, 52)
	const laneBoxFlow = PROCESS_LOOP_HEADROOM + laneStartFlow + processGap
	const primaryExitFlow = PROCESS_LOOP_HEADROOM + primary.flow
	const recoveryMidFlow = recovery ? laneBoxFlow + Math.min(recovery.flow / 2, 52) : 0
	const deepest = Math.max(primaryExitFlow, recoveryMidFlow)
	const mergeFlow = recovery ? deepest + processGap : primaryExitFlow
	const flow = mergeFlow + (extra.length > 0 ? processGap + extraLaid.flow : 0)

	return {
		flow,
		cross,
		rail,
		place(origin) {
			const entry: Abstract = { f: origin.f, c: origin.c + rail }
			const placedPrimary = primary.place({ f: origin.f + PROCESS_LOOP_HEADROOM, c: origin.c + primaryCrossOffset })
			// The short shared drop every incoming wire — Start, a parent, or
			// the loop-back below — takes into the primary's real entry.
			emitter.scene.edges.push({ id: `${node.path}:in`, kind: 'control', points: [emitter.toCanvas(entry), emitter.toCanvas(placedPrimary.entry)], arrowEnd: false })

			if (!recovery) {
				// WHY `recovery-required:`, not `recovery:` (Fallback's own
				// prefix for "add an optional Nth arm", always hover-only):
				// this one is NOT optional — a RecoveryNode with only 1 child
				// is an arity error BT.CPP throws on — so it stays persistent,
				// the same exception `emptyControlItem` already makes for "0
				// children yet." Sharing Fallback's prefix would read as the
				// same always-vs-hover choice being made twice for the same
				// reason, when the two are opposite: optional vs required.
				emitter.scene.inserts.push({
					id: `recovery-required:${node.path}`,
					at: emitter.toCanvas({ f: origin.f + PROCESS_LOOP_HEADROOM + laneStartFlow, c: sign === 1 ? origin.c + cross + processGap / 2 : origin.c - processGap / 2 }),
					parentPath: node.path,
					index: 1,
					kind: 'child',
					persistent: true,
				})
				return { entry, exit: placedPrimary.exit }
			}

			const laneOriginC = sign === 1
				? origin.c + primary.cross + PROCESS_RECOVERY_GAP
				: origin.c + loopOutset
			const placedRecovery = recovery.place({ f: origin.f + laneBoxFlow, c: laneOriginC })

			// Failure: primary's mid-height, across, then down into the lane's
			// real entry — see `lanesWithRecovery`'s identical corner turn.
			const primarySideC = sign === 1 ? origin.c + primary.cross : origin.c + primaryCrossOffset
			const failureExit: Abstract = { f: origin.f + PROCESS_LOOP_HEADROOM + laneStartFlow, c: primarySideC }
			const failureCorner: Abstract = { f: failureExit.f, c: placedRecovery.entry.c }
			emitter.scene.edges.push({
				id: `${node.path}:failure`,
				kind: 'recovery',
				points: [emitter.toCanvas(failureExit), emitter.toCanvas(failureCorner), emitter.toCanvas(placedRecovery.entry)],
				arrowEnd: true,
				from: node.children[0].path,
				to: node.children[1].path,
			})
			emitter.scene.chips.push({
				id: `failure:${node.path}`,
				rect: chipRect(emitter.toCanvas({ f: failureExit.f, c: (failureExit.c + failureCorner.c) / 2 }), PROCESS_CHIP_W, PROCESS_CHIP_H),
				text: 'Failure',
				kind: 'failure',
				path: node.children[1].path,
			})
			// A prepend "+" above the recovery step's own first node, mirroring
			// every Fallback lane's `lane-start` insert.
			emitter.scene.inserts.push({
				id: `lane-start:${node.path}`,
				at: emitter.toCanvas(midInsertAt(failureCorner, placedRecovery.entry)),
				parentPath: node.children[1].path,
				index: 0,
				beforePath: sequenceHeadPath(node.children[1]),
				kind: 'start',
				persistent: true,
			})

			const mergePoint: Abstract = { f: origin.f + mergeFlow, c: entry.c }
			// The primary rail's own drop to the junction stays headless — it
			// IS the main line continuing straight through on SUCCESS.
			emitter.scene.edges.push({ id: `${node.path}:merge:rail`, kind: 'merge', points: [emitter.toCanvas(placedPrimary.exit), emitter.toCanvas(mergePoint)], arrowEnd: false })
			// Recovery's own FAILURE (it can fail outright, or the retry budget
			// is spent) continues forward to the SAME junction — the only way
			// out of this node besides the primary itself succeeding.
			const recoveryMid: Abstract = { f: origin.f + recoveryMidFlow, c: sign === 1 ? laneOriginC + recovery.cross : laneOriginC }
			const recoveryMidCorner: Abstract = { f: recoveryMid.f, c: mergePoint.c }
			emitter.scene.edges.push({
				id: `${node.path}:merge:recovery`,
				kind: 'merge',
				points: [emitter.toCanvas(recoveryMid), emitter.toCanvas(recoveryMidCorner), emitter.toCanvas(mergePoint)],
				arrowEnd: true,
			})
			// A trailing "+" to grow the recovery step, mirroring a Fallback
			// lane's own `lane-end` terminus.
			emitter.scene.inserts.push({
				id: `lane-end:${node.path}`,
				at: emitter.toCanvas(midInsertAt(placedRecovery.exit, { f: placedRecovery.exit.f + processGap, c: placedRecovery.exit.c })),
				parentPath: node.children[1].path,
				index: 1,
				afterPath: sequenceTerminusPath(node.children[1]),
				kind: 'end',
				persistent: true,
			})

			// The loop-back: recovery's real exit (its SUCCESS) travels OUT
			// past the lane's far edge, BACK past the primary's own top, and
			// IN to the shared entry — the only edge anywhere in this layout
			// whose flow coordinate ever decreases. Routed entirely outside
			// the primary+lane footprint so it never crosses the Failure line
			// living in the corridor between them.
			const outerC = sign === 1
				? origin.c + primary.cross + recoveryExtent + loopOutset / 2
				: origin.c + loopOutset / 2
			const loopBackFlow = origin.f + PROCESS_LOOP_HEADROOM / 2
			const loopPoints: Abstract[] = [
				placedRecovery.exit,
				{ f: placedRecovery.exit.f, c: outerC },
				{ f: loopBackFlow, c: outerC },
				{ f: loopBackFlow, c: entry.c },
				entry,
			]
			emitter.scene.edges.push({
				id: `${node.path}:retry`,
				kind: 'retryLoop',
				points: loopPoints.map((point) => emitter.toCanvas(point)),
				arrowEnd: true,
				from: node.children[1].path,
				to: node.children[0].path,
			})
			const retries = node.ports.find((binding) => binding.name === 'number_of_retries')?.value ?? '1'
			emitter.scene.chips.push({
				id: `retry:${node.path}`,
				rect: chipRect(emitter.toCanvas({ f: loopBackFlow, c: outerC }), PROCESS_CHIP_W, PROCESS_CHIP_H),
				text: `Retry ×${retries}`,
				kind: 'decorator',
				path: node.path,
			})

			if (extra.length === 0) return { entry, exit: mergePoint }
			// Arity violation (3+ children): keep every node visible, stacked
			// as a plain continuation after the merge point.
			let previous: Placed = { entry: mergePoint, exit: mergePoint }
			extra.forEach((item, index) => {
				const offset = extraLaid.offsets[index]
				const placed = item.place({ f: mergePoint.f + processGap + offset.f, c: origin.c + rail - extraLaid.rail + offset.c })
				connect(emitter, `${node.path}:extra:${index}`, previous.exit, placed.entry, node.children[2 + index].path)
				previous = placed
			})
			return { entry, exit: previous.exit }
		},
	}
}

/* -------------------------------- decorator -------------------------------- */

function decoratorItem(node: BtNode, emitter: Emitter): Item {
	const child = node.children[0]
	const inner = child ? buildItem(child, emitter) : emptyControlItem(node, emitter)
	// Chip→child is an edge entering a node: one unit, like every other.
	const chipFlow = processGap + PROCESS_CHIP_H
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
				rect: chipRect(emitter.toCanvas(chipCenter), chipTextWidth(label), PROCESS_CHIP_H),
				text: label,
				kind: 'decorator',
				path: node.path,
			})
			connect(emitter, `${node.path}:chip→child`, { f: origin.f + PROCESS_CHIP_H, c: origin.c + inner.rail }, placed.entry, child?.path)
			return { entry: { f: origin.f, c: origin.c + inner.rail }, exit: placed.exit }
		},
	}
}

/** A chip's width follows its label so the text never overflows the box — Inter 16px averages ~9px/char. */
function chipTextWidth(label: string): number {
	return Math.max(PROCESS_CHIP_W, 24 + label.length * 9)
}

function chipRect(center: BtPoint, w: number, h: number): BtRect {
	return { x: center.x - w / 2, y: center.y - h / 2, w, h }
}
