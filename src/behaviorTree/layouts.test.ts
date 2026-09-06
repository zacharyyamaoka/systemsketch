/**
 * Layout invariants for the Tree, Process and Blackboard engines, plus an
 * optional preview: `BT_PREVIEW=/tmp/dir npx vitest run src/behaviorTree/layouts.test.ts`
 * writes one SVG per view so a layout change can be looked at.
 */
import { describe, expect, it } from 'vitest'

import { insertBehaviorTreeNode, SAMPLE_BEHAVIOR_TREE_XML, parseBehaviorTreeXml, selectTree } from './btcppXml'
import { BT_EDGE_STYLES, type BtPoint, type BtRect, type BtScene } from './behaviorTreeModel'
import { analyzeDataflow } from './dataflow'
import { layoutBlackboard } from './blackboardLayout'
import { layoutProcess, PROCESS_GAP, PROCESS_INSERT_SIZE } from './processLayout'
import { sceneToSvg } from './sceneSvg'
import { layoutTree, treeEdgeEndpoints, TREE_SIBLING_GAP } from './treeLayout'

const FLOWSTATE_XML = `<root BTCPP_format="4" main_tree_to_execute="RigidBodyAssembly">
  <BehaviorTree ID="RigidBodyAssembly">
    <Sequence name="Rigid Body Assembly">
      <Sequence name="Initialize Workcell">
        <Parallel success_count="-1" failure_count="1">
          <Sequence>
            <enable_motion robot="robot2"/>
            <planned_move robot="robot2"/>
            <Fallback>
              <command_multi_axis_gripper gripper="multi_axis_gripper"/>
              <Sequence>
                <command_multi_axis_gripper gripper="multi_axis_gripper"/>
                <command_multi_axis_gripper gripper="multi_axis_gripper"/>
                <AlwaysFailure/>
              </Sequence>
            </Fallback>
          </Sequence>
          <Sequence>
            <enable_motion robot="robot1"/>
            <planned_move robot="robot1"/>
          </Sequence>
          <Sequence>
            <command_trommel trommel="trommel"/>
            <command_trommel trommel="trommel"/>
          </Sequence>
        </Parallel>
      </Sequence>
      <Sequence name="Pull Part Kit">
        <Fallback>
          <command_multi_axis_gripper gripper="multi_axis_gripper"/>
          <Sequence>
            <command_multi_axis_gripper gripper="multi_axis_gripper"/>
            <command_multi_axis_gripper gripper="multi_axis_gripper"/>
          </Sequence>
        </Fallback>
      </Sequence>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="enable_motion"><input_port name="robot"/></Action>
    <Action ID="planned_move"><input_port name="robot"/></Action>
    <Action ID="command_multi_axis_gripper"><input_port name="gripper"/></Action>
    <Action ID="command_trommel"><input_port name="trommel"/></Action>
  </TreeNodesModel>
</root>`

const sample = selectTree(parseBehaviorTreeXml(SAMPLE_BEHAVIOR_TREE_XML), 'PickAndPlace')!
const flowstate = selectTree(parseBehaviorTreeXml(FLOWSTATE_XML), 'RigidBodyAssembly')!

/**
 * A Fallback nested `depth` levels inside another's own recovery arm — Zach's
 * 2026-09-05 ask: "once you start a new failure loop, if that failure loop
 * fails, you should be able to also make a failure branch from a node that
 * already has a failure branch." `Guard0` is the outermost guard; the
 * deepest level's own recovery arm is a bare leaf (`Leaf`), so the
 * wrap-on-insert path (see `insertBehaviorTreeSibling`) gets exercised at
 * the bottom of the chain too, exactly like the sample tree's `CorrectGrip`.
 */
function nestedFallbackXml(depth: number): string {
	let inner = '<Leaf/>'
	for (let level = depth - 1; level >= 0; level -= 1) {
		inner = `<Fallback name="Recover ${level}"><Guard${level}/>${inner}</Fallback>`
	}
	const guards = Array.from({ length: depth }, (_, level) => `<Action ID="Guard${level}"/>`).join('')
	return `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>${inner}<After/></Sequence></BehaviorTree>
		<TreeNodesModel>${guards}<Action ID="Leaf"/><Action ID="After"/></TreeNodesModel></root>`
}

/** Every nested Fallback is child 1 of the one before it, off the root's child 0. */
function nestedFallbackPath(level: number): string {
	return `0.0${'.1'.repeat(level)}`
}

