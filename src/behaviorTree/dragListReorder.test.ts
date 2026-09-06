/**
 * Tree view drag-to-reorder on dnd-kit — against the real sample tree, not a
 * toy model. Every behavioral assertion in the first half is ported verbatim
 * from the hand-rolled engine's suite (`treeDragReorder.test.ts`, now
 * retired): that engine is this migration's regression oracle, so its
 * observable answers are pinned here unchanged. The second half covers what
 * is genuinely new — the per-parent container derivation, the tiled-zone
 * multi-container pick, the react-arborist ancestor-climb, and the
 * hysteresis deadband dnd-kit itself does not ship.
 */
import { describe, expect, it } from 'vitest'

import { moveBehaviorTreeNode, parseBehaviorTreeXml, SAMPLE_BEHAVIOR_TREE_XML, selectTree } from './btcppXml'
import { buildDragListContext, resolveDragListDrop } from './dragListReorder'
import {
	deriveSortableContainers,
	resolveSlotWithHysteresis,
	tileContainerZones,
	type SortableItemInput,
} from './sortableGeometry'
import { layoutTree } from './treeLayout'

// Sequence "Pick and place" (0)
//   0.0  SubTree MoveToObj
//   0.1  Fallback "Grasp or correct"
//     0.1.0  GraspValid
//     0.1.1  CorrectGrip
//   0.2  CloseGrip
//   0.3  MoveHome
//   0.4  Parallel
//     0.4.0  CloseGrip
//     0.4.1  Sequence
//       0.4.1.0  CloseGrip
//       0.4.1.1  MoveHome
//     0.4.2  MoveHome
// The project's own fixture (`btcppXml.ts`), model-declared — GraspValid is a
// real `Condition`, so the leaf-refusal test below exercises the actual rule
// rather than the permissive default `moveBehaviorTreeNode` gives an
// undeclared tag.
const XML = SAMPLE_BEHAVIOR_TREE_XML

const OPTIONS = { orientation: 'down' as const, nodeFace: 'simple' as const, controlFace: 'expanded' as const }

function nodeRect(path: string) {
	const tree = selectTree(parseBehaviorTreeXml(XML), 'PickAndPlace')
	const scene = layoutTree(tree!, { ...OPTIONS, edgeStyle: 'straight' })
	return scene.nodes.find((entry) => entry.path === path)!.rect
}

describe('buildDragListContext', () => {
	it('refuses the root: it has no parent to reorder among', () => {
		expect(buildDragListContext(XML, 'PickAndPlace', '0', OPTIONS)).toBeNull()
	})

	it('refuses a path that no longer exists', () => {
		expect(buildDragListContext(XML, 'PickAndPlace', '0.9', OPTIONS)).toBeNull()
	})

	it('builds a ghost scene with the dragged occurrence and its subtree gone', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.1', OPTIONS)!
		expect(ctx).not.toBeNull()
		// The tree had 13 occurrences; deleting the Fallback removes it and its
		// two children, leaving 10 — none of them mapping back to the Fallback
		// or either of its old children.
		const basePaths = [...ctx.ghostToBasePath.values()]
		expect(basePaths).toHaveLength(10)
		expect(basePaths).not.toContain('0.1')
		expect(basePaths).not.toContain('0.1.0')
		expect(basePaths).not.toContain('0.1.1')
		expect(ctx.ghostScene!.nodes).toHaveLength(10)
	})
})

