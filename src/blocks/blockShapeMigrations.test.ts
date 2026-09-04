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

	it('gives every stored Block the explicit normal state a style prop needs', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = markerBlock()
		// Saved at v4: rows are already numbered, so only the state is missing.
		legacy.props.inputs = [{ id: 'in_1', name: 'frame', type: 'Frame', visible: true }]
		legacy.props.outputs = [{ id: 'out_1', name: 'pose', type: 'Pose', visible: true }]
		delete (legacy.props as Record<string, unknown>).state
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: { ...currentSchema.sequences, [BLOCK_MIGRATION_SEQUENCE]: 4 },
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		const migrated = store.get(legacy.id) as BlockShape
		// A StyleProp cannot be optional: the editor has to find a concrete value
		// on every Block to decide whether a selection is shared or mixed.
		expect(migrated.props.state).toBe('normal')
		// The ports' states are ordinary optional fields and mean normal by their
		// absence, so the migration writes nothing into them.
		for (const port of [...migrated.props.inputs, ...migrated.props.outputs]) {
			expect(port).not.toHaveProperty('state')
		}
	})

	it('drops the whole lens on the way down, ghost rows included', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const sequence = store.schema.sortedMigrations
			.filter((migration) => migration.id.startsWith(`${BLOCK_MIGRATION_SEQUENCE}/`))
		const step = sequence.find((migration) => migration.id.endsWith('/5'))
		expect(step, 'the DiffState migration').toBeDefined()
		const props: Record<string, unknown> = {
			...getDefaultBlockProps(),
			state: 'changed',
			inputs: [
				{ id: 'in_1', name: 'out', type: '', visible: true, state: 'changed', stateBefore: 'callee' },
				{ id: 'in_ghost', name: 'seed', type: '', visible: true, state: 'removed' },
			],
			outputs: [{ id: 'out_1', name: 'pose', type: '', visible: true, state: 'added' }],
		}
		const record = { ...markerBlock(), props }
		;(step as { down: (record: unknown) => void }).down(record)
		expect(props).not.toHaveProperty('state')
		// A reader without the vocabulary would draw a ghost row as an ordinary
		// port, which is the board telling a lie.
		expect((props.inputs as { id: string }[]).map((port) => port.id)).toEqual(['in_1'])
		expect(props.inputs).toEqual([{ id: 'in_1', name: 'out', type: '', visible: true }])
		expect(props.outputs).toEqual([{ id: 'out_1', name: 'pose', type: '', visible: true }])
	})

	it('takes the round-2 pairs and the pose ghost off on the way down too', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const sequence = store.schema.sortedMigrations
			.filter((migration) => migration.id.startsWith(`${BLOCK_MIGRATION_SEQUENCE}/`))
		const step = sequence.find((migration) => migration.id.endsWith('/6'))
		expect(step, 'the FieldDiffs migration').toBeDefined()
		const props: Record<string, unknown> = {
			...getDefaultBlockProps(),
			title: 'run_predict',
			fieldDiffs: [{ path: 'title', before: 'run_inference', after: 'run_predict' }],
			priorPose: { x: 10, y: 20, w: 300, h: 150 },
			inputs: [{
				id: 'in_1', name: 'callable', type: 'PoseEstimator', visible: true,
				fieldDiffs: [{ path: 'name', before: 'callee', after: 'callable' }],
			}],
			outputs: [],
		}
		const record = { ...markerBlock(), props }
		;(step as { down: (record: unknown) => void }).down(record)
		// The whole point of this migration. A reader without round 2's
		// vocabulary would draw the Block under its NEW title with no sign that
		// it was renamed, and at its new pose with no sign that it moved —
		// silently correct, and silently missing the finding.
		expect(props).not.toHaveProperty('fieldDiffs')
		expect(props).not.toHaveProperty('priorPose')
		expect(props.inputs).toEqual([
			{ id: 'in_1', name: 'callable', type: 'PoseEstimator', visible: true },
		])
		// The value itself is the current one and survives: only the lens comes off.
		expect(props.title).toBe('run_predict')
	})
})