function overlaps(a: BtRect, b: BtRect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function expectNoNodeOverlap(scene: BtScene) {
	const rects = [...scene.nodes.map((entry) => entry.rect), ...scene.chips.map((chip) => chip.rect), ...scene.keys.map((key) => key.rect)]
	for (let i = 0; i < rects.length; i += 1) {
		for (let j = i + 1; j < rects.length; j += 1) {
			expect(overlaps(rects[i], rects[j]), `rect ${i} overlaps rect ${j}`).toBe(false)
		}
	}
}

function expectInsideBounds(scene: BtScene) {
	for (const entry of scene.nodes) {
		expect(entry.rect.x).toBeGreaterThanOrEqual(scene.bounds.x - 0.01)
		expect(entry.rect.y).toBeGreaterThanOrEqual(scene.bounds.y - 0.01)
		expect(entry.rect.x + entry.rect.w).toBeLessThanOrEqual(scene.bounds.x + scene.bounds.w + 0.01)
		expect(entry.rect.y + entry.rect.h).toBeLessThanOrEqual(scene.bounds.y + scene.bounds.h + 0.01)
	}
}

/** `BT_PREVIEW=/tmp/dir` writes one SVG per view; off in an ordinary run. */
const PREVIEW_DIR = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BT_PREVIEW
// @ts-ignore node types are deliberately absent from the app's tsconfig; vitest supplies the module.
const nodeFs = PREVIEW_DIR ? (await import('node:fs')) as unknown as { mkdirSync(path: string, options: { recursive: boolean }): void; writeFileSync(path: string, text: string): void } : null

function preview(name: string, scene: BtScene) {
	if (!PREVIEW_DIR || !nodeFs) return
	nodeFs.mkdirSync(PREVIEW_DIR, { recursive: true })
	nodeFs.writeFileSync(`${PREVIEW_DIR}/${name}.svg`, sceneToSvg(scene, { showAllInserts: false }))
}

describe('Tree layout', () => {
	for (const orientation of ['down', 'right'] as const) {
		for (const controlFace of ['expanded', 'compact'] as const) {
			it(`keeps XML order and separates siblings (${orientation}, ${controlFace})`, () => {
				const scene = layoutTree(sample, { orientation, nodeFace: 'simple', controlFace, edgeStyle: orientation === 'down' ? 'straight' : 'elbow' })
				expect(scene.nodes.map((entry) => entry.path)).toEqual(sample.nodes.map((node) => node.path))
				expectNoNodeOverlap(scene)
				expectInsideBounds(scene)
				expect(scene.start).not.toBeNull()
				// Every non-root node has exactly one incoming control wire.
				for (const entry of scene.nodes) {
					expect(scene.edges.filter((edge) => edge.to === entry.path && edge.kind === 'control')).toHaveLength(1)
				}
				const root = scene.nodes[0].rect
				const children = scene.nodes.filter((entry) => entry.node.parentPath === '0').map((entry) => entry.rect)
				if (orientation === 'down') {
					for (const child of children) expect(child.y).toBeGreaterThan(root.y + root.h)
					const xs = children.map((rect) => rect.x)
					expect(xs).toEqual(xs.slice().sort((a, b) => a - b))
				} else {
					for (const child of children) expect(child.x).toBeGreaterThan(root.x + root.w)
					const ys = children.map((rect) => rect.y)
					expect(ys).toEqual(ys.slice().sort((a, b) => a - b))
				}
				preview(`tree-${orientation}-${controlFace}`, scene)
			})
		}
	}

	it('gives an empty tree a Start pill and a root target', () => {
		const empty = selectTree(parseBehaviorTreeXml('<root BTCPP_format="4"><BehaviorTree ID="T"/></root>'), 'T')!
		const scene = layoutTree(empty, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded', edgeStyle: 'straight' })
		expect(scene.start).not.toBeNull()
		expect(scene.inserts.map((insert) => insert.kind)).toEqual(['root'])
	})

	it('port face makes leaves taller than the simple face', () => {
		const simple = layoutTree(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded', edgeStyle: 'straight' })
		const ports = layoutTree(sample, { orientation: 'down', nodeFace: 'port', controlFace: 'expanded', edgeStyle: 'straight' })
		const leaf = (scene: BtScene) => scene.nodes.find((entry) => entry.node.id === 'GraspValid')!.rect
		expect(leaf(ports).h).toBeGreaterThan(leaf(simple).h)
		preview('tree-down-ports', ports)
	})

	// Item 2, Tree view side: d3-hierarchy's separation pass and the per-row
	// flow extent both read leaf size through the same `sizeByPath` map, so a
	// pinned leaf must widen its own row and push its siblings apart by its
	// real box rather than the nodeFace formula's uniform one.
	it('an Expanded-pinned leaf widens its row without overlapping its siblings', () => {
		const target = sample.nodes.find((node) => node.id === 'GraspValid')!
		const scene = layoutTree(sample, {
			orientation: 'down',
			nodeFace: 'simple',
			controlFace: 'expanded',
			edgeStyle: 'straight',
			nodeViewOverrides: { [target.path]: { view: 'expanded', w: 560, h: 380 } },
		})
		const rect = scene.nodes.find((entry) => entry.path === target.path)!.rect
		expect(rect.w).toBe(560)
		expect(rect.h).toBe(380)
		expectNoNodeOverlap(scene)
		expectInsideBounds(scene)
		preview('tree-down-expanded-leaf', scene)
	})

	it('packs an unbalanced tree by contour', () => {
		// A's own subtree is only wide four levels down (0.0.0.0…0.0.0.3); A's
		// own card at depth 1 is as narrow as any control. A span-summing
		// placer pushes B out by A's whole deep span; contour packing tucks B
		// in right beside A's actual card instead.
		const xml = `<root BTCPP_format="4"><BehaviorTree ID="T">
			<Sequence name="Root">
				<Sequence name="A">
					<Sequence>
						<LeafOne/><LeafTwo/><LeafThree/><LeafFour/>
					</Sequence>
				</Sequence>
				<LeafB name="B"/>
				<LeafC name="C"/>
			</Sequence>
		</BehaviorTree>
		<TreeNodesModel>
			<Action ID="LeafOne"/><Action ID="LeafTwo"/><Action ID="LeafThree"/><Action ID="LeafFour"/>
			<Action ID="LeafB"/><Action ID="LeafC"/>
		</TreeNodesModel></root>`
		const unbalanced = selectTree(parseBehaviorTreeXml(xml), 'T')!
		const scene = layoutTree(unbalanced, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded', edgeStyle: 'straight' })
		expect(scene.nodes.map((entry) => entry.path)).toEqual(unbalanced.nodes.map((node) => node.path))
		expectNoNodeOverlap(scene)
		expectInsideBounds(scene)
		const a = scene.nodes.find((entry) => entry.path === '0.0')!.rect
		const b = scene.nodes.find((entry) => entry.path === '0.1')!.rect
		expect(b.x - (a.x + a.w)).toBeLessThanOrEqual(TREE_SIBLING_GAP + 1)
		preview('tree-down-unbalanced', scene)
	})
})

describe('Tree edge styles', () => {
	// '0.1' (Fallback) has two children, so its wires to '0.1.0' and '0.1.1'
	// are never cross-axis-aligned — the shape assertions below would be
	// trivially satisfied (a straight line) by a centred, aligned pair.
	for (const orientation of ['down', 'right'] as const) {
		const down = orientation === 'down'
		const cross = (point: BtPoint) => (down ? point.x : point.y)
		const flow = (point: BtPoint) => (down ? point.y : point.x)

		for (const edgeStyle of BT_EDGE_STYLES) {
			it(`draws a ${edgeStyle} wire from the parent's exit to the child's entry (${orientation})`, () => {
				const scene = layoutTree(sample, { orientation, nodeFace: 'simple', controlFace: 'expanded', edgeStyle })
				const parent = scene.nodes.find((entry) => entry.path === '0.1')!.rect
				const child = scene.nodes.find((entry) => entry.path === '0.1.0')!.rect
				const { from, to } = treeEdgeEndpoints(parent, child, orientation)
				const edge = scene.edges.find((candidate) => candidate.from === '0.1' && candidate.to === '0.1.0')!

				expect(edge.points[0]).toEqual(from)
				expect(edge.points[edge.points.length - 1]).toEqual(to)

				if (edgeStyle === 'straight') {
					expect(edge.points).toHaveLength(2)
					expect(edge.curve).toBeFalsy()
				} else if (edgeStyle === 'elbow') {
					expect(edge.points).toHaveLength(4)
					expect(edge.curve).toBeFalsy()
				} else if (edgeStyle === 'curved') {
					expect(edge.points).toHaveLength(4)
					expect(edge.curve).toBe(true)
					const [, c1, c2] = edge.points
					// Control points sit on the reading axis: each keeps its
					// nearest endpoint's cross-axis position and only moves
					// halfway along the flow axis, so the axis is never guessed.
					expect(cross(c1)).toBeCloseTo(cross(from))
					expect(cross(c2)).toBeCloseTo(cross(to))
					expect(flow(c1)).toBeCloseTo((flow(from) + flow(to)) / 2)
					expect(flow(c2)).toBeCloseTo((flow(from) + flow(to)) / 2)
				} else {
					expect(edgeStyle).toBe('slanted')
					expect(edge.points).toHaveLength(3)
					expect(edge.curve).toBeFalsy()
					const [, stubPoint] = edge.points
					// The stub departs straight along the reading direction from
					// the parent's exit face — same rule as the Slanted arrow.
					expect(cross(stubPoint)).toBeCloseTo(cross(from))
					expect(flow(stubPoint)).toBeGreaterThan(flow(from))
					expect(flow(stubPoint)).toBeLessThan(flow(to))
				}
			})
		}
	}

	it('clamps the slanted stub so a short span (the Start pill) never overshoots the child', () => {
		const empty = selectTree(parseBehaviorTreeXml('<root BTCPP_format="4"><BehaviorTree ID="T"><LeafOnly/></BehaviorTree><TreeNodesModel><Action ID="LeafOnly"/></TreeNodesModel></root>'), 'T')!
		const scene = layoutTree(empty, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded', edgeStyle: 'slanted' })
		const startEdge = scene.edges.find((edge) => edge.to === '0')!
		// The Start→root connector is always a plain straight stub, whatever
		// the control-wire style — only parent→child wires take the style.
		expect(startEdge.points).toHaveLength(2)
	})
})

describe('Process layout', () => {
	for (const orientation of ['down', 'right'] as const) {
		it(`draws the Flowstate grammar without overlaps (${orientation})`, () => {
			const scene = layoutProcess(flowstate, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
			expectNoNodeOverlap(scene)
			expectInsideBounds(scene)
			// Every leaf is drawn exactly once, controls are grammar not cards.
			const leaves = flowstate.nodes.filter((node) => node.kind !== 'control' && node.kind !== 'decorator' && node.id !== 'AlwaysFailure')
			expect(scene.nodes.map((entry) => entry.path)).toEqual(leaves.map((node) => node.path))
			expect(scene.groups.map((group) => group.title)).toEqual(['Initialize Workcell', 'Pull Part Kit'])
			expect(scene.rails.map((rail) => rail.kind)).toEqual(['fork', 'join'])
			expect(scene.chips.filter((chip) => chip.kind === 'failure')).toHaveLength(2)
			expect(scene.chips.filter((chip) => chip.kind === 'fail')).toHaveLength(1)
			// The three parallel lanes keep XML order across the flow.
			const laneFirsts = ['0.0.0.0.0', '0.0.0.1.0', '0.0.0.2.0'].map((path) => scene.nodes.find((entry) => entry.path === path)!.rect)
			const across = laneFirsts.map((rect) => (orientation === 'down' ? rect.x : rect.y))
			expect(across).toEqual(across.slice().sort((a, b) => a - b))
			// A recovery lane sits on the recovery side of its primary.
			const primary = scene.nodes.find((entry) => entry.path === '0.0.0.0.2.0')!.rect
			const recovery = scene.nodes.find((entry) => entry.path === '0.0.0.0.2.1.0')!.rect
			if (orientation === 'down') expect(recovery.x).toBeGreaterThan(primary.x + primary.w)
			else expect(recovery.y + recovery.h).toBeLessThan(primary.y)
			preview(`process-${orientation}`, scene)
		})
	}

	// Zach's literal PickAndPlace board (2026-09-05, failure-branch-formatting):
	// a FLAT Fallback with two recovery arms. Nesting cascades on its own (each
	// deeper Fallback starts inside its parent's arm), but sibling arms of one
	// Fallback only cascade because `laneBoxFlow` is per-lane — every arm's box
	// one unit below the Failure line that feeds it, that line leaving the
	// previous arm at its mid-height. With one shared box height the 2nd arm's
	// Failure corner sat INSIDE its first card, entering from below, with the
	// chip half-hidden under the card.
	describe('flat multi-arm Fallback (his literal PickAndPlace shape)', () => {
		const flatXml = `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<Fallback name="Grasp or correct">
				<MoveHome/>
				<GraspValid/>
				<Sequence><CorrectGrip/><GraspValid/></Sequence>
			</Fallback>
			<CloseGrip/>
		</Sequence></BehaviorTree></root>`
		const flat = selectTree(parseBehaviorTreeXml(flatXml), 'T')!

		it('enters every arm from above, through its top face, by exactly one unit', () => {
			for (const orientation of ['down', 'right'] as const) {
				const scene = layoutProcess(flat, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				const flowAxis = orientation === 'down' ? 'y' : 'x'
				const failures = scene.edges.filter((edge) => edge.kind === 'recovery')
				expect(failures).toHaveLength(2)
				for (const edge of failures) {
					const [, corner, entry] = edge.points
					// The turn-down drops one PROCESS_GAP unit INTO the arm's entry —
					// never rises out of it (the equal-height regression made
					// entry − corner negative for the second arm).
					expect(entry[flowAxis] - corner[flowAxis]).toBeCloseTo(PROCESS_GAP, 5)
				}
				// And with the entries clear, no Failure chip hides under a card.
				for (const chip of scene.chips.filter((entry) => entry.kind === 'failure')) {
					for (const node of scene.nodes) {
						const overlapsX = chip.rect.x + chip.rect.w > node.rect.x && chip.rect.x < node.rect.x + node.rect.w
						const overlapsY = chip.rect.y + chip.rect.h > node.rect.y && chip.rect.y < node.rect.y + node.rect.h
						expect(overlapsX && overlapsY, `chip ${chip.id} hides under ${node.path}`).toBe(false)
					}
				}
				expectNoNodeOverlap(scene)
				preview(`process-flat-multi-arm-${orientation}`, scene)
			}
		})
	})

	it('lays out the sample with a persistent end target', () => {
		const scene = layoutProcess(sample, { orientation: 'right', nodeFace: 'simple', controlFace: 'expanded' })
		expectNoNodeOverlap(scene)
		expect(scene.inserts.some((insert) => insert.kind === 'end' && insert.persistent)).toBe(true)
		preview('process-sample-right', scene)
		preview('process-sample-down', layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' }))
	})

	// Item 2: a leaf pinned to Expanded (or a hand-resized Port card) is no
	// longer the nodeFace-formula size — the rail, the lane and the merge
	// line around it must all react to its real box instead of assuming
	// every leaf shares one uniform footprint.
	it('grows the scene around a leaf pinned to an Expanded box, without resizing its siblings', () => {
		const target = sample.nodes.find((node) => node.id === 'GraspValid')!
		const uniform = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const override = { view: 'expanded', w: 560, h: 380 }
		const expanded = layoutProcess(sample, {
			orientation: 'down',
			nodeFace: 'simple',
			controlFace: 'expanded',
			nodeViewOverrides: { [target.path]: override },
		})
		const overriddenRect = expanded.nodes.find((entry) => entry.path === target.path)!.rect
		expect(overriddenRect.w).toBe(override.w)
		expect(overriddenRect.h).toBe(override.h)
		expectNoNodeOverlap(expanded)
		expectInsideBounds(expanded)
		// The override is strictly bigger than the formula's simple-face card,
		// so the scene it sits in must be at least that much bigger too — the
		// whole point of "autosize everything correctly" rather than clipping
		// or overlapping a sibling.
		expect(expanded.bounds.h).toBeGreaterThan(uniform.bounds.h)
		// A sibling leaf never carries the override and keeps the uniform,
		// nodeFace-formula size — only the pinned leaf grows.
		const siblingPath = uniform.nodes.find((entry) => entry.role === 'leaf' && entry.path !== target.path)!.path
		const siblingBefore = uniform.nodes.find((entry) => entry.path === siblingPath)!.rect
		const siblingAfter = expanded.nodes.find((entry) => entry.path === siblingPath)!.rect
		expect(siblingAfter.w).toBe(siblingBefore.w)
		expect(siblingAfter.h).toBe(siblingBefore.h)
		preview('process-expanded-leaf', expanded)
	})

	// CORRECTED 2026-09-06 — Zach's own 2026-09-05 ruling was that a Fallback/
	// Branch recovery arm "just becomes another sequential branch that you can
	// begin to stack skills … on," so its terminus should get the same
	// always-visible "+" a Sequence's own tail gets. That held for one flat
	// arm; once his literal PickAndPlace board had multiple arms plus a node
	// inside a recovery arm growing its OWN recovery arm, every arm at every
	// level lighting its own always-on "+" simultaneously is exactly the bug
	// he reported ("every single insert icon is visible... the only icon that
	// should show by default is the one at the bottom"). A lane's own
	// terminus now hover-reveals like any other interior gap — only the
	// outermost tree's `id: 'end'` insert (see the test above) stays
	// persistent. `afterPath` still lands on the arm's deepest last-in-flow
	// node so `insertBehaviorTreeSibling` (btcppXml.ts) knows what to grow.
	it('gives every Fallback recovery lane a hover-reveal terminus insert', () => {
		// The sample's `CorrectGrip` arm is a bare leaf — no Sequence yet.
		const scene = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const correctGrip = sample.nodes.find((node) => node.id === 'CorrectGrip')!
		const bareLeafInsert = scene.inserts.find((insert) => insert.afterPath === correctGrip.path)
		expect(bareLeafInsert?.kind).toBe('end')
		expect(bareLeafInsert?.persistent).toBe(false)

		// Flowstate's "Pull Part Kit" Fallback already grew a recovery
		// Sequence of two steps — the terminus must be the chain's last
		// node, not the Sequence wrapper, or a click there would double-wrap.
		const fallbacks = flowstate.nodes.filter((node) => node.controlKind === 'fallback')
		const chainFallback = fallbacks.find((node) => {
			const arm = node.children[1]
			return arm?.controlKind === 'sequence' && !arm.children.some((child) => child.id === 'AlwaysFailure')
		})!
		const chainArm = chainFallback.children[1]
		expect(chainArm.children.length).toBeGreaterThan(1)
		const lastOfChain = chainArm.children.at(-1)!
		const chainScene = layoutProcess(flowstate, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const chainInsert = chainScene.inserts.find((insert) => insert.afterPath === lastOfChain.path)
		expect(chainInsert?.kind).toBe('end')
		expect(chainInsert?.persistent).toBe(false)
		// It must not also offer to grow the arm from the Sequence wrapper —
		// that would insert as if the arm were still a bare leaf.
		expect(chainScene.inserts.some((insert) => insert.afterPath === chainArm.path)).toBe(false)
	})

	// Zach's before/after mockups, 2026-09-05: the Failure edge must turn
	// down into the TOP of the recovery arm's first node — the same face
	// every other node-to-node connection enters from — with real vertical
	// room for a "+" that prepends before that node, the mirror of the
	// terminus insert above. That "+" hover-reveals (see the CORRECTED note
	// above) rather than staying always-on.
	it('turns the Failure edge down into the top of the recovery arm, with a hover-reveal prepend insert in the gap', () => {
		const scene = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const correctGrip = sample.nodes.find((node) => node.id === 'CorrectGrip')!
		const correctGripRect = scene.nodes.find((entry) => entry.path === correctGrip.path)!.rect

		const failureEdge = scene.edges.find((edge) => edge.id === '0.1:failure:0')!
		expect(failureEdge.points).toHaveLength(3)
		const [start, corner, entry] = failureEdge.points
		// Leg 1 runs across (same height as the Failure line); leg 2 turns
		// straight down into the node's top-center — never a diagonal graft
		// into its side.
		expect(corner.y).toBeCloseTo(start.y, 5)
		expect(corner.x).toBeCloseTo(entry.x, 5)
		expect(entry.y).toBeGreaterThan(corner.y)
		expect(entry).toEqual({ x: correctGripRect.x + correctGripRect.w / 2, y: correctGripRect.y })
		// Real vertical room for the prepend "+" to live in, not a graft.
		expect(entry.y - corner.y).toBeCloseTo(PROCESS_GAP, 5)

		const prependInsert = scene.inserts.find((insert) => insert.beforePath === correctGrip.path)
		expect(prependInsert?.kind).toBe('start')
		expect(prependInsert?.persistent).toBe(false)
		// It sits in the gap the turn just opened, not on top of either end.
		expect(prependInsert!.at.y).toBeGreaterThan(corner.y)
		expect(prependInsert!.at.y).toBeLessThan(entry.y)

		expectNoNodeOverlap(scene)
		expectInsideBounds(scene)
		preview('process-recovery-rail-down', scene)
	})

	it('gives an already-sequential recovery arm the prepend insert on its actual first node, not the Sequence wrapper', () => {
		const fallbacks = flowstate.nodes.filter((node) => node.controlKind === 'fallback')
		const chainFallback = fallbacks.find((node) => {
			const arm = node.children[1]
			return arm?.controlKind === 'sequence' && !arm.children.some((child) => child.id === 'AlwaysFailure')
		})!
		const chainArm = chainFallback.children[1]
		const firstOfChain = chainArm.children[0]
		const scene = layoutProcess(flowstate, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const prependInsert = scene.inserts.find((insert) => insert.beforePath === firstOfChain.path)
		expect(prependInsert?.kind).toBe('start')
		expect(prependInsert?.persistent).toBe(false)
		expect(scene.inserts.some((insert) => insert.beforePath === chainArm.path)).toBe(false)
	})

	// The gap between Start and whatever is currently the root sequence's
	// first child gets a prepend insert too, but — Zach's follow-up correction,
	// 2026-09-05 — it is an interior gap like any other, so it hover-reveals
	// same as the rest rather than staying always-on the way the sequence's
	// own persistent termini do.
	it('gives the gap between Start and the root sequence\'s first child a hover-reveal prepend insert', () => {
		const scene = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const firstChild = sample.root!.children[0]
		expect(firstChild.subtreeId).toBe('MoveToObj')
		const startInsert = scene.inserts.find((insert) => insert.id === 'start')
		expect(startInsert?.kind).toBe('start')
		expect(startInsert?.persistent).toBe(false)
		expect(startInsert?.beforePath).toBe(firstChild.path)
	})

	it('the Start prepend insert works generally, even when the root is not yet a Sequence', () => {
		const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><Wave/></BehaviorTree></root>'
		const bareLeafRoot = selectTree(parseBehaviorTreeXml(xml), 'T')!
		const scene = layoutProcess(bareLeafRoot, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const startInsert = scene.inserts.find((insert) => insert.id === 'start')
		// The root itself isn't sequence-like, so the target is the root's
		// own path — insertBehaviorTreeSibling then wraps it in a fresh
		// Sequence, same as any other prepend onto a bare leaf.
		expect(startInsert?.beforePath).toBe(bareLeafRoot.root!.path)
	})

	it('a control node ignores nodeViewOverrides — only leaves may be pinned', () => {
		const control = sample.nodes.find((node) => node.kind === 'control')!
		const scene = layoutProcess(sample, {
			orientation: 'down',
			nodeFace: 'simple',
			controlFace: 'expanded',
			nodeViewOverrides: { [control.path]: { view: 'expanded', w: 560, h: 380 } },
		})
		// Controls in Process view are grammar (rails/lanes/groups), not cards —
		// this asserts the override is simply inert for a control path, not
		// that it silently produced a mis-shaped card.
		expect(scene.nodes.some((entry) => entry.path === control.path)).toBe(false)
	})

	// Zach's 2026-09-05 ask: a node that already sits inside a Fallback's own
	// recovery arm must be able to grow its OWN failure branch, at any depth
	// — "once you start a new failure loop, if that failure loop fails, you
	// should be able to also make a failure branch from a node that already
	// has a failure branch." Nothing in `lanesWithRecovery`/`buildItem` is
	// hardcoded to one level — a nested Fallback is just another `Item`, laid
	// out and inserted into exactly like any other recovery-arm node — so
	// this proves that recursion holds at 2 and 3 levels, not only 1.
	describe.each([2, 3])('a Fallback nested %d levels inside another Fallback\'s recovery arm', (depth) => {
		const nested = selectTree(parseBehaviorTreeXml(nestedFallbackXml(depth)), 'T')!

		it('renders every level\'s own rail without overlap, in both orientations', () => {
			for (const orientation of ['down', 'right'] as const) {
				const scene = layoutProcess(nested, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				expectNoNodeOverlap(scene)
				expectInsideBounds(scene)
				// One "Failure" chip per nesting level — each level's own edge.
				expect(scene.chips.filter((chip) => chip.kind === 'failure')).toHaveLength(depth)
				// Every guard, the deepest leaf, and the node after the whole
				// chain are all drawn exactly once — nothing lost or duplicated
				// by the recursion.
				const drawn = new Set(scene.nodes.map((entry) => entry.path))
				for (let level = 0; level < depth; level += 1) {
					expect(drawn.has(`${nestedFallbackPath(level)}.0`)).toBe(true)
				}
				expect(drawn.has(`${nestedFallbackPath(depth - 1)}.1`)).toBe(true)
				expect(drawn.has('0.1')).toBe(true)
				preview(`process-nested-fallback-depth${depth}-${orientation}`, scene)
			}
		})

		it('gives every nesting level its own hover-reveal terminus and prepend insert, converging back correctly', () => {
			const scene = layoutProcess(nested, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			for (let level = 0; level < depth; level += 1) {
				const fallbackPath = nestedFallbackPath(level)
				// The recovery child is the next nested Fallback (or, at the
				// deepest level, the bare `Leaf`) — either way it is not itself
				// sequence-like yet, so both inserts target it directly.
				const recoveryChildPath = `${fallbackPath}.1`
				const terminus = scene.inserts.find((insert) => insert.id === `lane-end:${fallbackPath}:0`)
				expect(terminus?.kind).toBe('end')
				// CORRECTED 2026-09-06: every nesting level's own terminus
				// hover-reveals now — see the "hover-reveal terminus insert"
				// test above for why a per-arm persistent "+" was reverted.
				// With nesting, the old always-on rule meant EVERY level lit its
				// own "+" at once, which is exactly what Zach's literal board
				// showed him was wrong.
				expect(terminus?.persistent).toBe(false)
				expect(terminus?.afterPath).toBe(recoveryChildPath)
				const prepend = scene.inserts.find((insert) => insert.id === `lane-start:${fallbackPath}:0`)
				expect(prepend?.kind).toBe('start')
				expect(prepend?.persistent).toBe(false)
				expect(prepend?.beforePath).toBe(recoveryChildPath)
			}
			// The deepest level's merge line returns to ITS parent Fallback's
			// rail, which returns to ITS parent's, and so on up to the root —
			// never a single merge line short-circuiting past an intermediate
			// level. One `:merge:rail` edge per nesting level.
			const railMerges = scene.edges.filter((edge) => edge.id.endsWith(':merge:rail'))
			expect(railMerges).toHaveLength(depth)
			for (let level = 0; level < depth; level += 1) {
				expect(railMerges.some((edge) => edge.id === `${nestedFallbackPath(level)}:merge:rail`)).toBe(true)
			}
		})

		// Zach rejected BOTH earlier terminus placements on one annotated
		// screenshot (2026-09-05): the "+" exactly on the arm's own merge
		// corner, AND the "+" offset along the corner's horizontal leg — a
		// cross-axis line through a sequential "+". The rule that replaced
		// them: every terminus "+" sits centered in the first PROCESS_GAP
		// unit of the arm's own straight flow-direction drop toward the
		// merge line, which the layout guarantees exists (the merge sits a
		// full unit below the DEEPEST lane). This asserts that geometry
		// directly, at every nesting level, in both orientations.
		it('hosts every terminus insert on the arm\'s own flow-direction drop, clear of both corners', () => {
			for (const orientation of ['down', 'right'] as const) {
				const scene = layoutProcess(nested, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				const termini = scene.inserts.filter((insert) => insert.kind === 'end' && insert.afterPath)
				expect(termini).toHaveLength(depth)
				for (const insert of termini) {
					// The merge polyline this "+" lives on: its first point is the
					// arm's exit, its second the elbow at the merge line's level.
					const mergeEdge = scene.edges.find((edge) =>
						edge.kind === 'merge' &&
						!edge.id.endsWith(':merge:rail') &&
						(orientation === 'down'
							? Math.abs(edge.points[0].x - insert.at.x) < 0.5 && edge.points[0].y < insert.at.y && edge.points[1].y > insert.at.y
							: Math.abs(edge.points[0].y - insert.at.y) < 0.5 && edge.points[0].x < insert.at.x && edge.points[1].x > insert.at.x))
					expect(mergeEdge, `terminus ${insert.id} sits on no merge drop`).toBeTruthy()
					const [exit, elbow] = mergeEdge!.points
					const flowAxis = orientation === 'down' ? 'y' : 'x'
					const crossAxis = orientation === 'down' ? 'x' : 'y'
					// Centered in the first unit of the drop, on the drop's own line.
					expect(insert.at[crossAxis]).toBeCloseTo(exit[crossAxis], 5)
					expect(insert.at[flowAxis] - exit[flowAxis]).toBeCloseTo(PROCESS_GAP / 2, 5)
					// Both the arm's exit (a junction for a nested-Fallback arm) and
					// the merge elbow stay outside the icon's own box.
					const half = PROCESS_INSERT_SIZE / 2
					expect(insert.at[flowAxis] - half).toBeGreaterThan(exit[flowAxis])
					expect(insert.at[flowAxis] + half).toBeLessThan(elbow[flowAxis])
					// And the icon's box must not overlap any node's card either.
					for (const node of scene.nodes) {
						const overlapsX = insert.at.x + half > node.rect.x && insert.at.x - half < node.rect.x + node.rect.w
						const overlapsY = insert.at.y + half > node.rect.y && insert.at.y - half < node.rect.y + node.rect.h
						expect(overlapsX && overlapsY, `insert ${insert.id} overlaps node ${node.path}`).toBe(false)
					}
				}
			}
		})

		// Zach's annotated mockup (2026-09-05, "Note the arrow ends"): every
		// landing on a convergence is marked with an arrowhead pointing into
		// it — a head where each arm's drop meets the merge line, ONE head
		// where the single merge run meets the rail junction — while the
		// primary rail's own drop stays headless (it IS the line the arms
		// merge into, continuing straight through).
		it('marks every convergence landing with an arrowhead, at every nesting level', () => {
			for (const orientation of ['down', 'right'] as const) {
				const scene = layoutProcess(nested, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				const flowAxis = orientation === 'down' ? 'y' : 'x'
				const crossAxis = orientation === 'down' ? 'x' : 'y'
				for (let level = 0; level < depth; level += 1) {
					const fallbackPath = nestedFallbackPath(level)
					const rail = scene.edges.find((edge) => edge.id === `${fallbackPath}:merge:rail`)!
					const run = scene.edges.find((edge) => edge.id === `${fallbackPath}:merge:run`)!
					const drops = scene.edges.filter((edge) => edge.id.startsWith(`${fallbackPath}:merge:`) && edge !== rail && edge !== run)
					expect(drops.length).toBeGreaterThan(0)
					// The main line continues through the junction unmarked…
					expect(rail.arrowEnd).toBe(false)
					// …the single run arrives at that junction marked, along the
					// cross axis, ending exactly where the rail's drop ends.
					expect(run.arrowEnd).toBe(true)
					expect(run.points).toHaveLength(2)
					expect(run.points[0][flowAxis]).toBeCloseTo(run.points[1][flowAxis], 5)
					expect(run.points[1]).toEqual(rail.points[rail.points.length - 1])
					const runSpan = [run.points[0][crossAxis], run.points[1][crossAxis]].sort((a, b) => a - b)
					for (const drop of drops) {
						// Each arm's drop is straight along the flow axis and lands
						// ON the run, arrowhead at the landing.
						expect(drop.arrowEnd).toBe(true)
						expect(drop.points).toHaveLength(2)
						expect(drop.points[0][crossAxis]).toBeCloseTo(drop.points[1][crossAxis], 5)
						expect(drop.points[1][flowAxis]).toBeCloseTo(run.points[0][flowAxis], 5)
						expect(drop.points[1][crossAxis]).toBeGreaterThanOrEqual(runSpan[0] - 1e-5)
						expect(drop.points[1][crossAxis]).toBeLessThanOrEqual(runSpan[1] + 1e-5)
					}
				}
			}
		})
	})

	// Zach's ruling, 2026-09-05: the single trunk line above the fork bar and
	// below the join bar must be the TRUE center of the branches — not the
	// old `(firstRail + lastRail) / 2`, which only ever looked at the outer
	// two lanes and silently ignored everyone in between. Odd count must
	// land exactly on the middle lane's own real center; even count exactly
	// between the two middle lanes' real centers — in both cases read off
	// each lane's ACTUAL measured width, not an index-based guess at a
	// uniform one.
	describe('Parallel join centering', () => {
		function parallelXml(labels: string[]): string {
			const leaves = labels.map((label, index) => `<Leaf${index} name=${JSON.stringify(label)}/>`).join('\n')
			const actions = labels.map((_, index) => `<Action ID="Leaf${index}"/>`).join('')
			return `<root BTCPP_format="4"><BehaviorTree ID="T"><Parallel success_count="-1" failure_count="1">\n${leaves}\n</Parallel></BehaviorTree><TreeNodesModel>${actions}</TreeNodesModel></root>`
		}

		/** The trunk's x: both the Start→root and root→end edges use the same
		 * `rail`, so either reads it back off the painted scene. */
		function trunkX(scene: BtScene): { entry: number; exit: number } {
			return {
				entry: scene.edges.find((edge) => edge.id === 'start→root')!.points[1].x,
				exit: scene.edges.find((edge) => edge.id === 'root→end')!.points[0].x,
			}
		}

		function laneCentersX(scene: BtScene, tree: ReturnType<typeof selectTree>): number[] {
			return tree!.root!.children.map((leaf) => {
				const rect = scene.nodes.find((entry) => entry.path === leaf.path)!.rect
				return rect.x + rect.w / 2
			})
		}

		it('lands exactly on the middle lane for three branches of genuinely different widths', () => {
			// The two OUTER lanes must differ from each other (not just from the
			// middle one) — two short labels both floor out at the same minimum
			// card width and would make the old, buggy average of the outer two
			// coincidentally correct. 'Go' floors out; the third label does not.
			const tree = selectTree(parseBehaviorTreeXml(parallelXml(['Go', 'Mid', 'A Considerably Longer Third Branch Name For Real Width'])), 'T')
			const scene = layoutProcess(tree!, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const centers = laneCentersX(scene, tree)
			// Confirm the three leaves really do carry different measured
			// widths — otherwise this would not be testing real sizing at all.
			const widths = tree!.root!.children.map((leaf) => scene.nodes.find((entry) => entry.path === leaf.path)!.rect.w)
			expect(new Set(widths).size).toBeGreaterThan(1)
			const trunk = trunkX(scene)
			expect(trunk.entry).toBeCloseTo(trunk.exit, 5)
			expect(trunk.entry).toBeCloseTo(centers[1], 5)
			// The old bug: averaging only the outer two lanes. Assert the fix
			// actually diverges from that wrong answer for this asymmetric case.
			expect(trunk.entry).not.toBeCloseTo((centers[0] + centers[2]) / 2, 1)
			expectNoNodeOverlap(scene)
			preview('process-parallel-center-odd', scene)
		})

		it('lands exactly between the two middle lanes for four branches, never on any single one', () => {
			const tree = selectTree(parseBehaviorTreeXml(parallelXml(['Go', 'Somewhat Longer Name', 'Mid', 'A Very Long Skill Name Indeed'])), 'T')
			const scene = layoutProcess(tree!, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const centers = laneCentersX(scene, tree)
			const trunk = trunkX(scene)
			expect(trunk.entry).toBeCloseTo(trunk.exit, 5)
			expect(trunk.entry).toBeCloseTo((centers[1] + centers[2]) / 2, 5)
			// Not expected to land on any single lane when the count is even —
			// that's the correct behavior, not a bug, per Zach's own reasoning.
			for (const center of centers) expect(Math.abs(trunk.entry - center)).toBeGreaterThan(0.5)
			expectNoNodeOverlap(scene)
			preview('process-parallel-center-even', scene)
		})

		it('follows a branch pinned to a real Expanded box, not the simple-face formula', () => {
			const tree = selectTree(parseBehaviorTreeXml(parallelXml(['Simple One', 'Simple Two', 'Simple Three'])), 'T')
			const middle = tree!.root!.children[1]
			const override = { view: 'expanded', w: 900, h: 64 }
			const uniform = layoutProcess(tree!, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const mixed = layoutProcess(tree!, {
				orientation: 'down',
				nodeFace: 'simple',
				controlFace: 'expanded',
				nodeViewOverrides: { [middle.path]: override },
			})
			const overriddenRect = mixed.nodes.find((entry) => entry.path === middle.path)!.rect
			expect(overriddenRect.w).toBe(override.w)
			// The trunk in the mixed scene must track the override's real
			// center, not the uniform scene's index-based guess.
			const mixedCenters = laneCentersX(mixed, tree)
			const mixedTrunk = trunkX(mixed)
			expect(mixedTrunk.entry).toBeCloseTo(mixedCenters[1], 5)
			expect(mixedTrunk.entry).not.toBeCloseTo(trunkX(uniform).entry, 1)
			expectNoNodeOverlap(mixed)
			preview('process-parallel-center-mixed-width', mixed)
		})

		it('shifts the middle lane\'s trunk position when an OUTER lane\'s real width changes — sizing of the other nodes matters', () => {
			const narrowOuter = selectTree(parseBehaviorTreeXml(parallelXml(['Go', 'Middle Branch', 'Mid'])), 'T')!
			const wideOuter = selectTree(parseBehaviorTreeXml(parallelXml(['A Much Wider First Branch Name', 'Middle Branch', 'Mid'])), 'T')!
			const narrowScene = layoutProcess(narrowOuter, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const wideScene = layoutProcess(wideOuter, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			// Both are still exactly centered on their own middle lane...
			expect(trunkX(narrowScene).entry).toBeCloseTo(laneCentersX(narrowScene, narrowOuter)[1], 5)
			expect(trunkX(wideScene).entry).toBeCloseTo(laneCentersX(wideScene, wideOuter)[1], 5)
			// ...but the absolute trunk x moved, because the middle lane's own
			// cumulative offset shifted with the wider lane before it — the
			// "depends on the sizing of the other nodes" Zach called out.
			expect(trunkX(wideScene).entry).not.toBeCloseTo(trunkX(narrowScene).entry, 1)
		})

		// Zach's ruling, 2026-09-05: a Parallel keeps splitting, so every gap
		// BETWEEN two existing branches — not the branches themselves, not
		// either outer edge — gets its own hover-reveal "+" to insert a new
		// branch right there. N branches means exactly N-1 of these.
		describe.each([2, 3, 4])('with %d branches', (count) => {
			const labels = Array.from({ length: count }, (_, index) => `Branch ${index}`)
			const tree = selectTree(parseBehaviorTreeXml(parallelXml(labels)), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const betweenInserts = scene.inserts.filter((insert) => insert.id.startsWith(`between:${tree.root!.path}:`))

			it(`offers exactly ${count - 1} between-branch insert${count - 1 === 1 ? '' : 's'}`, () => {
				expect(betweenInserts).toHaveLength(count - 1)
				// Every one is hover-reveal (Process view's established
				// convention for interior, non-terminal inserts), never
				// always-visible.
				expect(betweenInserts.every((insert) => insert.persistent === false)).toBe(true)
				expect(betweenInserts.every((insert) => insert.kind === 'between')).toBe(true)
			})

			it('sits in the true midpoint of its own gap, and targets the right insertion index', () => {
				const centers = laneCentersX(scene, tree)
				for (let index = 1; index < count; index += 1) {
					const insert = betweenInserts.find((candidate) => candidate.index === index)!
					expect(insert, `missing between-insert before lane ${index}`).toBeTruthy()
					expect(insert.parentPath).toBe(tree.root!.path)
					// The gap's true midpoint sits `PROCESS_GAP / 2` off each
					// neighbor's own edge, not their centers — using each lane's
					// real measured width, exactly like the trunk fix above.
					const leftRect = scene.nodes.find((entry) => entry.path === tree.root!.children[index - 1].path)!.rect
					const rightRect = scene.nodes.find((entry) => entry.path === tree.root!.children[index].path)!.rect
					const expectedX = leftRect.x + leftRect.w + PROCESS_GAP / 2
					expect(insert.at.x).toBeCloseTo(expectedX, 5)
					expect(insert.at.x).toBeCloseTo(rightRect.x - PROCESS_GAP / 2, 5)
					// Never on top of a lane's own center, and always strictly
					// between the two lanes it splits.
					expect(insert.at.x).toBeGreaterThan(centers[index - 1])
					expect(insert.at.x).toBeLessThan(centers[index])
				}
			})
		})

		it('inserting at a between-branch index actually adds a new branch at that exact position', () => {
			const xml = parallelXml(['First', 'Second', 'Third'])
			const tree = selectTree(parseBehaviorTreeXml(xml), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			const insert = scene.inserts.find((candidate) => candidate.id === `between:${tree.root!.path}:1`)!
			expect(insert.parentPath).toBe(tree.root!.path)
			const result = insertBehaviorTreeNode(xml, 'T', insert.parentPath, insert.index, { id: 'NewSkill', kind: 'action' })
			expect(result.ok).toBe(true)
			if (!result.ok) return
			const after = selectTree(parseBehaviorTreeXml(result.xml), 'T')!
			// The new leaf landed strictly between First and Second, not
			// appended at the end or prepended at the start.
			expect(after.root!.children.map((child) => child.id)).toEqual(['Leaf0', 'NewSkill', 'Leaf1', 'Leaf2'])
		})
	})

	// RecoveryNode (Nav2's control extension, verified against
	// nav2_behavior_tree/plugins/control/recovery_node.cpp, 2026-09-06): the
	// only node in this whole layout engine where a child's SUCCESS re-enters
	// an earlier sibling rather than converging forward past it. Every other
	// invariant in this file assumes flow only ever goes one way — these
	// tests are exactly about the one deliberate exception.
	describe('RecoveryNode (the one backward wire in this layout engine)', () => {
		function recoveryAsRoot(retries = '3'): string {
			return `<root BTCPP_format="4"><BehaviorTree ID="T">
				<RecoveryNode number_of_retries="${retries}" name="ComputePathToPose">
					<PlanPath target="{target}" path="{path}"/>
					<Sequence>
						<CheckCostmap/>
						<ClearCostmap/>
					</Sequence>
				</RecoveryNode>
			</BehaviorTree>
			<TreeNodesModel>
				<Action ID="PlanPath"><input_port name="target"/><output_port name="path"/></Action>
				<Condition ID="CheckCostmap"/>
				<Action ID="ClearCostmap"/>
			</TreeNodesModel></root>`
		}
		function recoveryNested(): string {
			return `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
				<RecoveryNode number_of_retries="3" name="ComputePathToPose">
					<PlanPath target="{target}" path="{path}"/>
					<Sequence>
						<CheckCostmap/>
						<ClearCostmap/>
					</Sequence>
				</RecoveryNode>
				<FollowPath path="{path}"/>
			</Sequence></BehaviorTree>
			<TreeNodesModel>
				<Action ID="PlanPath"><input_port name="target"/><output_port name="path"/></Action>
				<Condition ID="CheckCostmap"/>
				<Action ID="ClearCostmap"/>
				<Action ID="FollowPath"><input_port name="path"/></Action>
			</TreeNodesModel></root>`
		}

		for (const orientation of ['down', 'right'] as const) {
			it(`draws a genuinely backward loop-back wire, landing exactly where the incoming wire lands (${orientation})`, () => {
				const tree = selectTree(parseBehaviorTreeXml(recoveryAsRoot('4')), 'T')!
				const scene = layoutProcess(tree, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				expectNoNodeOverlap(scene)
				expectInsideBounds(scene)

				const loop = scene.edges.find((edge) => edge.kind === 'retryLoop')!
				expect(loop).toBeDefined()
				expect(loop.from).toBe('0.1') // the recovery step
				expect(loop.to).toBe('0.0') // back to the primary step
				// It lands exactly where Start's own wire lands — the same
				// entry junction, because retrying really does mean "as if
				// this were the very first tick again."
				const startEdge = scene.edges.find((edge) => edge.id === 'start→root')!
				expect(loop.points[loop.points.length - 1]).toEqual(startEdge.points[startEdge.points.length - 1])

				// The one edge anywhere in this scene whose flow coordinate
				// (canvas y when down, x when right) decreases somewhere.
				const flowOf = (point: BtPoint) => (orientation === 'down' ? point.y : point.x)
				const loopGoesBackward = loop.points.slice(1).some((point, index) => flowOf(point) < flowOf(loop.points[index]) - 0.01)
				expect(loopGoesBackward).toBe(true)
				for (const edge of scene.edges) {
					if (edge.kind === 'retryLoop') continue
					for (let i = 1; i < edge.points.length; i += 1) {
						expect(flowOf(edge.points[i])).toBeGreaterThanOrEqual(flowOf(edge.points[i - 1]) - 0.01)
					}
				}
				preview(`process-recovery-${orientation}`, scene)
			})
		}

		it('fans the recovery step out to two destinations: loop back on its success, merge forward on its own failure', () => {
			const tree = selectTree(parseBehaviorTreeXml(recoveryAsRoot('4')), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			expect(scene.chips.some((chip) => chip.kind === 'failure')).toBe(true)
			expect(scene.chips.some((chip) => chip.kind === 'decorator' && chip.text === 'Retry ×4')).toBe(true)
			// merge:rail (primary's own straight-through) + merge:recovery
			// (the recovery step's own failure) both reuse Fallback's 'merge'.
			expect(scene.edges.filter((edge) => edge.kind === 'merge')).toHaveLength(2)
			expect(scene.edges.filter((edge) => edge.kind === 'recovery')).toHaveLength(1)
			expect(scene.edges.filter((edge) => edge.kind === 'retryLoop')).toHaveLength(1)
		})

		it('nests correctly beside a real sibling, without disturbing the surrounding Sequence', () => {
			const tree = selectTree(parseBehaviorTreeXml(recoveryNested()), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			expectNoNodeOverlap(scene)
			expectInsideBounds(scene)
			const leaves = tree.nodes.filter((node) => node.kind !== 'control')
			expect(scene.nodes.map((entry) => entry.path)).toEqual(leaves.map((node) => node.path))
			preview('process-recovery-nested', scene)
		})

		it('draws the primary alone with a persistent prompt when the recovery step is missing yet', () => {
			const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><RecoveryNode><A/></RecoveryNode></BehaviorTree><TreeNodesModel><Action ID="A"/></TreeNodesModel></root>'
			const tree = selectTree(parseBehaviorTreeXml(xml), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			expectNoNodeOverlap(scene)
			expectInsideBounds(scene)
			expect(scene.edges.some((edge) => edge.kind === 'retryLoop')).toBe(false)
			const prompt = scene.inserts.find((insert) => insert.id === 'recovery-required:0')!
			expect(prompt.persistent).toBe(true)
			expect(prompt.parentPath).toBe('0')
			expect(prompt.index).toBe(1)
		})

		it('still draws every node when the XML has 3+ children (the arity error), never hiding content', () => {
			const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><RecoveryNode><A/><B/><C/></RecoveryNode></BehaviorTree><TreeNodesModel><Action ID="A"/><Action ID="B"/><Action ID="C"/></TreeNodesModel></root>'
			const tree = selectTree(parseBehaviorTreeXml(xml), 'T')!
			const scene = layoutProcess(tree, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
			expect(scene.nodes.map((entry) => entry.path).sort()).toEqual(['0.0', '0.1', '0.2'])
			expectNoNodeOverlap(scene)
			expectInsideBounds(scene)
			preview('process-recovery-arity-error', scene)
		})
	})
})

/**
 * Zach's three placement rules (2026-09-05), asserted as INVARIANTS over a
 * corpus of tree shapes rather than one assertion per past bug:
 *  1. one spacing unit — every wire entering a node runs exactly PROCESS_GAP
 *     straight, and a plain sequence stacks at exactly PROCESS_GAP;
 *  2. no "+" box ever overlaps a card, chip, or Start;
 *  3. a "+" only ever sits on a single-direction run — never a corner or
 *     junction inside its box, never two line directions through it.
 */
describe('Process insert-placement invariants', () => {
	interface Seg { a: { x: number; y: number }; b: { x: number; y: number }; id: string }

	function sceneSegments(scene: BtScene): Seg[] {
		const segments: Seg[] = []
		for (const edge of scene.edges) {
			for (let i = 1; i < edge.points.length; i += 1) segments.push({ a: edge.points[i - 1], b: edge.points[i], id: `${edge.id}#${i}` })
		}
		for (const rail of scene.rails) segments.push({ a: rail.from, b: rail.to, id: rail.id })
		return segments
	}

	/** Every Process segment is axis-aligned; anything else is itself a bug. */
	function segmentDirection(segment: Seg): 'h' | 'v' | 'point' {
		const dx = Math.abs(segment.a.x - segment.b.x)
		const dy = Math.abs(segment.a.y - segment.b.y)
		if (dx < 0.01 && dy < 0.01) return 'point'
		if (dy < 0.01) return 'h'
		if (dx < 0.01) return 'v'
		throw new Error(`diagonal segment in Process scene: ${segment.id}`)
	}

	function segmentIntersectsBox(segment: Seg, box: BtRect): boolean {
		const minX = Math.min(segment.a.x, segment.b.x)
		const maxX = Math.max(segment.a.x, segment.b.x)
		const minY = Math.min(segment.a.y, segment.b.y)
		const maxY = Math.max(segment.a.y, segment.b.y)
		return minX < box.x + box.w && maxX > box.x && minY < box.y + box.h && maxY > box.y
	}

	function insertBox(at: { x: number; y: number }): BtRect {
		const half = PROCESS_INSERT_SIZE / 2
		return { x: at.x - half, y: at.y - half, w: PROCESS_INSERT_SIZE, h: PROCESS_INSERT_SIZE }
	}

	const corpus: Array<[string, string, string]> = [
		['Flowstate sample', FLOWSTATE_XML, 'RigidBodyAssembly'],
		['MoveIt sample', SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace'],
		['nested Fallback ×2', nestedFallbackXml(2), 'T'],
		['nested Fallback ×3', nestedFallbackXml(3), 'T'],
		['Parallel, mixed widths', `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<Parallel success_count="-1" failure_count="1">
				<Wide name="A Much Wider First Branch Name"/>
				<Fallback><Mid name="Guarded"/><Recover name="Recover"/></Fallback>
				<Narrow name="Go"/>
			</Parallel>
			<After name="After"/>
		</Sequence></BehaviorTree><TreeNodesModel>
			<Action ID="Wide"/><Action ID="Mid"/><Action ID="Recover"/><Action ID="Narrow"/><Action ID="After"/>
		</TreeNodesModel></root>`, 'T'],
		['decorated chain', `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<First name="First"/>
			<Retry num_attempts="3"><Second name="Second"/></Retry>
			<Third name="Third"/>
		</Sequence></BehaviorTree><TreeNodesModel>
			<Action ID="First"/><Action ID="Second"/><Action ID="Third"/>
		</TreeNodesModel></root>`, 'T'],
	]

	for (const [name, xml, treeId] of corpus) {
		for (const orientation of ['down', 'right'] as const) {
			const tree = selectTree(parseBehaviorTreeXml(xml), treeId)!
			const scene = layoutProcess(tree, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
			const segments = sceneSegments(scene)
			const flowAxis = orientation === 'down' ? 'y' : 'x'
			const flowDirection = orientation === 'down' ? 'v' : 'h'

			it(`${name} (${orientation}): every "+" hosts only its own single line direction, no corner inside its box`, () => {
				const byPath = new Map(tree.nodes.map((node) => [node.path, node]))
				for (const insert of scene.inserts) {
					const box = insertBox(insert.at)
					const directions = new Set(
						segments
							.filter((segment) => segmentIntersectsBox(segment, box))
							.map(segmentDirection)
							.filter((direction) => direction !== 'point'),
					)
					// A sequential "+" may only carry the FLOW direction — Zach's
					// rule verbatim: "if you have a top-to-bottom process flow,
					// there should only ever be a top-to-bottom line going through
					// the plus icon ... the icon adds things that are sequential."
					// The one exception is a Parallel's add-a-branch "+", which
					// rides the fork bar (a cross-direction line) by design. Note a
					// single WRONG-direction line still fails here — "at most one
					// direction" alone would have passed the rejected placement on
					// the horizontal merge leg.
					const parent = insert.parentPath ? byPath.get(insert.parentPath) : undefined
					const allowed = parent?.controlKind === 'parallel' ? (flowDirection === 'v' ? 'h' : 'v') : flowDirection
					for (const direction of directions) {
						expect(direction, `insert ${insert.id} carries a ${direction} line; only ${allowed} is allowed`).toBe(allowed)
					}
					expect(directions.size, `insert ${insert.id} has lines of ${[...directions].join('+')} through it`).toBeLessThanOrEqual(1)
					// No polyline vertex, wire terminal or bar end strictly inside
					// the icon's box — a corner under the icon is exactly the bug.
					for (const segment of segments) {
						for (const vertex of [segment.a, segment.b]) {
							const inside =
								vertex.x > box.x + 0.5 && vertex.x < box.x + box.w - 0.5 &&
								vertex.y > box.y + 0.5 && vertex.y < box.y + box.h - 0.5
							expect(inside, `vertex of ${segment.id} sits inside insert ${insert.id}`).toBe(false)
						}
					}
				}
			})

			it(`${name} (${orientation}): no "+" box overlaps a card, chip or Start`, () => {
				const solids: Array<{ label: string; rect: BtRect }> = [
					...scene.nodes.map((entry) => ({ label: `node ${entry.path}`, rect: entry.rect })),
					...scene.chips.map((chip) => ({ label: `chip ${chip.id}`, rect: chip.rect })),
					...(scene.start ? [{ label: 'start', rect: scene.start }] : []),
				]
				for (const insert of scene.inserts) {
					const box = insertBox(insert.at)
					for (const solid of solids) {
						const overlaps =
							box.x < solid.rect.x + solid.rect.w && box.x + box.w > solid.rect.x &&
							box.y < solid.rect.y + solid.rect.h && box.y + box.h > solid.rect.y
						expect(overlaps, `insert ${insert.id} overlaps ${solid.label}`).toBe(false)
					}
				}
			})

			it(`${name} (${orientation}): every wire entering a node runs exactly one unit straight`, () => {
				for (const edge of scene.edges) {
					if (!edge.to) continue
					const last = edge.points[edge.points.length - 1]
					const previous = edge.points[edge.points.length - 2]
					const finalLeg: Seg = { a: previous, b: last, id: edge.id }
					expect(segmentDirection(finalLeg), `edge ${edge.id} enters across the flow`).toBe(flowDirection)
					expect(Math.abs(last[flowAxis] - previous[flowAxis]), `edge ${edge.id} final leg`).toBeCloseTo(PROCESS_GAP, 5)
				}
			})
		}
	}

	it('a plain sequence stacks nodes at exactly one unit, centered, with each hover "+" at the gap midpoint', () => {
		const xml = `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<A name="Alpha"/><B name="Beta"/><C name="Gamma"/><D name="Delta"/>
		</Sequence></BehaviorTree><TreeNodesModel>
			<Action ID="A"/><Action ID="B"/><Action ID="C"/><Action ID="D"/>
		</TreeNodesModel></root>`
		const tree = selectTree(parseBehaviorTreeXml(xml), 'T')!
		for (const orientation of ['down', 'right'] as const) {
			const scene = layoutProcess(tree, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
			const rects = tree.root!.children.map((child) => scene.nodes.find((entry) => entry.path === child.path)!.rect)
			for (let i = 1; i < rects.length; i += 1) {
				const gap = orientation === 'down' ? rects[i].y - (rects[i - 1].y + rects[i - 1].h) : rects[i].x - (rects[i - 1].x + rects[i - 1].w)
				expect(gap, `gap ${i}`).toBeCloseTo(PROCESS_GAP, 5)
				// Center of the shared rail: nodes align across the flow.
				const centerA = orientation === 'down' ? rects[i - 1].x + rects[i - 1].w / 2 : rects[i - 1].y + rects[i - 1].h / 2
				const centerB = orientation === 'down' ? rects[i].x + rects[i].w / 2 : rects[i].y + rects[i].h / 2
				expect(centerB).toBeCloseTo(centerA, 5)
				// The hover "+" sits at the gap's exact midpoint.
				const between = scene.inserts.find((insert) => insert.id === `between:${tree.root!.path}:${i}`)!
				const mid = orientation === 'down' ? rects[i - 1].y + rects[i - 1].h + PROCESS_GAP / 2 : rects[i - 1].x + rects[i - 1].w + PROCESS_GAP / 2
				expect(orientation === 'down' ? between.at.y : between.at.x).toBeCloseTo(mid, 5)
				expect(orientation === 'down' ? between.at.x : between.at.y).toBeCloseTo(centerA, 5)
			}
		}
	})

	/**
	 * A childless control (or a childless decorator, which falls back to the
	 * same code) paints its name as a chip past the "+" insert, not inside the
	 * insert's own small box — `emptyControlItem`'s declared `flow` has to
	 * reach the chip's real far edge, or a sibling's between-insert midpoint
	 * lands on the chip's own text (the RetryUntilSuccessful/"blue icon cut
	 * off" bug), and the chip's own box has to grow with the label, or a long
	 * name like `RetryUntilSuccessful` overflows it.
	 */
	describe('empty-control label chip', () => {
		// Deliberately spans short → long, and includes the exact name Zach
		// reported (RetryUntilSuccessful, rendered when that decorator has no
		// child yet).
		const LABELS = ['Go', 'RetryUntilSuccessful', 'A Very Much Longer Synthetic Control Name For Testing Overflow']

		function emptyControlTree(labels: string[]) {
			const xml = `<root BTCPP_format="4" main_tree_to_execute="Repro">
  <BehaviorTree ID="Repro">
    <Sequence name="Repro">
      <GraspValid pose="{object_pose}" quality="{quality}"/>
      ${labels.map((label) => `<Sequence name="${label}"/>`).join('\n      ')}
      <AlwaysFailure/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid">
      <input_port name="pose" type="Pose"/>
      <output_port name="quality" type="double"/>
    </Condition>
  </TreeNodesModel>
</root>`
			return selectTree(parseBehaviorTreeXml(xml), 'Repro')!
		}

		/** Matches `.BehaviorTree-insert`'s real 28×28 CSS box, centered on `at`. */
		function insertRect(insert: { at: BtPoint }): BtRect {
			return { x: insert.at.x - 14, y: insert.at.y - 14, w: 28, h: 28 }
		}

		for (const orientation of ['down', 'right'] as const) {
			it(`sizes the chip to its label and keeps it clear of every insert (${orientation})`, () => {
				const tree = emptyControlTree(LABELS)
				const scene = layoutProcess(tree, { orientation, nodeFace: 'simple', controlFace: 'expanded' })
				expectNoNodeOverlap(scene)

				const labelChips = scene.chips.filter((chip) => chip.kind === 'label')
				expect(labelChips).toHaveLength(LABELS.length)

				// A longer label gets a wider chip — no longer a fixed constant
				// that ignores the text and lets RetryUntilSuccessful overflow it.
				const widths = LABELS.map((label) => labelChips.find((chip) => chip.text === label)!.rect.w)
				for (let i = 1; i < widths.length; i += 1) {
					expect(widths[i]).toBeGreaterThan(widths[i - 1])
				}

				// No label chip overlaps any insert point — this is the "+"
				// icon vs. chip-text overlap: a between-insert's midpoint used
				// to be computed from a declared extent that ignored the chip.
				for (const chip of labelChips) {
					for (const insert of scene.inserts) {
						expect(overlaps(chip.rect, insertRect(insert)), `chip "${chip.text}" overlaps insert ${insert.id}`).toBe(false)
					}
				}
				preview(`process-empty-control-${orientation}`, scene)
			})
		}
	})
})

describe('Blackboard lens', () => {
	for (const layout of ['rail', 'table', 'pytrees'] as const) {
		it(`places pills clear of the tree (${layout})`, () => {
			const scene = layoutTree(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'compact', edgeStyle: 'straight' })
			const result = layoutBlackboard(scene, sample, { layout, orientation: 'down' })
			const withKeys: BtScene = { ...scene, keys: result.keys, edges: [...scene.edges, ...result.edges] }
			expectNoNodeOverlap(withKeys)
			expect(result.keys.map((key) => key.key)).toEqual(['object_pose', 'quality', 'grip_force', 'grip_state', 'home_pose'])
			for (const key of result.keys) {
				if (layout === 'table') expect(key.rect.x).toBeGreaterThan(scene.bounds.x + scene.bounds.w - 1)
				else expect(key.rect.y).toBeGreaterThan(scene.bounds.y + scene.bounds.h - 1)
			}
			// Writes arrive at the inlet, reads leave the outlet.
			for (const edge of result.edges) {
				const pill = result.keys.find((key) => key.path === (edge.kind === 'write' ? edge.to : edge.from))!
				const end = edge.kind === 'write' ? edge.points[edge.points.length - 1] : edge.points[0]
				expect(end.x).toBeCloseTo(edge.kind === 'write' ? pill.rect.x : pill.rect.x + pill.rect.w, 3)
			}
			preview(`blackboard-${layout}`, withKeys)
		})
	}

	it('pytrees keeps keys in accessor order and apart', () => {
		const scene = layoutTree(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'compact', edgeStyle: 'straight' })
		const result = layoutBlackboard(scene, sample, { layout: 'pytrees', orientation: 'down' })
		const sorted = result.keys.slice().sort((a, b) => a.rect.x - b.rect.x)
		for (let i = 1; i < sorted.length; i += 1) {
			expect(sorted[i].rect.x).toBeGreaterThanOrEqual(sorted[i - 1].rect.x + sorted[i - 1].rect.w + 30)
		}
	})
})

describe('Dataflow analysis', () => {
	it('wires proven writers directly and keeps ambiguity on the Blackboard', () => {
		const flow = analyzeDataflow(sample)
		// CloseGrip (0.2) reads grip_force: never written → root input.
		expect(flow.rootInputs).toContain('grip_force')
		expect(flow.rootInputs).toContain('home_pose')
		// object_pose is written by MoveToObj? No — it is read there; the writer inside
		// the Fallback (CorrectGrip) is conditional, so GraspValid's later readers stay on the board.
		expect(flow.residualKeys).toContain('object_pose')
		// grip_state: written by CloseGrip at 0.2, read nowhere → output pill.
		expect(flow.residualKeys).toContain('grip_state')
		// quality is written by GraspValid and never read.
		expect(flow.residualKeys).toContain('quality')
	})

	it('draws a direct cable for a plain sequence', () => {
		const xml = `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<Detect pose="{p}"/><Grasp target="{p}"/><Retry num_attempts="2"><Place target="{p}"/></Retry>
		</Sequence></BehaviorTree>
		<TreeNodesModel>
			<Action ID="Detect"><output_port name="pose"/></Action>
			<Action ID="Grasp"><input_port name="target"/></Action>
			<Action ID="Place"><input_port name="target"/></Action>
		</TreeNodesModel></root>`
		const flow = analyzeDataflow(selectTree(parseBehaviorTreeXml(xml), 'T'))
		expect(flow.direct.map((edge) => `${edge.fromPath}.${edge.fromPort}→${edge.toPath}.${edge.toPort}`)).toEqual([
			'0.0.pose→0.1.target',
			'0.0.pose→0.2.0.target',
		])
		expect(flow.residualKeys).toEqual([])
	})

	it('refuses a writer inside a Fallback arm the reader is not in', () => {
		const xml = `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<Fallback><Try pose="{p}"/><Other/></Fallback><Use target="{p}"/>
		</Sequence></BehaviorTree>
		<TreeNodesModel>
			<Action ID="Try"><output_port name="pose"/></Action>
			<Action ID="Use"><input_port name="target"/></Action>
		</TreeNodesModel></root>`
		const flow = analyzeDataflow(selectTree(parseBehaviorTreeXml(xml), 'T'))
		expect(flow.direct).toEqual([])
		expect(flow.residualKeys).toEqual(['p'])
	})

	it('feeds a reader from the latest sequential writer', () => {
		const xml = `<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence>
			<A pose="{p}"/><B pose="{p}"/><C target="{p}"/>
		</Sequence></BehaviorTree>
		<TreeNodesModel>
			<Action ID="A"><output_port name="pose"/></Action>
			<Action ID="B"><output_port name="pose"/></Action>
			<Action ID="C"><input_port name="target"/></Action>
		</TreeNodesModel></root>`
		const flow = analyzeDataflow(selectTree(parseBehaviorTreeXml(xml), 'T'))
		expect(flow.direct.map((edge) => edge.fromPath)).toEqual(['0.1'])
	})
})

describe('Spacing scale (the Inspector slider, at the layout engines)', () => {
	const treeOptions = { orientation: 'down' as const, nodeFace: 'simple' as const, controlFace: 'expanded' as const, edgeStyle: 'straight' as const }

	it('scales the Tree level gap and sibling gap; never a card', () => {
		const one = layoutTree(sample, treeOptions)
		const two = layoutTree(sample, { ...treeOptions, spacing: 2 })
		const rect = (scene: BtScene, path: string) => scene.nodes.find((entry) => entry.path === path)!.rect
		// Level gap: root's bottom edge to its first child's top edge.
		expect(rect(one, '0.0').y - (rect(one, '0').y + rect(one, '0').h)).toBeCloseTo(84, 5)
		expect(rect(two, '0.0').y - (rect(two, '0').y + rect(two, '0').h)).toBeCloseTo(168, 5)
		// Sibling gap: GraspValid and CorrectGrip are two bare leaves under the
		// same Fallback — their edge-to-edge gap IS the sibling gap, exactly.
		expect(rect(one, '0.1.1').x - (rect(one, '0.1.0').x + rect(one, '0.1.0').w)).toBeCloseTo(TREE_SIBLING_GAP, 5)
		expect(rect(two, '0.1.1').x - (rect(two, '0.1.0').x + rect(two, '0.1.0').w)).toBeCloseTo(TREE_SIBLING_GAP * 2, 5)
		for (const entry of one.nodes) {
			const scaled = rect(two, entry.path)
			expect([scaled.w, scaled.h], `card size of ${entry.path}`).toEqual([entry.rect.w, entry.rect.h])
		}
		expectNoNodeOverlap(two)
	})

	it('scales the Process unit the same way', () => {
		const processOptions = { orientation: 'down' as const, nodeFace: 'simple' as const, controlFace: 'expanded' as const }
		const one = layoutProcess(sample, processOptions)
		const two = layoutProcess(sample, { ...processOptions, spacing: 2 })
		const rect = (scene: BtScene, path: string) => scene.nodes.find((entry) => entry.path === path)!.rect
		// CloseGrip → MoveHome is a plain stacked step on the root sequence.
		expect(rect(one, '0.3').y - (rect(one, '0.2').y + rect(one, '0.2').h)).toBeCloseTo(PROCESS_GAP, 5)
		expect(rect(two, '0.3').y - (rect(two, '0.2').y + rect(two, '0.2').h)).toBeCloseTo(PROCESS_GAP * 2, 5)
		expectNoNodeOverlap(two)
	})

	it('omitted spacing means exactly 1 — a loaded old region does not move', () => {
		const plain = layoutTree(sample, treeOptions)
		const explicit = layoutTree(sample, { ...treeOptions, spacing: 1 })
		expect(JSON.stringify(plain)).toBe(JSON.stringify(explicit))
		const plainProcess = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' })
		const explicitProcess = layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded', spacing: 1 })
		expect(JSON.stringify(plainProcess)).toBe(JSON.stringify(explicitProcess))
	})

	it('a tighter-than-default 0.5 still lays out without node overlap', () => {
		const tight = layoutTree(sample, { ...treeOptions, spacing: 0.5 })
		expectNoNodeOverlap(tight)
		expectInsideBounds(tight)
	})
})