describe('resolveDragListDrop — plain sibling reorder', () => {
	it('moving CloseGrip (0.2) back to before SubTree (0.0) leaves every other root child in the same relative order', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const leftOfSubTree = { ...nodeRect('0.0'), x: nodeRect('0.0').x - 5 }
		const result = resolveDragListDrop(ctx, leftOfSubTree)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0')
		expect(result.index).toBe(0)
		const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
		const rootChildIds = tree.root!.children.map((child) => child.id)
		expect(rootChildIds).toEqual(['CloseGrip', 'SubTree', 'Fallback', 'MoveHome', 'Parallel'])
	})

	it('dropping a sole-occupant row back onto itself is a no-op (the empty-row fallback)', () => {
		// A single-branch tree: ActionOnly is the ONLY node on depth 1. Removing
		// it for the ghost empties that row entirely, so resolution has no
		// container to compare against and must fall back to "put it back
		// where it was".
		const soleXml = `<root BTCPP_format="4" main_tree_to_execute="Solo">
			<BehaviorTree ID="Solo"><Sequence><ActionOnly/></Sequence></BehaviorTree>
		</root>`
		const ctx = buildDragListContext(soleXml, 'Solo', '0.0', OPTIONS)!
		// Only the root (depth 0) survives the ghost delete; depth 1 is empty.
		expect(ctx.ghostScene!.nodes.filter((entry) => entry.node.depth === 1)).toHaveLength(0)
		const tree = selectTree(parseBehaviorTreeXml(soleXml), 'Solo')!
		const ownRect = layoutTree(tree, { ...OPTIONS, edgeStyle: 'straight' }).nodes.find((n) => n.path === '0.0')!.rect
		const result = resolveDragListDrop(ctx, ownRect)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0')
		expect(result.index).toBe(0)
		const resultTree = selectTree(parseBehaviorTreeXml(result.xml), 'Solo')!
		expect(resultTree.root!.children.map((child) => child.id)).toEqual(['ActionOnly'])
	})

	it('is monotonic: sweeping the pointer across a row never skips a slot backward', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const rowY = nodeRect('0.0').y
		const xs = [nodeRect('0.0').x - 100, nodeRect('0.0').x, nodeRect('0.1').x, nodeRect('0.3').x, nodeRect('0.4').x + 500]
		let lastIndex = -1
		for (const x of xs) {
			const result = resolveDragListDrop(ctx, { x, y: rowY, w: 1, h: 1 })
			expect(result.ok).toBe(true)
			if (!result.ok) continue
			expect(result.index).toBeGreaterThanOrEqual(lastIndex)
			lastIndex = result.index
		}
	})
})

describe('resolveDragListDrop — cross-parent move', () => {
	it('dragging GraspValid (0.1.0) out to root level between CloseGrip and MoveHome reparents it there', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.1.0', OPTIONS)!
		const between = {
			x: (nodeRect('0.2').x + nodeRect('0.2').w + nodeRect('0.3').x) / 2,
			y: nodeRect('0.2').y,
			w: 1,
			h: 1,
		}
		const result = resolveDragListDrop(ctx, between)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0')
		const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
		const rootChildIds = tree.root!.children.map((child) => child.id)
		expect(rootChildIds).toEqual(['SubTree', 'Fallback', 'CloseGrip', 'GraspValid', 'MoveHome', 'Parallel'])
		// The Fallback that used to hold it now holds only CorrectGrip.
		const fallback = tree.root!.children.find((child) => child.tag === 'Fallback')!
		expect(fallback.children.map((child) => child.id)).toEqual(['CorrectGrip'])
	})
})

describe('resolveDragListDrop — a control node carries its whole subtree', () => {
	it('moving the Fallback (0.1) to the end of root brings GraspValid and CorrectGrip with it, in order', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.1', OPTIONS)!
		const pastParallel = { x: nodeRect('0.4').x + nodeRect('0.4').w + 500, y: nodeRect('0.4').y, w: 1, h: 1 }
		const result = resolveDragListDrop(ctx, pastParallel)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0')
		const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
		const rootChildIds = tree.root!.children.map((child) => child.id)
		expect(rootChildIds).toEqual(['SubTree', 'CloseGrip', 'MoveHome', 'Parallel', 'Fallback'])
		const movedFallback = tree.root!.children.find((child) => child.tag === 'Fallback')!
		expect(movedFallback.children.map((child) => child.id)).toEqual(['GraspValid', 'CorrectGrip'])
	})

	it('hovering over one of its own descendants never lands the Fallback inside itself', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.1', OPTIONS)!
		// GraspValid's row belongs to the deleted subtree, so the ghost has
		// nothing there for the pointer to resolve against at that exact
		// depth+cross position — proving the descendant rows are genuinely
		// gone from consideration (the ghost, not luck, is what rules this out).
		const overGraspValid = nodeRect('0.1.0')
		const result = resolveDragListDrop(ctx, overGraspValid)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath.startsWith('0.1')).toBe(false)
	})
})

