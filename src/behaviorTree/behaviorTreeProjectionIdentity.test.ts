/**
 * A projection of the same board twice must describe the SAME children.
 *
 * This is not a cosmetic property. `draftRebase.ts` decides what a draft and
 * Main each changed by diffing raw records field by field, so any field the
 * projection re-rolls on every pass reads as an edit that never happened — and
 * a field both sides re-roll differently reads as a genuine conflict. A
 * Behavior Tree board whose leaves minted a fresh `definitionId` per projection
 * could therefore never be rebased, and `reconcileBehaviorTree`'s documented
 * idempotency was false for every leaf it owned.
 */
import { describe, expect, it } from 'vitest'

import { getDefaultBehaviorTreeProps, type BehaviorTreeShapeProps } from './behaviorTreeModel'
import { projectBehaviorTree } from './behaviorTreeProjection'
import { SAMPLE_BEHAVIOR_TREE_XML } from './btcppXml'

/** A fresh props object each time: the projection memo is keyed by props IDENTITY. */
function boardProps(overrides: Partial<BehaviorTreeShapeProps> = {}): BehaviorTreeShapeProps {
	return { ...getDefaultBehaviorTreeProps(), xml: SAMPLE_BEHAVIOR_TREE_XML, ...overrides }
}

function blockChildren(props: BehaviorTreeShapeProps) {
	return projectBehaviorTree(props).children.filter((child) => child.type === 'block')
}

describe('projected Behavior Tree children are identical across two loads', () => {
	for (const lens of ['blackboard', 'dataflow'] as const) {
		it(`re-projects byte-identical Block props with the ${lens} lens`, () => {
			const first = blockChildren(boardProps({ dataLens: lens }))
			const second = blockChildren(boardProps({ dataLens: lens }))

			// Guard the guard: a lens that drew nothing would pass vacuously.
			expect(first.length).toBeGreaterThan(0)
			expect(second.map((child) => child.path)).toEqual(first.map((child) => child.path))
			expect(second.map((child) => child.props)).toEqual(first.map((child) => child.props))
		})
	}

	it('carries no definitionId at all, so an existing leaf keeps the one it was saved with', () => {
		const children = blockChildren(boardProps({ dataLens: 'dataflow' }))
		const leaves = children.filter((child) => child.role === 'node')
		expect(leaves.length).toBeGreaterThan(0)
		for (const child of children) {
			expect(child.props).not.toHaveProperty('definitionId')
		}
	})

	it('leaves a persisted definitionId untouched when the projection is spread over it', () => {
		// This is exactly what `desiredRecordProps` does in
		// `installBehaviorTreeRegions.ts`: current props first, projection over
		// the top. A projection that named `definitionId` would clobber it.
		const [leaf] = blockChildren(boardProps()).filter((child) => child.role === 'node')
		const saved = { ...leaf.props, definitionId: 'kept-across-loads' }
		expect({ ...saved, ...leaf.props }).toMatchObject({ definitionId: 'kept-across-loads' })
	})
})
