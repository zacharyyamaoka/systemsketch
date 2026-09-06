import { describe, expect, it } from 'vitest'

import {
	SAMPLE_BEHAVIOR_TREE_XML,
	deleteBehaviorTreeNode,
	emptyBehaviorTreeXml,
	insertBehaviorTreeNode,
	insertBehaviorTreeSibling,
	moveBehaviorTreeNode,
	parseBehaviorTreeXml,
	parseXml,
	renameBehaviorTreeKey,
	selectTree,
	serializeXml,
	setBehaviorTreeNodeAttribute,
	unwrapBehaviorTreeNode,
	wrapBehaviorTreeNode,
} from './btcppXml'

const labels = (xml: string, treeId = 'PickAndPlace') => {
	const tree = selectTree(parseBehaviorTreeXml(xml), treeId)
	return tree?.nodes.map((node) => `${node.path}:${node.id}`) ?? []
}

describe('BT.CPP XML parsing', () => {
	it('reads the sample into ordered occurrences with kinds and port directions', () => {
		const document = parseBehaviorTreeXml(SAMPLE_BEHAVIOR_TREE_XML)
		expect(document.parseError).toBeNull()
		expect(document.mainTreeId).toBe('PickAndPlace')
		expect(document.trees.map((tree) => tree.id)).toEqual(['PickAndPlace', 'MoveToObj'])
		const tree = selectTree(document, 'PickAndPlace')!
		expect(tree.root?.kind).toBe('control')
		expect(tree.root?.controlKind).toBe('sequence')
		expect(tree.root?.label).toBe('Pick and place')
		const graspValid = tree.nodes.find((node) => node.id === 'GraspValid')!
		expect(graspValid.kind).toBe('condition')
		expect(graspValid.path).toBe('0.1.0')
		expect(graspValid.ports.map((binding) => [binding.name, binding.direction, binding.key])).toEqual([
			['pose', 'input', 'object_pose'],
			['quality', 'output', 'quality'],
		])
		const subtree = tree.nodes.find((node) => node.kind === 'subtree')!
		expect(subtree.subtreeId).toBe('MoveToObj')
		expect(subtree.label).toBe('MoveToObj')
		expect(document.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
	})

	it('refuses DOCTYPE and entity declarations', () => {
		const document = parseBehaviorTreeXml('<!DOCTYPE root [<!ENTITY x "y">]><root BTCPP_format="4"/>')
		expect(document.parseError).toMatch(/DOCTYPE/)
	})

	it('reports an undeclared compact node without guessing its ports', () => {
		const document = parseBehaviorTreeXml('<root BTCPP_format="4"><BehaviorTree ID="T"><Sequence><Mystery a="{x}"/></Sequence></BehaviorTree></root>')
		const mystery = document.trees[0].nodes[1]
		expect(mystery.kind).toBe('unknown')
		expect(mystery.ports[0].direction).toBe('unknown')
		expect(document.diagnostics.some((entry) => entry.message.includes('Mystery'))).toBe(true)
	})

	it('round-trips through the serializer', () => {
		const parsed = parseXml(SAMPLE_BEHAVIOR_TREE_XML)
		const again = parseXml(serializeXml(parsed))
		expect(again).toEqual(parsed)
	})

	it('reads global keys and literals apart', () => {
		const document = parseBehaviorTreeXml('<root BTCPP_format="4"><BehaviorTree ID="T"><SetBlackboard value="3" output_key="{@count}"/></BehaviorTree></root>')
		const node = document.trees[0].nodes[0]
		expect(node.ports.map((binding) => [binding.name, binding.key, binding.global])).toEqual([
			['value', null, false],
			['output_key', 'count', true],
		])
	})
})

describe('structural edits', () => {
	it('inserts a child and remaps the shifted siblings', () => {
		const result = insertBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0', 1, { id: 'Wait', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.path).toBe('0.1')
		expect(labels(result.xml).slice(0, 4)).toEqual(['0:Sequence', '0.0:SubTree', '0.1:Wait', '0.2:Fallback'])
		expect(result.remap['0.1']).toBe('0.2')
		expect(result.remap['0.1.0']).toBe('0.2.0')
		expect(result.remap['0.0']).toBe('0.0')
	})

	it('seeds an empty tree with a root and refuses a second root', () => {
		const seeded = insertBehaviorTreeNode(emptyBehaviorTreeXml('T'), 'T', null, 0, { id: 'Sequence', kind: 'control' })
		expect(seeded.ok && seeded.path).toBe('0')
		if (!seeded.ok) return
		const again = insertBehaviorTreeNode(seeded.xml, 'T', null, 0, { id: 'Sequence', kind: 'control' })
		expect(again.ok).toBe(false)
	})

	it('refuses to give a decorator a second child or a leaf any child', () => {
		const wrapped = wrapBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', { id: 'Inverter', kind: 'decorator' })
		expect(wrapped.ok).toBe(true)
		if (!wrapped.ok) return
		expect(labels(wrapped.xml)).toContain('0.2:Inverter')
		expect(labels(wrapped.xml)).toContain('0.2.0:CloseGrip')
		expect(wrapped.remap['0.2']).toBe('0.2.0')
		const second = insertBehaviorTreeNode(wrapped.xml, 'PickAndPlace', '0.2', 1, { id: 'Wait', kind: 'action' })
		expect(second.ok).toBe(false)
		const underLeaf = insertBehaviorTreeNode(wrapped.xml, 'PickAndPlace', '0.2.0', 0, { id: 'Wait', kind: 'action' })
		expect(underLeaf.ok).toBe(false)
	})

	it('unwraps a single-child wrapper', () => {
		const wrapped = wrapBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', { id: 'Inverter', kind: 'decorator' })
		if (!wrapped.ok) throw new Error('wrap failed')
		const unwrapped = unwrapBehaviorTreeNode(wrapped.xml, 'PickAndPlace', '0.2')
		expect(unwrapped.ok).toBe(true)
		if (!unwrapped.ok) return
		expect(labels(unwrapped.xml)).toEqual(labels(SAMPLE_BEHAVIOR_TREE_XML))
	})

	it('deletes a subtree and closes the gap', () => {
		const result = deleteBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1')
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml).slice(0, 4)).toEqual(['0:Sequence', '0.0:SubTree', '0.1:CloseGrip', '0.2:MoveHome'])
		expect(result.remap['0.2']).toBe('0.1')
		expect(result.remap['0.1.0']).toBeUndefined()
	})

	it('moves a node across parents and refuses to move into itself', () => {
		const moved = moveBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.3', '0.1', 0)
		expect(moved.ok).toBe(true)
		if (!moved.ok) return
		expect(moved.path).toBe('0.1.0')
		expect(labels(moved.xml).slice(0, 6)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Fallback', '0.1.0:MoveHome', '0.1.1:GraspValid', '0.1.2:CorrectGrip',
		])
		expect(moved.remap['0.1.0']).toBe('0.1.1')
		expect(moved.remap['0.4']).toBe('0.3')
		expect(moveBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1', '0.1.0', 0).ok).toBe(false)
	})

	it('reorders among siblings', () => {
		const moved = moveBehaviorTreeNode(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.0', '0', 3)
		if (!moved.ok) throw new Error(moved.reason)
		expect(labels(moved.xml).filter((entry) => entry.split('.').length === 2).map((entry) => entry.split(':')[1]))
			.toEqual(['Fallback', 'CloseGrip', 'SubTree', 'MoveHome', 'Parallel'])
	})

	it('wraps the root when a sibling of the root is requested', () => {
		const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><Wave/></BehaviorTree></root>'
		const result = insertBehaviorTreeSibling(xml, 'T', '0', true, { id: 'Bow', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml, 'T')).toEqual(['0:Sequence', '0.0:Wave', '0.1:Bow'])
		expect(result.remap['0']).toBe('0.0')
	})

	// The mirror image of the two tests above: `after: false` prepends
	// instead of appends — the Process view's new "before" inserts (the gap
	// above a Fallback recovery arm's own first node, and the gap between
	// Start and the root sequence's current first child) both call
	// `insertBehaviorTreeSibling(…, false, …)` against the target the
	// layout's `sequenceHeadPath` already resolved.
	it('wraps a bare root when a sibling is prepended before it', () => {
		const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><Wave/></BehaviorTree></root>'
		const result = insertBehaviorTreeSibling(xml, 'T', '0', false, { id: 'Bow', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml, 'T')).toEqual(['0:Sequence', '0.0:Bow', '0.1:Wave'])
		expect(result.remap['0']).toBe('0.1')
	})

	it('prepends before the root sequence\'s current first child, shifting it to second', () => {
		const result = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.0', false, { id: 'MoveHome', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml).slice(0, 3)).toEqual(['0:Sequence', '0.0:MoveHome', '0.1:SubTree'])
		expect(result.remap['0.0']).toBe('0.1')
	})

	it('wraps a Fallback arm in a Sequence when a sibling is prepended before it, instead of adding a third alternative', () => {
		const result = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1.1', false, { id: 'PlanPath', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml).slice(0, 6)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Fallback', '0.1.0:GraspValid', '0.1.1:Sequence', '0.1.1.0:PlanPath',
		])
		expect(labels(result.xml)[6]).toBe('0.1.1.1:CorrectGrip')
	})

	it('prepends inside an already-sequential Fallback arm, without a second wrap', () => {
		const wrapped = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1.1', true, { id: 'MoveHome', kind: 'action' })
		if (!wrapped.ok) throw new Error(wrapped.reason)
		// Prepending before the arm's now-first node stays inside the same
		// Sequence — no nested `Sequence(Sequence(...))`.
		const grown = insertBehaviorTreeSibling(wrapped.xml, 'PickAndPlace', '0.1.1.0', false, { id: 'CloseGrip', kind: 'action' })
		expect(grown.ok).toBe(true)
		if (!grown.ok) return
		expect(labels(grown.xml).slice(0, 8)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Fallback', '0.1.0:GraspValid',
			'0.1.1:Sequence', '0.1.1.0:CloseGrip', '0.1.1.1:CorrectGrip', '0.1.1.2:MoveHome',
		])
	})

	// Zach's ruling 2026-09-05: a Fallback's failure/recovery arm "just
	// becomes another sequential branch that you can begin to stack skills …
	// on." A Fallback's children are alternatives, not steps, so appending
	// after a bare arm leaf must wrap it in a Sequence first — the same
	// treatment a sibling of the root already got — rather than silently
	// adding a third alternative arm.
	it('wraps a Fallback arm in a Sequence when a sibling is added after it, instead of adding a third alternative', () => {
		const result = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1.1', true, { id: 'MoveHome', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(labels(result.xml).slice(0, 6)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Fallback', '0.1.0:GraspValid', '0.1.1:Sequence', '0.1.1.0:CorrectGrip',
		])
		expect(labels(result.xml)[6]).toBe('0.1.1.1:MoveHome')
		expect(result.remap['0.1.1']).toBe('0.1.1.0')
	})

	it('grows an already-sequential Fallback arm in place, without a second wrap', () => {
		const wrapped = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.1.1', true, { id: 'MoveHome', kind: 'action' })
		if (!wrapped.ok) throw new Error(wrapped.reason)
		// Appending after the arm's now-last node stays inside the same
		// Sequence — no nested `Sequence(Sequence(...))`.
		const grown = insertBehaviorTreeSibling(wrapped.xml, 'PickAndPlace', '0.1.1.1', true, { id: 'CloseGrip', kind: 'action' })
		expect(grown.ok).toBe(true)
		if (!grown.ok) return
		expect(labels(grown.xml).slice(0, 8)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Fallback', '0.1.0:GraspValid',
			'0.1.1:Sequence', '0.1.1.0:CorrectGrip', '0.1.1.1:MoveHome', '0.1.1.2:CloseGrip',
		])
	})

	it('leaves a plain Sequence sibling-insert exactly as before (unaffected by the Fallback-arm generalization)', () => {
		const result = insertBehaviorTreeSibling(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', true, { id: 'Wait', kind: 'action' })
		expect(result.ok).toBe(true)
		if (!result.ok) return
		// CloseGrip's parent (the root Sequence) is already sequence-like, so
		// this stays a plain sibling insert — no Sequence wrapper appears.
		expect(labels(result.xml)).toContain('0.2:CloseGrip')
		expect(labels(result.xml)).toContain('0.3:Wait')
		expect(labels(result.xml)).not.toContain('0.2:Sequence')
	})

	it('sets and clears attributes and renames a key everywhere', () => {
		const named = setBehaviorTreeNodeAttribute(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', 'name', 'Close the gripper')
		if (!named.ok) throw new Error(named.reason)
		expect(selectTree(parseBehaviorTreeXml(named.xml), 'PickAndPlace')?.nodes.find((node) => node.path === '0.2')?.label).toBe('Close the gripper')
		const renamed = renameBehaviorTreeKey(named.xml, 'PickAndPlace', 'object_pose', 'target_pose')
		if (!renamed.ok) throw new Error(renamed.reason)
		expect(renamed.xml).not.toContain('{object_pose}')
		expect(renamed.xml).toContain('target="{target_pose}"')
	})
})