describe('resolveDragListDrop — illegal drops refuse with a reason', () => {
	it('refuses a cycle directly: the Fallback (0.1) cannot become a child of its own child', () => {
		const attempt = moveBehaviorTreeNode(XML, 'PickAndPlace', '0.1', '0.1.0', 0)
		expect(attempt.ok).toBe(false)
	})

	it('refuses landing inside a leaf directly: GraspValid cannot hold children', () => {
		const attempt = moveBehaviorTreeNode(XML, 'PickAndPlace', '0.2', '0.1.0', 0)
		expect(attempt.ok).toBe(false)
	})

	it('a pointer nearer the LEFT neighbor across a parent boundary appends to that neighbor\'s own parent', () => {
		// CorrectGrip (0.1.1, Fallback's own child) and CloseGrip (0.4.0,
		// Parallel's own child) are adjacent on depth 2 with nothing between
		// them — the ready-made two-parent boundary in this fixture. Dragging
		// CloseGrip (0.2, a different depth entirely, so the ghost never
		// touches this row) exercises the zone-tiling adjudication with
		// no other case already covering it.
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const correctGrip = nodeRect('0.1.1')
		const closeGrip040 = nodeRect('0.4.0')
		const gapStart = correctGrip.x + correctGrip.w
		const gapEnd = closeGrip040.x
		expect(gapEnd).toBeGreaterThan(gapStart)
		const nearLeft = { x: gapStart + (gapEnd - gapStart) * 0.1, y: correctGrip.y, w: 1, h: 1 }
		const result = resolveDragListDrop(ctx, nearLeft)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0.1')
		const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
		const fallback = tree.root!.children.find((child) => child.tag === 'Fallback')!
		expect(fallback.children.map((child) => child.id)).toEqual(['GraspValid', 'CorrectGrip', 'CloseGrip'])
	})

	it('a pointer nearer the RIGHT neighbor across the same boundary prepends to that neighbor\'s own parent', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const correctGrip = nodeRect('0.1.1')
		const closeGrip040 = nodeRect('0.4.0')
		const gapStart = correctGrip.x + correctGrip.w
		const gapEnd = closeGrip040.x
		const nearRight = { x: gapStart + (gapEnd - gapStart) * 0.9, y: correctGrip.y, w: 1, h: 1 }
		const result = resolveDragListDrop(ctx, nearRight)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0.4')
		const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
		const parallel = tree.root!.children.find((child) => child.tag === 'Parallel')!
		expect(parallel.children.map((child) => child.id)).toEqual(['CloseGrip', 'CloseGrip', 'Sequence', 'MoveHome'])
	})

	it('refuses a decorator that already holds a child, forwarded through resolveDragListDrop', () => {
		const decoratorXml = `<root BTCPP_format="4" main_tree_to_execute="Guarded">
			<BehaviorTree ID="Guarded">
				<Sequence>
					<Inverter>
						<ConditionA/>
					</Inverter>
					<ActionB/>
				</Sequence>
			</BehaviorTree>
		</root>`
		const tree = selectTree(parseBehaviorTreeXml(decoratorXml), 'Guarded')!
		const scene = layoutTree(tree, { ...OPTIONS, edgeStyle: 'straight' })
		const conditionRect = scene.nodes.find((entry) => entry.path === '0.0.0')!.rect
		const ctx = buildDragListContext(decoratorXml, 'Guarded', '0.1', OPTIONS)!
		// Hover ActionB (the node being dragged) exactly over ConditionA, the
		// Inverter's one existing child — the only neighbor on that row.
		const result = resolveDragListDrop(ctx, conditionRect)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.reason).toMatch(/decorator/i)
	})
})

