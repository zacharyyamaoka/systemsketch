import { describe, expect, it } from 'vitest'

import {
	BT_BUILTIN_MODELS,
	BT_DISABLED_ATTR,
	SAMPLE_BEHAVIOR_TREE_XML,
	deleteBehaviorTreeNode,
	emptyBehaviorTreeXml,
	groupBehaviorTreeSiblings,
	insertBehaviorTreeNode,
	insertBehaviorTreeSibling,
	isBtNodeDisabled,
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

	it('carries the BT.CPP v4.8 Async controls with their family controlKind', () => {
		const asyncSequence = BT_BUILTIN_MODELS.find((model) => model.id === 'AsyncSequence')
		const asyncFallback = BT_BUILTIN_MODELS.find((model) => model.id === 'AsyncFallback')
		expect(asyncSequence).toMatchObject({ kind: 'control', controlKind: 'sequence' })
		expect(asyncFallback).toMatchObject({ kind: 'control', controlKind: 'fallback' })
		expect(asyncSequence?.description).not.toBe('')
		expect(asyncFallback?.description).not.toBe('')
	})

	it('carries Breakpoint as a decorator and round-trips it through the XML', () => {
		expect(BT_BUILTIN_MODELS.find((model) => model.id === 'Breakpoint')).toMatchObject({ kind: 'decorator' })
		const xml = '<root BTCPP_format="4"><BehaviorTree ID="T"><Breakpoint><AlwaysSuccess/></Breakpoint></BehaviorTree></root>'
		const document = parseBehaviorTreeXml(xml)
		const node = document.trees[0].nodes[0]
		expect([node.id, node.kind]).toEqual(['Breakpoint', 'decorator'])
		// A transparent passthrough: known, single child, no diagnostics at all.
		expect(document.diagnostics).toEqual([])
		const again = parseBehaviorTreeXml(serializeXml(parseXml(xml)))
		expect(again.trees[0].nodes.map((entry) => entry.id)).toEqual(['Breakpoint', 'AlwaysSuccess'])
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

	it('marks a node disabled through the reserved channel and round-trips it', () => {
		const disabled = setBehaviorTreeNodeAttribute(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', BT_DISABLED_ATTR, 'true')
		if (!disabled.ok) throw new Error(disabled.reason)
		expect(disabled.xml).toContain('_disabled="true"')
		const node = selectTree(parseBehaviorTreeXml(disabled.xml), 'PickAndPlace')!.nodes.find((entry) => entry.path === '0.2')!
		expect(isBtNodeDisabled(node)).toBe(true)
		// Not a port: the flag rides `reserved`, so the Blackboard lens ignores it.
		expect(node.ports.some((binding) => binding.name === BT_DISABLED_ATTR)).toBe(false)
		// Survives an unrelated re-serialize, and clears without a residue.
		const reparsed = parseBehaviorTreeXml(serializeXml(parseXml(disabled.xml)))
		expect(isBtNodeDisabled(selectTree(reparsed, 'PickAndPlace')!.nodes.find((entry) => entry.path === '0.2')!)).toBe(true)
		const cleared = setBehaviorTreeNodeAttribute(disabled.xml, 'PickAndPlace', '0.2', BT_DISABLED_ATTR, null)
		if (!cleared.ok) throw new Error(cleared.reason)
		expect(cleared.xml).toBe(SAMPLE_BEHAVIOR_TREE_XML)
	})

	it('groups sibling nodes into a new Sequence at the first sibling\'s position', () => {
		// 0.1 (Fallback) and 0.3 (MoveHome) selected out of order, 0.2 left alone.
		const grouped = groupBehaviorTreeSiblings(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', ['0.3', '0.1'], { id: 'Sequence', kind: 'control', name: 'Group' })
		expect(grouped.ok).toBe(true)
		if (!grouped.ok) return
		expect(grouped.path).toBe('0.1')
		expect(labels(grouped.xml).slice(0, 9)).toEqual([
			'0:Sequence', '0.0:SubTree', '0.1:Sequence', '0.1.0:Fallback', '0.1.0.0:GraspValid',
			'0.1.0.1:CorrectGrip', '0.1.1:MoveHome', '0.2:CloseGrip', '0.3:Parallel',
		])
		// XML sibling order wins over selection order, and members keep their subtrees.
		expect(grouped.remap['0.1']).toBe('0.1.0')
		expect(grouped.remap['0.1.0']).toBe('0.1.0.0')
		expect(grouped.remap['0.3']).toBe('0.1.1')
		expect(grouped.remap['0.2']).toBe('0.2')
		expect(grouped.remap['0.4']).toBe('0.3')
		expect(grouped.xml).toContain('<Sequence name="Group">')
	})

	it('refuses to group non-siblings, fewer than two nodes, or the root', () => {
		expect(groupBehaviorTreeSiblings(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', ['0.1', '0.1.0'], { id: 'Sequence', kind: 'control' }).ok).toBe(false)
		expect(groupBehaviorTreeSiblings(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', ['0.1'], { id: 'Sequence', kind: 'control' }).ok).toBe(false)
		expect(groupBehaviorTreeSiblings(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', ['0', '0.1'], { id: 'Sequence', kind: 'control' }).ok).toBe(false)
		expect(groupBehaviorTreeSiblings(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', ['0.1', '0.2'], { id: 'Inverter', kind: 'decorator' }).ok).toBe(false)
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
