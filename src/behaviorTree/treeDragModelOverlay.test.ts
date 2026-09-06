/**
 * The drag-model debug overlay's two load-bearing facts, tested where they
 * live: the Dev switch defaults off and round-trips storage, and the
 * rest-state geometry the overlay paints comes from the SAME
 * `deriveDragListGeometry` the live drag context uses — per-parent
 * containers, tiled zones, and virtual slots that widen when an Expanded
 * sibling widens the list. The painted overlay itself is proven in a real
 * browser by `tests/behavior_tree_dual_drag_smoke.mjs`.
 */
import { describe, expect, it } from 'vitest'

import { parseBehaviorTreeXml, selectTree } from './btcppXml'
import { bandsByDepth, deriveDragListGeometry, type DragListNodeInput } from './dragListReorder'
import { layoutTree } from './treeLayout'
import { readTreeDragModelOverlay, writeTreeDragModelOverlay } from './treeDragModelOverlayState'

const XML = `<root BTCPP_format="4" main_tree_to_execute="Demo">
  <BehaviorTree ID="Demo">
    <Sequence>
      <A/>
      <Fallback>
        <B/>
        <C/>
      </Fallback>
      <D/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="A"/>
    <Action ID="B"/>
    <Action ID="C"/>
    <Action ID="D"/>
  </TreeNodesModel>
</root>`

function restGeometry(nodeViewOverrides?: Record<string, { view: 'expanded'; w: number; h: number }>) {
	const tree = selectTree(parseBehaviorTreeXml(XML), 'Demo')!
	const scene = layoutTree(tree, {
		orientation: 'down',
		nodeFace: 'simple',
		controlFace: 'expanded',
		edgeStyle: 'straight',
		nodeViewOverrides,
	})
	const nodes: DragListNodeInput[] = scene.nodes.map((entry) => ({
		id: entry.path,
		orderPath: entry.path,
		depth: entry.node.depth,
		rect: entry.rect,
	}))
	return deriveDragListGeometry(nodes, bandsByDepth(scene, true), 'x')
}

describe('the drag-model overlay switch', () => {
	it('defaults off, so production behavior and every journey are untouched', () => {
		expect(readTreeDragModelOverlay(null)).toBe(false)
		expect(readTreeDragModelOverlay({ getItem: () => null })).toBe(false)
		expect(readTreeDragModelOverlay({ getItem: () => '"garbage' })).toBe(false)
	})

	it('round-trips through storage', () => {
		const store = new Map<string, string>()
		const storage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
		}
		writeTreeDragModelOverlay(true, storage)
		expect(readTreeDragModelOverlay(storage)).toBe(true)
		writeTreeDragModelOverlay(false, storage)
		expect(readTreeDragModelOverlay(storage)).toBe(false)
	})
})

describe('the rest-state geometry the overlay paints', () => {
	it('groups every node into its parent list — the Kanban columns', () => {
		const geometry = restGeometry()
		// Containers: root's single-member list (''), the Sequence's children
		// ('0'), and the Fallback's children ('0.1').
		expect([...geometry.containersByParent.keys()].sort()).toEqual(['', '0', '0.1'])
		expect(geometry.containersByParent.get('0')!.container.items.map((item) => item.id)).toEqual(['0.0', '0.1', '0.2'])
		expect(geometry.containersByParent.get('0.1')!.container.items.map((item) => item.id)).toEqual(['0.1.0', '0.1.1'])
	})

	it('tiles each depth strip into zones covering every cross position exactly once', () => {
		const geometry = restGeometry()
		for (const strip of geometry.strips.values()) {
			const zones = strip.records
				.map((record) => strip.zones.get(record.baseParentPath)!)
				.sort((a, b) => a.start - b.start)
			for (let i = 1; i < zones.length; i += 1) {
				expect(zones[i].start).toBeCloseTo(zones[i - 1].end, 5)
			}
		}
	})

	it("an Expanded sibling widens the WHOLE list's virtual slots — the padding the overlay makes visible", () => {
		const plain = restGeometry()
		const widened = restGeometry({ '0.1.0': { view: 'expanded', w: 420, h: 320 } })
		const plainSlots = plain.containersByParent.get('0.1')!.container.items
		const widenedSlots = widened.containersByParent.get('0.1')!.container.items
		// Both members' virtual slots take the Expanded member's width…
		for (const item of widenedSlots) {
			expect(item.virtualRect.w).toBeGreaterThanOrEqual(420)
		}
		// …and the un-Expanded sibling's slot is now wider than its real box,
		// while in the plain layout it was not.
		const plainSibling = plainSlots.find((item) => item.id === '0.1.1')!
		const widenedSibling = widenedSlots.find((item) => item.id === '0.1.1')!
		expect(plainSibling.virtualRect.w - plainSibling.rect.w).toBeLessThan(1)
		expect(widenedSibling.virtualRect.w - widenedSibling.rect.w).toBeGreaterThan(100)
	})
})