// Nav2's own extension (nav2_behavior_tree/plugins/control/recovery_node.cpp),
// not core BT.CPP — the one control node in this app whose second child's
// success genuinely loops back to re-run the first, verified against that
// source file and Nav2's shipped navigate_to_pose_w_replanning_and_recovery.xml
// (2026-09-06). See `recoveryLoopItem` in `processLayout.ts` for the render.
describe('RecoveryNode (Nav2 control extension)', () => {
	// A trimmed version of Nav2's own real ComputePathToPose recovery, so the
	// fixture is grounded in an actual shipped tree rather than invented shape.
	const RECOVERY_XML = `<root BTCPP_format="4"><BehaviorTree ID="T">
		<RecoveryNode number_of_retries="1" name="ComputePathToPose">
			<ComputePathToPose goal="{goal}" path="{path}"/>
			<Sequence>
				<WouldAPlannerRecoveryHelp error_code="{compute_path_error_code}"/>
				<ClearEntireCostmap name="ClearGlobalCostmap-Context"/>
			</Sequence>
		</RecoveryNode>
	</BehaviorTree>
	<TreeNodesModel>
		<Action ID="ComputePathToPose"><input_port name="goal"/><output_port name="path"/></Action>
		<Condition ID="WouldAPlannerRecoveryHelp"><input_port name="error_code"/></Condition>
		<Action ID="ClearEntireCostmap"/>
	</TreeNodesModel></root>`

	it('parses as a control node with its own controlKind, retry port, and no diagnostics', () => {
		const document = parseBehaviorTreeXml(RECOVERY_XML)
		expect(document.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
		const tree = selectTree(document, 'T')!
		const node = tree.root!
		expect(node.id).toBe('RecoveryNode')
		expect(node.kind).toBe('control')
		expect(node.controlKind).toBe('recoveryLoop')
		expect(node.label).toBe('ComputePathToPose')
		expect(node.ports.map((binding) => [binding.name, binding.value])).toEqual([['number_of_retries', '1']])
		expect(node.children).toHaveLength(2)
	})

	it('defaults number_of_retries to 1 when the attribute is absent, matching Nav2\'s own InputPort default', () => {
		const bare = '<root BTCPP_format="4"><BehaviorTree ID="T"><RecoveryNode><A/><B/></RecoveryNode></BehaviorTree><TreeNodesModel><Action ID="A"/><Action ID="B"/></TreeNodesModel></root>'
		const node = selectTree(parseBehaviorTreeXml(bare), 'T')!.root!
		expect(node.ports.find((binding) => binding.name === 'number_of_retries')).toBeUndefined()
		expect(node.model?.ports.find((entry) => entry.name === 'number_of_retries')?.defaultValue).toBe('1')
	})

	it('flags anything other than exactly 2 children, the way BT.CPP throws at runtime', () => {
		const oneChild = '<root BTCPP_format="4"><BehaviorTree ID="T"><RecoveryNode><A/></RecoveryNode></BehaviorTree><TreeNodesModel><Action ID="A"/></TreeNodesModel></root>'
		const oneChildDoc = parseBehaviorTreeXml(oneChild)
		expect(oneChildDoc.diagnostics.some((entry) => entry.severity === 'error' && entry.message.includes('exactly 2 children'))).toBe(true)

		const threeChildren = '<root BTCPP_format="4"><BehaviorTree ID="T"><RecoveryNode><A/><B/><C/></RecoveryNode></BehaviorTree><TreeNodesModel><Action ID="A"/><Action ID="B"/><Action ID="C"/></TreeNodesModel></root>'
		const threeChildrenDoc = parseBehaviorTreeXml(threeChildren)
		expect(threeChildrenDoc.diagnostics.some((entry) => entry.severity === 'error' && entry.message.includes('exactly 2 children'))).toBe(true)
		// Still draws every node — nothing this app parses is silently hidden.
		expect(selectTree(threeChildrenDoc, 'T')!.root!.children).toHaveLength(3)
	})

	it('refuses a third child by insert or move, mirroring the decorator single-child guard', () => {
		const thirdInsert = insertBehaviorTreeNode(RECOVERY_XML, 'T', '0', 2, { id: 'Wait', kind: 'action' })
		expect(thirdInsert.ok).toBe(false)
		expect(!thirdInsert.ok && thirdInsert.reason).toMatch(/exactly two children/)

		// Grow a third node inside the primary's own arm, then try to move it
		// out to become RecoveryNode's third direct child instead.
		const wrapped = wrapBehaviorTreeNode(RECOVERY_XML, 'T', '0.0', { id: 'Sequence', kind: 'control' })
		if (!wrapped.ok) throw new Error(wrapped.reason)
		const grown = insertBehaviorTreeNode(wrapped.xml, 'T', wrapped.path, 1, { id: 'Sleep', kind: 'action' })
		if (!grown.ok) throw new Error(grown.reason)
		const thirdMove = moveBehaviorTreeNode(grown.xml, 'T', grown.path, '0', 2)
		expect(thirdMove.ok).toBe(false)
	})

	it('wraps the primary or recovery step in a Sequence when a sibling is added, instead of adding a third child', () => {
		const afterPrimary = insertBehaviorTreeSibling(RECOVERY_XML, 'T', '0.0', true, { id: 'ValidatePath', kind: 'condition' })
		if (!afterPrimary.ok) throw new Error(afterPrimary.reason)
		expect(labels(afterPrimary.xml, 'T')).toContain('0.0:Sequence')
		expect(labels(afterPrimary.xml, 'T')).toContain('0.0.0:ComputePathToPose')
		expect(labels(afterPrimary.xml, 'T')).toContain('0.0.1:ValidatePath')
		// The arity-2 shape is preserved: RecoveryNode itself still has exactly 2 children.
		expect(selectTree(parseBehaviorTreeXml(afterPrimary.xml), 'T')!.root!.children).toHaveLength(2)
	})

	it('round-trips a real RecoveryNode tree through the serializer unchanged', () => {
		const parsed = parseXml(RECOVERY_XML)
		const again = parseXml(serializeXml(parsed))
		expect(again).toEqual(parsed)
	})
})
