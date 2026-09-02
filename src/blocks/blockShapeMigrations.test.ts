import { createTLStore, type TLShapeId, type TLStoreSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	portBranch,
	portRow,
	type BlockPort,
	type BlockShape,
} from './blockModel'
import { BlockShapeUtil } from './BlockShapeUtil'

const BLOCK_MIGRATION_SEQUENCE = `com.tldraw.shape.${BLOCK_SHAPE_TYPE}`

/** A Block saved when rows were markers on the port that started them. */
function markerBlock(): Omit<BlockShape, 'props'> & { props: Record<string, unknown> } {
	const base = getDefaultBlockProps()
	return {
		id: 'shape:marker-block' as TLShapeId,
		typeName: 'shape',
		type: BLOCK_SHAPE_TYPE,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:legacy' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			...base,
			view: 'port',
			inputs: [
				{ id: 'cond', name: 'cond', type: 'bool', visible: true, header: true },
				{ id: 'in_1', name: 'left', type: '', visible: true },
				{ id: 'in_2', name: 'right', type: '', visible: true, groupStart: true },
				{ id: 'in_3', name: 'more', type: '', visible: true, branchStart: true },
			],
			outputs: [
				{ id: 'out_1', name: 'a', type: '', visible: true, branchStart: true },
				{ id: 'out_2', name: 'b', type: '', visible: true },
				{ id: 'out_3', name: 'c', type: '', visible: true, branchStart: true },
				{ id: 'out_4', name: 'd', type: '', visible: true, groupStart: true, branchStart: true },
				{ id: 'out_5', name: 'e', type: '', visible: true, branchStart: true },
			],
		},
	}
}

describe('Block shape migrations', () => {
	it('turns row and arm markers into the row and arm every port now names', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = markerBlock()
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: { ...currentSchema.sequences, [BLOCK_MIGRATION_SEQUENCE]: 2 },
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		const migrated = store.get(legacy.id) as BlockShape
		const place = (ports: readonly BlockPort[]) => (
			ports.map((port) => `${port.id}@${portRow(port)}.${portBranch(port)}`)
		)
		expect(place(migrated.props.inputs)).toEqual(['cond@0.0', 'in_1@1.0', 'in_2@2.0', 'in_3@2.0'])
		expect(place(migrated.props.outputs)).toEqual(['out_1@1.0', 'out_2@1.0', 'out_3@1.1', 'out_4@2.0', 'out_5@2.1'])
		for (const port of [...migrated.props.inputs, ...migrated.props.outputs]) {
			expect(port).not.toHaveProperty('groupStart')
			expect(port).not.toHaveProperty('branchStart')
			expect(port).not.toHaveProperty('header')
		}
	})
})