describe('buildDragListContext — an Expanded leaf\'s override shifts everything below it', () => {
	// GraspValid (0.1.0) pinned to Expanded (item 2's escape hatch from the
	// ordinary Block view pill): 320 tall instead of its 112 formula height.
	// `treeLayout.ts` folds that into depth 2's own row extent, which pushes
	// every row BELOW depth 2 (only depth 3 exists here) down by the
	// difference — 208px, the exact number an independent audit measured
	// live before this fix threaded `nodeViewOverrides` through drag
	// resolution at all.
	const overrides = { '0.1.0': { view: 'expanded', w: 420, h: 320 } }

	function paintedRect(path: string) {
		const tree = selectTree(parseBehaviorTreeXml(XML), 'PickAndPlace')!
		const scene = layoutTree(tree, { ...OPTIONS, edgeStyle: 'straight', nodeViewOverrides: overrides })
		return scene.nodes.find((entry) => entry.path === path)!.rect
	}

	it('base bands match the painted (override-aware) layout, not the plain formula', () => {
		const painted = paintedRect('0.4.1.0') // depth 3, pushed down by the override
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.4.0', { ...OPTIONS, nodeViewOverrides: overrides })!
		const depth3Band = ctx.baseBands.find((band) => band.depth === 3)!
		expect(depth3Band.flowStart).toBeCloseTo(painted.y, 1)
	})

	it('omitting the override drifts the bands away from what actually paints — the bug this guards against', () => {
		const painted = paintedRect('0.4.1.0')
		const blindCtx = buildDragListContext(XML, 'PickAndPlace', '0.4.0', OPTIONS)! // no nodeViewOverrides passed
		const blindDepth3Band = blindCtx.baseBands.find((band) => band.depth === 3)!
		expect(Math.abs(blindDepth3Band.flowStart - painted.y)).toBeGreaterThan(150)
	})

	it('the ghost re-keys the override through its own delete-remap when the drag shifts the overridden node\'s path', () => {
		// Dragging SubTree (0.0) shifts every later top-level sibling and
		// descendant left by one path segment — GraspValid becomes 0.0.0 in
		// the ghost, not 0.1.0. The override has to follow it there, not stay
		// bound to a path nothing occupies in the ghost any more.
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.0', { ...OPTIONS, nodeViewOverrides: overrides })!
		const ghostGraspValid = ctx.ghostScene!.nodes.find((entry) => entry.node.id === 'GraspValid')!
		expect(ghostGraspValid.path).toBe('0.0.0')
		expect(ghostGraspValid.rect.h).toBe(320)
	})

	it('a drag hovering the real painted position of the pushed-down row resolves there only when the override is threaded through', () => {
		// CloseGrip (0.4.1.0) and MoveHome (0.4.1.1) are Sequence's own two
		// depth-3 children. Hover the dragged CloseGrip over MoveHome's real,
		// override-shifted position: with the fix, resolution reads that as
		// depth 3 (Sequence, 0.4.1) exactly like the painted board shows.
		const paintedMoveHome = paintedRect('0.4.1.1')
		const pointer = { x: paintedMoveHome.x + paintedMoveHome.w / 2, y: paintedMoveHome.y + paintedMoveHome.h / 2, w: 1, h: 1 }

		const awareCtx = buildDragListContext(XML, 'PickAndPlace', '0.4.1.0', { ...OPTIONS, nodeViewOverrides: overrides })!
		const awareResult = resolveDragListDrop(awareCtx, pointer)
		expect(awareResult.ok).toBe(true)
		if (awareResult.ok) expect(awareResult.targetParentPath).toBe('0.4.1')

		// Reproduces the bug's actual mechanism directly: depth 3 is this
		// tree's deepest row, so a "nearest band" fallback would coincidentally
		// still land the drop on it even from blind (uncorrected) bands — the
		// nearest-fallback exists precisely so a pointer past the last row
		// still resolves, and it would quietly paper over this exact
		// divergence. The real, load-bearing claim is narrower and is what
		// the two band tests above already measure directly: the blind depth-3
		// band does not CONTAIN this painted position at all (it sits 208px
		// higher, still expecting GraspValid's un-Expanded 112px row above
		// it) — asserted here again at the point resolution actually reads it.
		const blindCtx = buildDragListContext(XML, 'PickAndPlace', '0.4.1.0', OPTIONS)!
		const blindDepth3Band = blindCtx.baseBands.find((band) => band.depth === 3)!
		expect(pointer.y).toBeGreaterThan(blindDepth3Band.flowEnd)
	})
})

/* ------------------- what the dnd-kit migration adds ------------------- */

