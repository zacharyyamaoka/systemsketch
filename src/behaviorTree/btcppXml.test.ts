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
