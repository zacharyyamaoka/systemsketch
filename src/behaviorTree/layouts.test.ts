/**
 * Layout invariants for the Tree, Process and Blackboard engines, plus an
 * optional preview: `BT_PREVIEW=/tmp/dir npx vitest run src/behaviorTree/layouts.test.ts`
 * writes one SVG per view so a layout change can be looked at.
 */
import { describe, expect, it } from 'vitest'

import { SAMPLE_BEHAVIOR_TREE_XML, parseBehaviorTreeXml, selectTree } from './btcppXml'
import { BT_EDGE_STYLES, type BtPoint, type BtRect, type BtScene } from './behaviorTreeModel'
import { analyzeDataflow } from './dataflow'
import { layoutBlackboard } from './blackboardLayout'
import { layoutProcess } from './processLayout'
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

	it('lays out the sample with a persistent end target', () => {
		const scene = layoutProcess(sample, { orientation: 'right', nodeFace: 'simple', controlFace: 'expanded' })
		expectNoNodeOverlap(scene)
		expect(scene.inserts.some((insert) => insert.kind === 'end' && insert.persistent)).toBe(true)
		preview('process-sample-right', scene)
		preview('process-sample-down', layoutProcess(sample, { orientation: 'down', nodeFace: 'simple', controlFace: 'expanded' }))
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
