import { describe, expect, it } from 'vitest'

import type { ConnectionShape } from './ConnectionShapeUtil'
import { describeTidyEdgesOutcome, getTidyEdgesSelection, tidyEdgeRole } from './tidyEdges'

function connection(
	routing: ConnectionShape['props']['routing'],
	overrides: Partial<ConnectionShape['props']> = {},
): ConnectionShape {
	return {
		id: 'shape:test',
		typeName: 'shape',
		type: 'connection',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId: 'page:page',
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			routing,
			curve: null,
			pins: [],
			elbowRoute: null,
			temporal: 'data',
			delayValue: '',
			pillPosition: 0.5,
			...overrides,
		},
	} as ConnectionShape
}

describe('tidy edges command contract', () => {
	it('scopes to explicit edges plus every edge incident to a selected Block', () => {
		const edges = ['ab', 'ca', 'de'].map((id) => ({
			...connection('elbow'),
			id: `shape:${id}`,
		}))
		const endpoints: Record<string, string[]> = {
			'shape:ab': ['shape:a', 'shape:b'],
			'shape:ca': ['shape:c', 'shape:a'],
			'shape:de': ['shape:d', 'shape:e'],
		}
		const editor = {
			getCurrentPageShapes: () => edges,
			getSelectedShapeIds: () => ['shape:a', 'shape:de'],
			getSelectedShapes: () => [{ id: 'shape:a', type: 'block' }, edges[2]],
			getBindingsFromShape: (shape: ConnectionShape) =>
				endpoints[shape.id].map((toId) => ({ toId })),
		} as never

		expect(getTidyEdgesSelection(editor).map((edge) => edge.id)).toEqual([
			'shape:ab',
			'shape:ca',
			'shape:de',
		])
	})

	it('does not turn an empty selection into an implicit whole-page sweep', () => {
		const edge = connection('elbow')
		const editor = {
			getCurrentPageShapes: () => [edge],
			getSelectedShapeIds: () => [],
			getSelectedShapes: () => [],
			getBindingsFromShape: () => [],
		} as never
		expect(getTidyEdgesSelection(editor)).toEqual([])
	})

	it('does not treat unrelated selected shapes as incident nodes', () => {
		const edge = connection('elbow')
		const editor = {
			getCurrentPageShapes: () => [edge],
			getSelectedShapeIds: () => ['shape:note'],
			getSelectedShapes: () => [{ id: 'shape:note', type: 'note' }],
			getBindingsFromShape: () => [{ toId: 'shape:note' }],
		} as never
		expect(getTidyEdgesSelection(editor)).toEqual([])
	})

	it('moves only automatic elbows and treats authored geometry as locked', () => {
		expect(tidyEdgeRole(connection('elbow'))).toBe('free')
		expect(tidyEdgeRole(connection('elbow', {
			elbowRoute: { startAxis: 'x', corners: [] },
		}))).toBe('locked')
		expect(tidyEdgeRole(connection('elbow', { curve: { dx: 10, dy: 5 } }))).toBe('locked')
		expect(tidyEdgeRole(connection('curved'))).toBe('ignored')
		expect(tidyEdgeRole(connection('straight'))).toBe('ignored')
	})

	it('reports what moved, what was retained, and what remains impossible', () => {
		expect(describeTidyEdgesOutcome({
			tidied: 6,
			locked: 2,
			ignored: 1,
			bundles: 3,
			forcedCrossings: 1,
		})).toBe('Tidied 6 edges, kept 2 hand-routed, skipped 1 non-elbow, 1 crossing cannot be removed')
		expect(describeTidyEdgesOutcome({
			tidied: 0,
			locked: 0,
			ignored: 0,
			bundles: 0,
			forcedCrossings: 0,
		})).toBe('Edges are already tidy')
	})
})
