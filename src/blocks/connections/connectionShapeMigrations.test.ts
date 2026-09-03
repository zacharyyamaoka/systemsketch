import { createTLStore, type TLShapeId, type TLStoreSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { ConnectionShapeUtil, type ConnectionShape } from './ConnectionShapeUtil'

const CONNECTION_MIGRATION_SEQUENCE = `com.tldraw.shape.${CONNECTION_SHAPE_TYPE}`

function legacyConnection(): Omit<ConnectionShape, 'props'> & {
	props: Pick<ConnectionShape['props'], 'start' | 'end' | 'routing'>
} {
	return {
		id: 'shape:legacy-connection' as TLShapeId,
		typeName: 'shape',
		type: CONNECTION_SHAPE_TYPE,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as ConnectionShape['index'],
		parentId: 'page:legacy' as ConnectionShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			routing: 'curved',
		},
	}
}

describe('connection shape migrations', () => {
	it('loads a pre-authored-routing connection without resetting the board', () => {
		const store = createTLStore({ shapeUtils: [ConnectionShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const { [CONNECTION_MIGRATION_SEQUENCE]: _currentVersion, ...legacySequences } =
			currentSchema.sequences
		const legacy = legacyConnection()
		const snapshot = {
			schema: { ...currentSchema, sequences: legacySequences },
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		expect(store.get(legacy.id)).toMatchObject({
			props: {
				curve: null,
				pins: [],
				elbowRoute: null,
				routeMode: 'automatic',
				// A cable saved before the edge vocabulary is a plain data cable.
				temporal: 'data',
				delayValue: '',
				pillPosition: 0.5,
			},
		})
	})

	it('conservatively marks legacy saved elbow geometry as authored', () => {
		const store = createTLStore({ shapeUtils: [ConnectionShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const base = legacyConnection()
		const legacy = {
			...base,
			props: {
				...base.props,
				curve: null,
				pins: [{ index: 1, axis: 'x' as const, t: 0.5, offset: 40 }],
				elbowRoute: null,
				temporal: 'data' as const,
				delayValue: '',
				pillPosition: 0.5,
			},
		}
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: {
					...currentSchema.sequences,
					[CONNECTION_MIGRATION_SEQUENCE]: 2,
				},
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		store.loadStoreSnapshot(snapshot)
		expect(store.get(legacy.id)).toMatchObject({
			props: { pins: legacy.props.pins, routeMode: 'authored' },
		})
	})
})