describe('deriveSortableContainers — uniform per-container slot geometry', () => {
	const items: SortableItemInput[] = [
		{ id: 'a', containerId: 'p', order: 0, rect: { x: 0, y: 0, w: 100, h: 40 } },
		{ id: 'b', containerId: 'p', order: 1, rect: { x: 140, y: 0, w: 420, h: 90 } }, // an Expanded member
		{ id: 'c', containerId: 'p', order: 2, rect: { x: 600, y: 0, w: 100, h: 40 } },
		{ id: 'x', containerId: 'q', order: 0, rect: { x: 900, y: 0, w: 60, h: 40 } },
		{ id: 'y', containerId: 'q', order: 1, rect: { x: 980, y: 0, w: 60, h: 40 } },
	]

	it('normalizes every slot to the container\'s largest member, keeping real centers', () => {
		const containers = deriveSortableContainers(items, 'x')
		const p = containers.get('p')!
		expect(p.slotExtent).toBe(420)
		for (const item of p.items) {
			expect(item.virtualRect.w).toBe(420)
			expect(item.virtualRect.x + item.virtualRect.w / 2).toBeCloseTo(item.rect.x + item.rect.w / 2, 6)
		}
	})

	it('derives each container independently — q\'s slots never see p\'s Expanded width', () => {
		const containers = deriveSortableContainers(items, 'x')
		expect(containers.get('q')!.slotExtent).toBe(60)
		expect(containers.get('p')!.gap).toBe(40) // both adjacent gaps are 40
		expect(containers.get('q')!.gap).toBe(20)
	})

	it('sorts along y when the caller\'s flow is horizontal — the axis is an input, not a view assumption', () => {
		const vertical: SortableItemInput[] = [
			{ id: 'a', containerId: 'p', order: 0, rect: { x: 0, y: 0, w: 40, h: 100 } },
			{ id: 'b', containerId: 'p', order: 1, rect: { x: 0, y: 130, w: 40, h: 260 } },
		]
		const container = deriveSortableContainers(vertical, 'y').get('p')!
		expect(container.slotExtent).toBe(260)
		expect(container.items[0].virtualRect.h).toBe(260)
		expect(container.items[0].virtualRect.y + container.items[0].virtualRect.h / 2).toBeCloseTo(50, 6)
	})

	it('tiles a strip\'s zones at gap midpoints and pads the outer ends by one slot', () => {
		const containers = deriveSortableContainers(items, 'x')
		const zones = tileContainerZones([containers.get('p')!, containers.get('q')!], 'x')
		// p spans 0..700, q spans 900..1040: the boundary splits the 200 gap at 800.
		expect(zones.get('p')).toEqual({ start: -420, end: 800 })
		expect(zones.get('q')).toEqual({ start: 800, end: 1100 })
	})
})

describe('resolveSlotWithHysteresis — the deadband dnd-kit does not ship', () => {
	const container = deriveSortableContainers([
		{ id: 'a', containerId: 'p', order: 0, rect: { x: 0, y: 0, w: 100, h: 40 } },
		{ id: 'b', containerId: 'p', order: 1, rect: { x: 140, y: 0, w: 100, h: 40 } },
		{ id: 'c', containerId: 'p', order: 2, rect: { x: 280, y: 0, w: 100, h: 40 } },
	], 'x').get('p')!
	// centers: a=50, b=190, c=330; gap=40.

	it('reduces to count-of-centers for a point rect seeded foreign (nothing displaced)', () => {
		const point = (x: number) => ({ x, y: 0, w: 0, h: 0 })
		expect(resolveSlotWithHysteresis(container, point(40), 'x', 3)).toBe(0)
		expect(resolveSlotWithHysteresis(container, point(60), 'x', 3)).toBe(1)
		expect(resolveSlotWithHysteresis(container, point(200), 'x', 3)).toBe(2)
		expect(resolveSlotWithHysteresis(container, point(340), 'x', 3)).toBe(3)
	})

	it('holds a captured slot against sub-displacement wobble', () => {
		// A real-sized dragged card (w=100, so displacement = 140) whose
		// leading edge crossed b's center captured slot 1; wobbling back a few
		// pixels leaves the trailing edge far short of center+displacement, so
		// the slot holds instead of flapping — the "fires on a sliver"
		// complaint the stateless rule could not answer.
		const captured = resolveSlotWithHysteresis(container, { x: 185, y: 0, w: 100, h: 40 }, 'x', 2)
		expect(captured).toBe(1)
		const wobbled = resolveSlotWithHysteresis(container, { x: 195, y: 0, w: 100, h: 40 }, 'x', captured)
		expect(wobbled).toBe(1)
	})

	it('releases only once the trailing edge passes the member\'s center plus its displacement', () => {
		// From slot 1, b (center 190) is displaced by 140: release needs the
		// trailing edge past 330.
		expect(resolveSlotWithHysteresis(container, { x: 225, y: 0, w: 100, h: 40 }, 'x', 1)).toBe(1)
		expect(resolveSlotWithHysteresis(container, { x: 235, y: 0, w: 100, h: 40 }, 'x', 1)).toBe(2)
	})
})

