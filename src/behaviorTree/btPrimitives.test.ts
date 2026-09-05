import { T } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBehaviorTreeProps } from './behaviorTreeModel'
import { projectBehaviorTree, projectedEdges } from './behaviorTreeProjection'
import { behaviorTreePrimitives } from './btPrimitives'
import { SAMPLE_BEHAVIOR_TREE_XML } from './btcppXml'

const STOCK_TYPES = new Set(['geo', 'text', 'line', 'arrow', 'group', 'frame'])

function regionProps(patch: Partial<ReturnType<typeof getDefaultBehaviorTreeProps>> = {}) {
	return {
		...getDefaultBehaviorTreeProps(),
		xml: SAMPLE_BEHAVIOR_TREE_XML,
		treeId: 'PickAndPlace',
		title: 'PickAndPlace',
		...patch,
	}
}

/** The same records with their freshly minted ids removed. */
function withoutIds(shapes: ReadonlyArray<Record<string, unknown>>) {
	return shapes.map((shape) => {
		const { id: _id, ...rest } = shape
		return rest
	})
}

describe('behaviorTreePrimitives', () => {
	it('lowers a region to stock records only', () => {
		const { shapes } = behaviorTreePrimitives(regionProps())
		expect(shapes.length).toBeGreaterThan(10)
		expect([...new Set(shapes.map((shape) => shape.type))].filter((type) => !STOCK_TYPES.has(type ?? '')))
			.toEqual([])
	})

	it('carries no value tldraw would refuse in a shape meta', () => {
		// The exact oracle the crash came from: `meta` is `T.jsonValue`, which
		// rejects `undefined` anywhere in the tree.
		for (const props of [regionProps(), regionProps({ dataLens: 'blackboard' }), regionProps({ dataLens: 'dataflow' })]) {
			const { shapes } = behaviorTreePrimitives(props)
			for (const shape of shapes) {
				expect(() => T.jsonValue.validate(JSON.parse(JSON.stringify(shape.props)))).not.toThrow()
				for (const value of Object.values(shape.props as Record<string, unknown>)) {
					expect(value).not.toBeUndefined()
				}
			}
		}
	})

	it('lowers every painted element exactly once', () => {
		const props = regionProps()
		const projection = projectBehaviorTree(props)
		const { shapes } = behaviorTreePrimitives(props)
		const controls = projection.children.filter((child) => child.type === 'behaviorTreeControl')
		const edges = projectedEdges(projection)
		const heads = edges.filter((edge) => edge.arrowEnd && edge.points.length >= 2)
		const expected =
			1 // the header rule
			+ projection.scene.groups.length * 2
			+ projection.scene.rails.length * 2
			+ edges.filter((edge) => edge.points.length >= 2).length
			+ heads.length
			+ (projection.scene.start ? 2 : 0)
			+ projection.scene.chips.length * 2
			+ controls.length * 2
		expect(shapes.length).toBe(expected)
		expect(controls.length).toBeGreaterThan(0)
		expect(edges.length).toBeGreaterThan(0)
	})

	it('leaves the leaves and the key pills to the Block detach', () => {
		const props = regionProps({ dataLens: 'blackboard' })
		const projection = projectBehaviorTree(props)
		const { shapes } = behaviorTreePrimitives(props)
		const blockChildren = projection.children.filter((child) => child.type === 'block')
		expect(blockChildren.length).toBeGreaterThan(0)
		// Nothing here paints a Block card: a projected Block is a real Block and
		// goes through the ordinary detach so a person keeps one idiom.
		const titles = blockChildren
			.map((child) => (child.props as { title: string }).title)
			.filter((title) => title.length > 2)
		expect(titles.length).toBeGreaterThan(0)
		const painted = JSON.stringify(shapes)
		for (const title of new Set(titles)) expect(painted).not.toContain(title)
	})

	it('is deterministic apart from the ids it mints', () => {
		const props = regionProps({ dataLens: 'dataflow' })
		const first = behaviorTreePrimitives(props)
		const second = behaviorTreePrimitives(props)
		expect(withoutIds(second.shapes as never)).toEqual(withoutIds(first.shapes as never))
		expect(new Set(first.shapes.map((shape) => shape.id)).size).toBe(first.shapes.length)
	})

	it('keeps a polyline’s points in the order they were drawn', () => {
		const { shapes } = behaviorTreePrimitives(regionProps())
		const lines = shapes.filter((shape) => shape.type === 'line')
		expect(lines.length).toBeGreaterThan(0)
		for (const line of lines) {
			const points = (line.props as { points: Record<string, { index: string }> }).points
			const keys = Object.keys(points)
			expect(keys).toEqual([...keys].sort())
			expect(keys.map((key) => points[key].index)).toEqual(keys)
		}
	})

	it('every projection the region can be in lowers cleanly', () => {
		for (const projection of ['tree', 'process'] as const) {
			for (const nodeFace of ['simple', 'port'] as const) {
				for (const dataLens of ['none', 'blackboard', 'dataflow'] as const) {
					const { shapes } = behaviorTreePrimitives(regionProps({ projection, nodeFace, dataLens }))
					expect([...new Set(shapes.map((shape) => shape.type))]
						.filter((type) => !STOCK_TYPES.has(type ?? ''))).toEqual([])
				}
			}
		}
	})
})
