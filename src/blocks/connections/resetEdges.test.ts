import { describe, expect, it } from 'vitest'

import type { ConnectionShape } from './ConnectionShapeUtil'
import {
	connectionHasCustomRoute,
	describeResetEdgeRoutingOutcome,
	resetEdgeRouting,
} from './resetEdges'

function connection(
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
			routing: 'elbow',
			curve: null,
			pins: [],
			elbowRoute: null,
			routeMode: 'automatic',
			temporal: 'data',
			delayValue: '',
			pillPosition: 0.5,
			...overrides,
		},
	} as ConnectionShape
}

function editorRecordingUpdates() {
	const updates: unknown[] = []
	const stoppingPoints: string[] = []
	const editor = {
		markHistoryStoppingPoint: (label: string) => stoppingPoints.push(label),
		updateShapes: (patches: unknown[]) => updates.push(...patches),
	} as never
	return { editor, updates, stoppingPoints }
}

describe('connectionHasCustomRoute', () => {
	it('is false for a plain automatic edge and true for any authored geometry', () => {
		expect(connectionHasCustomRoute(connection())).toBe(false)
		expect(connectionHasCustomRoute(connection({ curve: { dx: 10, dy: 5 } }))).toBe(true)
		expect(connectionHasCustomRoute(connection({
			pins: [{ index: 1, axis: 'y', t: 0.5, offset: 20 }],
		}))).toBe(true)
		expect(connectionHasCustomRoute(connection({
			elbowRoute: { startAxis: 'x', corners: [] },
		}))).toBe(true)
		// A Tidy snapshot is still `routeMode: 'automatic'` but carries a
		// captured route — reset clears it exactly like a hand-authored one.
		expect(connectionHasCustomRoute(connection({
			elbowRoute: { startAxis: 'x', corners: [] },
			routeMode: 'automatic',
		}))).toBe(true)
	})
})

describe('resetEdgeRouting', () => {
	it('clears curve, pins, and elbowRoute and forces automatic routeMode', () => {
		const authored = {
			...connection({
				curve: { dx: 3, dy: 4 },
				pins: [{ index: 0, axis: 'x', t: 0.5, offset: 10 }],
				elbowRoute: { startAxis: 'y', corners: [] },
				routeMode: 'authored',
			}),
			id: 'shape:authored',
		} as ConnectionShape
		const { editor, updates, stoppingPoints } = editorRecordingUpdates()

		const outcome = resetEdgeRouting(editor, [authored])

		expect(outcome).toEqual({ reset: 1, alreadyAutomatic: 0 })
		expect(stoppingPoints).toEqual(['reset edge routing'])
		expect(updates).toEqual([{
			id: authored.id,
			type: 'connection',
			props: { curve: null, pins: [], elbowRoute: null, routeMode: 'automatic' },
		}])
	})

	it('skips edges that are already automatic and never touches the store for them', () => {
		const plain = { ...connection(), id: 'shape:plain' } as ConnectionShape
		const { editor, updates, stoppingPoints } = editorRecordingUpdates()

		const outcome = resetEdgeRouting(editor, [plain])

		expect(outcome).toEqual({ reset: 0, alreadyAutomatic: 1 })
		expect(updates).toEqual([])
		expect(stoppingPoints).toEqual([])
	})

	it('resets only the edges that need it within a mixed batch', () => {
		const plain = { ...connection(), id: 'shape:plain' } as ConnectionShape
		const authored = {
			...connection({
				routeMode: 'authored',
				pins: [{ index: 0, axis: 'x', t: 0.5, offset: 10 }],
			}),
			id: 'shape:authored',
		} as ConnectionShape
		const { editor, updates } = editorRecordingUpdates()

		const outcome = resetEdgeRouting(editor, [plain, authored])

		expect(outcome).toEqual({ reset: 1, alreadyAutomatic: 1 })
		expect((updates[0] as { id: string }).id).toBe(authored.id)
	})

	it('is a no-op on an empty scope', () => {
		const { editor, updates, stoppingPoints } = editorRecordingUpdates()
		expect(resetEdgeRouting(editor, [])).toEqual({ reset: 0, alreadyAutomatic: 0 })
		expect(updates).toEqual([])
		expect(stoppingPoints).toEqual([])
	})
})

describe('describeResetEdgeRoutingOutcome', () => {
	it('describes the reset count and any edges already automatic', () => {
		expect(describeResetEdgeRoutingOutcome({ reset: 3, alreadyAutomatic: 0 }))
			.toBe('Reset 3 edges to automatic')
		expect(describeResetEdgeRoutingOutcome({ reset: 1, alreadyAutomatic: 2 }))
			.toBe('Reset 1 edge to automatic, 2 already automatic')
		expect(describeResetEdgeRoutingOutcome({ reset: 0, alreadyAutomatic: 4 }))
			.toBe('Nothing to reset — already automatic')
		expect(describeResetEdgeRoutingOutcome({ reset: 0, alreadyAutomatic: 0 }))
			.toBe('No edges selected')
	})
})