describe('resolveDragListDrop — multi-container and ancestor-climb mechanics', () => {
	it('scopes each parent\'s children to its own container on the shared depth strip', () => {
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const strip = ctx.strips.get(2)!
		expect(strip.records.map((record) => record.baseParentPath).sort()).toEqual(['0.1', '0.4'])
		// Each container's slot geometry is its own — no global metric.
		const fallbackKids = ctx.containersByParent.get('0.1')!
		const parallelKids = ctx.containersByParent.get('0.4')!
		expect(fallbackKids.container.items.map((item) => item.id)).toEqual(['0.1.0', '0.1.1'])
		expect(parallelKids.container.items.map((item) => item.id)).toEqual(['0.4.0', '0.4.1', '0.4.2'])
	})

	it('hovering the void where the dragged subtree used to hang climbs to the parent level (walkUpFrom)', () => {
		// Dragging the Fallback (0.1) empties its own children's stretch of
		// depth 2. A pointer parked on that row, more than one slot outside
		// the one surviving depth-2 container (Parallel's children) but still
		// inside the ROOT list's own span, gets the react-arborist answer:
		// climb and land at root level, not teleport into Parallel's children.
		const ctx = buildDragListContext(XML, 'PickAndPlace', '0.1', OPTIONS)!
		const survivor = ctx.containersByParent.get('0.4')!
		// Probe read off the context's own geometry so the layout can breathe:
		// one-and-a-half slots left of the surviving container's bound — past
		// the climb threshold by construction.
		const probeX = survivor.container.bound.x - survivor.container.slotExtent * 1.5
		const root = ctx.containersByParent.get('0')!
		expect(probeX).toBeGreaterThan(root.container.bound.x) // still over the root list
		const rowRect = nodeRect('0.1.0')
		const result = resolveDragListDrop(ctx, { x: probeX, y: rowRect.y, w: 1, h: rowRect.h })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.targetParentPath).toBe('0')
	})

	it('threads hysteresis through the context: a wobble that a fresh resolve would flip, the live drag holds', () => {
		const ctxLive = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		// The ghost center of SubTree (base 0.0) in the ghost layout, read
		// from the context itself rather than assumed.
		const ghostPathOfSubTree = [...ctxLive.ghostToBasePath.entries()].find(([, base]) => base === '0.0')![0]
		const ghostSubTree = ctxLive.ghostScene!.nodes.find((entry) => entry.path === ghostPathOfSubTree)!
		const center = ghostSubTree.rect.x + ghostSubTree.rect.w / 2
		const { w, h } = nodeRect('0.2')
		const rowY = nodeRect('0.2').y

		// Frame 1: leading edge 5px past a's center from the right — capture
		// slot 0 (before SubTree).
		const frame1 = resolveDragListDrop(ctxLive, { x: center - 5, y: rowY, w, h })
		expect(frame1.ok).toBe(true)
		if (!frame1.ok) return
		expect(frame1.index).toBe(0)

		// Frame 2: wobble 10px right. Same live context holds slot 0 — the
		// trailing edge is nowhere near center + displacement.
		const frame2 = resolveDragListDrop(ctxLive, { x: center + 5, y: rowY, w, h })
		expect(frame2.ok).toBe(true)
		if (!frame2.ok) return
		expect(frame2.index).toBe(0)

		// The same wobbled rect on a FRESH context (no prior slot) resolves
		// past a's center to slot 1 — proof the deadband is the live state,
		// not a coincidence of geometry.
		const ctxFresh = buildDragListContext(XML, 'PickAndPlace', '0.2', OPTIONS)!
		const fresh = resolveDragListDrop(ctxFresh, { x: center + 5, y: rowY, w, h })
		expect(fresh.ok).toBe(true)
		if (!fresh.ok) return
		expect(fresh.index).toBe(1)
	})
})
