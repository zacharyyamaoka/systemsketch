/**
 * Process view's drag model, tested at the same level as Tree view's
 * (`dragListReorder.test.ts`): the pure context + resolution pair, driven
 * with real layouts from the real process engine. The browser journey
 * (`tests/behavior_tree_process_drag_smoke.mjs`) proves the mounted gesture;
 * what belongs here is the geometry truth table — per-container axes read
 * off the layout, rail reorders, lane reparents, the shared tuned deadband,
 * and the judge's refusals arriving as reasons rather than corruption.
 */
import { describe, expect, it } from 'vitest'

import { SAMPLE_BEHAVIOR_TREE_XML, parseBehaviorTreeXml, selectTree } from './btcppXml'
import { layoutProcess } from './processLayout'
import {
	buildProcessDragListContext,
	resolveProcessDragDrop,
	type ProcessDragListOptions,
} from './processDragList'

const OPTIONS: ProcessDragListOptions = {
	orientation: 'down',
	nodeFace: 'simple',
	controlFace: 'expanded',
}

function sceneRect(xml: string, path: string, options: ProcessDragListOptions = OPTIONS) {
	const tree = selectTree(parseBehaviorTreeXml(xml), 'PickAndPlace')!
	const scene = layoutProcess(tree, options)
	const entry = scene.nodes.find((node) => node.path === path)
	if (!entry) throw new Error(`no card at ${path}`)
	return entry.rect
}

function rootChildIds(xml: string): string[] {
	const tree = selectTree(parseBehaviorTreeXml(xml), 'PickAndPlace')!
	return tree.root!.children.map((child) => child.id)
}

describe('buildProcessDragListContext', () => {
	it('groups the ghost leaf cards into per-parent containers keyed by base paths', () => {
		const ctx = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', OPTIONS)!
		expect(ctx).not.toBeNull()
		// The root sequence's list exists and carries the surviving root-level
		// cards under their BASE numbering (0.2 removed, 0.3 still 0.3-keyed).
		const root = ctx.containersByParent.get('0')!
		expect(root.container.items.map((item) => item.id)).toContain('0.3')
		expect(root.container.items.map((item) => item.id)).not.toContain('0.2')
		// The Fallback's recovery list is its own container.
		expect(ctx.containersByParent.has('0.1')).toBe(true)
	})

	it("reads each container's sort axis off the ghost geometry, not tags: rail steps stack along the flow, recovery arms sit across it", () => {
		const ctx = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', {
			...OPTIONS,
			orientation: 'down',
		})!
		// Top-to-bottom process: the root sequence packs along y (flow)…
		expect(ctx.containersByParent.get('0')!.axis).toBe('y')
		// …while the Fallback's arm heads separate across x (the recovery gap).
		expect(ctx.containersByParent.get('0.1')!.axis).toBe('x')
	})

	it('returns null for the root itself, and for a path that no longer resolves', () => {
		expect(buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0', OPTIONS)).toBeNull()
		expect(buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.9.9', OPTIONS)).toBeNull()
	})
})

describe('resolveProcessDragDrop', () => {
	it('reorders two rail steps when the dragged card travels one slot along the flow', () => {
		const ctx = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', OPTIONS)!
		const rest = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.2')
		const target = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.3')
		// Drop the CloseGrip card onto MoveHome's slot, past its center.
		const result = resolveProcessDragDrop(ctx, { ...rest, y: target.y + target.h * 0.75 })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.targetParentPath).toBe('0')
			expect(rootChildIds(result.xml)).toEqual(['SubTree', 'Fallback', 'MoveHome', 'CloseGrip', 'Parallel'])
		}
	})

	it('a sub-threshold wobble resolves back to home — the same commit-free stillness Tree view has', () => {
		const ctx = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', OPTIONS)!
		const rest = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.2')
		const result = resolveProcessDragDrop(ctx, { ...rest, y: rest.y + 8 })
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.xml).toBe(SAMPLE_BEHAVIOR_TREE_XML)
	})

	it("reparents a rail step into the Fallback's recovery list when dropped among its arms", () => {
		const ctx = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.3', OPTIONS)!
		// Land on the recovery arm's own card (CorrectGrip, 0.1.1).
		const arm = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.1.1')
		const dragged = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.3')
		const result = resolveProcessDragDrop(ctx, { ...dragged, x: arm.x + arm.w * 0.6, y: arm.y })
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.targetParentPath).toBe('0.1')
			const tree = selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!
			const fallback = tree.root!.children.find((child) => child.tag === 'Fallback')!
			expect(fallback.children.map((child) => child.id)).toContain('MoveHome')
		}
	})

	it('the tuned deadband governs Process too: a fixed padding defers the same swap', () => {
		const rest = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.2')
		const target = sceneRect(SAMPLE_BEHAVIOR_TREE_XML, '0.3')
		const probeRect = { ...rest, y: target.y + target.h * 0.75 }
		const plain = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', OPTIONS)!
		const padded = buildProcessDragListContext(SAMPLE_BEHAVIOR_TREE_XML, 'PickAndPlace', '0.2', {
			...OPTIONS,
			tuning: { releasePaddingPx: 400 },
		})!
		const plainResult = resolveProcessDragDrop(plain, probeRect)
		const paddedResult = resolveProcessDragDrop(padded, probeRect)
		expect(plainResult.ok && plainResult.xml === SAMPLE_BEHAVIOR_TREE_XML).toBe(false)
		expect(paddedResult.ok && paddedResult.xml === SAMPLE_BEHAVIOR_TREE_XML).toBe(true)
	})

	it('an illegal landing comes back as a reason from the one judge, never corruption', () => {
		// A decorator that already holds its one child refuses a second one.
		const xml = `<root BTCPP_format="4" main_tree_to_execute="PickAndPlace">
  <BehaviorTree ID="PickAndPlace">
    <Sequence>
      <Inverter><A/></Inverter>
      <B/>
      <C/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="A"/><Action ID="B"/><Action ID="C"/>
  </TreeNodesModel>
</root>`
		const ctx = buildProcessDragListContext(xml, 'PickAndPlace', '0.1', { ...OPTIONS })!
		// Force the judge directly: a drop resolved into the Inverter's list.
		const inner = (() => {
			const tree = selectTree(parseBehaviorTreeXml(xml), 'PickAndPlace')!
			const scene = layoutProcess(tree, OPTIONS)
			return scene.nodes.find((node) => node.path === '0.0.0')!.rect
		})()
		const result = resolveProcessDragDrop(ctx, { ...inner })
		// Landing near the decorator's child either resolves legally elsewhere
		// (adjacent rail slot) or is refused with the decorator's reason —
		// never an exception, never a mangled tree.
		if (!result.ok) expect(result.reason.toLowerCase()).toContain('decorator')
		else expect(selectTree(parseBehaviorTreeXml(result.xml), 'PickAndPlace')!.nodes.length).toBe(4)
	})
})
