/**
 * The Spacing slider's model half: `spacingScale` flows from the region's
 * props through `projectBehaviorTree` into both layout engines, scaling the
 * gap constants and nothing else — and a region saved before the prop
 * existed migrates to 1 (the constants exactly as they were).
 */
import { describe, expect, it } from 'vitest'

import { getDefaultBehaviorTreeProps, type BehaviorTreeShapeProps } from './behaviorTreeModel'
import { projectBehaviorTree } from './behaviorTreeProjection'
import { behaviorTreeShapeMigrations } from './BehaviorTreeShapeUtil'
import { SAMPLE_BEHAVIOR_TREE_XML } from './btcppXml'
import { PROCESS_GAP } from './processLayout'
import { TREE_LEVEL_GAP } from './treeLayout'

function props(patch: Partial<BehaviorTreeShapeProps>): BehaviorTreeShapeProps {
	return { ...getDefaultBehaviorTreeProps(), xml: SAMPLE_BEHAVIOR_TREE_XML, ...patch }
}

describe('spacingScale through projectBehaviorTree', () => {
	it('scales the Tree view level gap without touching card sizes', () => {
		const one = projectBehaviorTree(props({ projection: 'tree', orientation: 'down' }))
		const two = projectBehaviorTree(props({ projection: 'tree', orientation: 'down', spacingScale: 2 }))
		const gapOf = (projection: typeof one) => {
			const root = projection.nodeRects.get('0')!
			const child = projection.nodeRects.get('0.0')!
			return child.y - (root.y + root.h)
		}
		expect(gapOf(one)).toBeCloseTo(TREE_LEVEL_GAP, 5)
		expect(gapOf(two)).toBeCloseTo(TREE_LEVEL_GAP * 2, 5)
		for (const [path, rect] of one.nodeRects) {
			const scaled = two.nodeRects.get(path)!
			expect([scaled.w, scaled.h], `size of ${path}`).toEqual([rect.w, rect.h])
		}
	})

	it('scales the Process view unit', () => {
		const one = projectBehaviorTree(props({ projection: 'process', orientation: 'down' }))
		const two = projectBehaviorTree(props({ projection: 'process', orientation: 'down', spacingScale: 2 }))
		const gapOf = (projection: typeof one) => {
			// CloseGrip (0.2) and MoveHome (0.3) sit adjacent on the root
			// sequence's own stack — the plainest node→node flow gap there is.
			const a = projection.nodeRects.get('0.2')!
			const b = projection.nodeRects.get('0.3')!
			return b.y - (a.y + a.h)
		}
		expect(gapOf(one)).toBeCloseTo(PROCESS_GAP, 5)
		expect(gapOf(two)).toBeCloseTo(PROCESS_GAP * 2, 5)
	})
})

describe('spacingScale migration', () => {
	const migration = behaviorTreeShapeMigrations.sequence.find((entry) => 'id' in entry && String(entry.id).endsWith('/2'))
	it('exists as props version 2', () => {
		expect(migration).toBeDefined()
	})
	it('fills a pre-slider region with 1 — the constants exactly as they were', () => {
		const legacy: Record<string, unknown> = { controlWireOpacity: 1 }
		;(migration as { up(props: Record<string, unknown>): void }).up(legacy)
		expect(legacy.spacingScale).toBe(1)
	})
	it('leaves an explicit value alone and removes it on the way down', () => {
		const stored: Record<string, unknown> = { spacingScale: 1.5 }
		const typed = migration as { up(props: Record<string, unknown>): void; down(props: Record<string, unknown>): void }
		typed.up(stored)
		expect(stored.spacingScale).toBe(1.5)
		typed.down(stored)
		expect('spacingScale' in stored).toBe(false)
	})
})
