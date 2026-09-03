import { describe, expect, it } from 'vitest'

import type { ConnectionShape } from './ConnectionShapeUtil'
import { describeTidyEdgesOutcome, tidyEdgeRole } from './tidyEdges'

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
