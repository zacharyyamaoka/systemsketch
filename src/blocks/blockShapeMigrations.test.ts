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
import {
	downgradeBlockPropsV1ToV0,
	downgradeBlockPropsV4ToV3,
	downgradeBlockPropsV5ToV4,
	downgradeBlockPropsV6ToV5,
	downgradeBlockPropsV7ToV6,
	upgradeBlockPropsV0ToV1,
	upgradeBlockPropsV1ToV2,
	upgradeBlockPropsV2ToV3,
	upgradeBlockPropsV3ToV4,
	upgradeBlockPropsV4ToV5,
	upgradeBlockPropsV5ToV6,
	upgradeBlockPropsV6ToV7,
	type BlockMigrationProps,
} from './blockShapeMigrations'

const BLOCK_MIGRATION_SEQUENCE = `com.tldraw.shape.${BLOCK_SHAPE_TYPE}`

function throughPureStep(
	props: BlockMigrationProps,
	step: (input: BlockMigrationProps) => BlockMigrationProps,
): BlockMigrationProps {
	const before = structuredClone(props)
	const next = step(props)
	expect(props).toEqual(before)
	return next
}

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
	it('renames only the shipped Projection primitive and preserves authored vocabulary', () => {
		const legacy = { blockType: 'projection', description: 'keep this', inputs: [{ id: 'record' }], outputs: [{ id: 'out_1', name: '.limit' }], w: 413 }
		const canonical = upgradeBlockPropsV6ToV7(legacy)
		expect(canonical).toEqual({ ...legacy, blockType: 'unbundle' })
		expect(downgradeBlockPropsV7ToV6(canonical)).toEqual(legacy)
		for (const authored of ['split', 'merge', 'set-attributes', 'bundle', 'copy']) {
			const props = { ...legacy, blockType: authored }
			expect(upgradeBlockPropsV6ToV7(props)).toBe(props)
		}
		expect(downgradeBlockPropsV7ToV6({ ...legacy, blockType: 'bundle' })).toEqual({ ...legacy, blockType: 'bundle' })
		expect(downgradeBlockPropsV7ToV6({ ...legacy, blockType: 'copy' })).toEqual({ ...legacy, blockType: 'copy' })
	})

	it('loads a V6 Projection record as Unbundle without losing authored fields', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = markerBlock()
		legacy.props.blockType = 'projection'
		legacy.props.title = 'Choose members'
		legacy.props.description = 'keep authored prose'
		legacy.props.inputs = [{ id: 'record', name: 'packet', type: 'Packet', visible: true, row: 0 }]
		legacy.props.outputs = [{ id: 'out_1', name: '.limit', type: 'float', visible: true, row: 1 }]
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: { ...currentSchema.sequences, [BLOCK_MIGRATION_SEQUENCE]: 6 },
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		const migrated = store.get(legacy.id) as BlockShape
		expect(migrated.props).toMatchObject({
			blockType: 'unbundle',
			title: 'Choose members',
			description: 'keep authored prose',
			inputs: legacy.props.inputs,
			outputs: legacy.props.outputs,
		})
	})
	it('threads one immutable props record through the named version steps', () => {
		const v0: BlockMigrationProps = {
			view: 'port',
			w: 360,
			h: 230,
			views: {
				simple: { w: 240, h: 148 },
				port: { w: 360, h: 230 },
				expanded: { w: 640, h: 430 },
			},
			inputs: [
				{ id: 'cond', header: true },
				{ id: 'left' },
				{ id: 'right', groupStart: true },
			],
			outputs: [
				{ id: 'first' },
				{ id: 'second', branchStart: true },
			],
		}

		const v1 = throughPureStep(v0, upgradeBlockPropsV0ToV1)
		expect(v1).toMatchObject({ w: 340, h: 198 })
		expect(v1.views).toMatchObject({
			simple: { w: 320, h: 206 },
			port: { w: 340, h: 198 },
			expanded: { w: 560, h: 380 },
		})

		const v2 = throughPureStep(v1, upgradeBlockPropsV1ToV2)
		expect(v2.portLayout).toBe('inline')

		const v3 = throughPureStep(v2, upgradeBlockPropsV2ToV3)
		expect(v3.inputs).toEqual([
			{ id: 'cond', row: 0 },
			{ id: 'left' },
			{ id: 'right', row: 2 },
		])
		expect(v3.outputs).toEqual([
			{ id: 'first' },
			{ id: 'second', branch: 1 },
		])

		const v4 = throughPureStep(v3, upgradeBlockPropsV3ToV4)
		expect(v4.views).toMatchObject({ value: { w: 168, h: 56 } })

		const v5 = throughPureStep(v4, upgradeBlockPropsV4ToV5)
		expect(v5.state).toBe('normal')

		const v6 = throughPureStep(v5, upgradeBlockPropsV5ToV6)
		expect(v6).toEqual(v5)
		const v7 = throughPureStep(v6, upgradeBlockPropsV6ToV7)
		expect(v7).toEqual(v6)

		const restoredV0 = throughPureStep(v1, downgradeBlockPropsV1ToV0)
		expect(restoredV0).toMatchObject({ w: 360, h: 230, views: v0.views })
	})

	it('normalizes StockConfig and strips vocabulary that prior schemas cannot validate', () => {
		const configV6: BlockMigrationProps = {
			...getDefaultBlockProps(),
			blockType: 'clock-trigger',
			stockConfig: { triggerSource: 'clock', rateHz: Number.NaN, runtimeAdapter: 'unavailable' },
		}
		const configV7 = throughPureStep(configV6, upgradeBlockPropsV6ToV7)
		expect(configV7.stockConfig).toEqual({ triggerSource: 'clock', rateHz: 10 })
		expect(configV7.stockConfig).not.toHaveProperty('runtimeAdapter')

		const v7: BlockMigrationProps = {
			inputs: [{ id: 'in', semanticRoleDerived: { role: 'configuration', source: 'parser' }, semanticRoleAuthored: { role: 'data' } }],
			outputs: [{ id: 'out', semanticRoleAuthored: { role: 'event' } }],
		}
		const v6 = throughPureStep(v7, downgradeBlockPropsV7ToV6)
		expect(v6.inputs).toEqual([{ id: 'in' }])
		expect(v6.outputs).toEqual([{ id: 'out' }])
		expect(throughPureStep(configV7, downgradeBlockPropsV7ToV6)).not.toHaveProperty('stockConfig')
	})

	it('round-trips a V6 saved Block through the registered schema and validates the V7 record', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = markerBlock()
		legacy.props.blockType = 'clock-trigger'
		legacy.props.inputs = []
		legacy.props.outputs = [{ id: 'trigger', name: 'trigger', type: 'Trigger', visible: true, row: 0 }]
		legacy.props.stockConfig = { triggerSource: 'clock', rateHz: 0, runtimeAdapter: 'unavailable' }
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: { ...currentSchema.sequences, [BLOCK_MIGRATION_SEQUENCE]: 6 },
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		const migrated = store.get(legacy.id) as BlockShape
		expect(migrated.props.stockConfig).toEqual({ triggerSource: 'clock', rateHz: 10 })
		expect(store.schema.serialize().sequences[BLOCK_MIGRATION_SEQUENCE]).toBe(7)

		const sequence = store.schema.sortedMigrations
			.filter((migration) => migration.id.startsWith(`${BLOCK_MIGRATION_SEQUENCE}/`))
		const step = sequence.find((migration) => migration.id.endsWith('/7'))
		expect(step, 'the named semantic roles and StockConfig migration').toBeDefined()
		const record = { ...legacy, props: structuredClone(migrated.props) }
		;(step as { down: (record: unknown) => void }).down(record)
		expect((record.props as Record<string, unknown>)).not.toHaveProperty('stockConfig')
	})

	it('downgrades disposable diff data without mutating the current record', () => {
		const v6: BlockMigrationProps = {
			view: 'value',
			w: 200,
			h: 56,
			views: {
				simple: { w: 320, h: 206 },
				port: { w: 340, h: 198 },
				expanded: { w: 560, h: 380 },
				value: { w: 200, h: 56 },
			},
			state: 'changed',
			fieldDiffs: [{ path: 'title', before: 'old', after: 'new' }],
			priorPose: { x: 10, y: 20, w: 300, h: 200 },
			inputs: [
				{
					id: 'kept',
					state: 'changed',
					stateBefore: 'before',
					fieldDiffs: [{ path: 'name', before: 'before', after: 'after' }],
				},
				{ id: 'ghost', state: 'removed' },
			],
			outputs: [],
		}

		const v5 = throughPureStep(v6, downgradeBlockPropsV6ToV5)
		expect(v5).not.toHaveProperty('fieldDiffs')
		expect(v5).not.toHaveProperty('priorPose')
		expect(v5.inputs).toEqual([
			{ id: 'kept', state: 'changed', stateBefore: 'before' },
			{ id: 'ghost', state: 'removed' },
		])

		const v4 = throughPureStep(v5, downgradeBlockPropsV5ToV4)
		expect(v4).not.toHaveProperty('state')
		expect(v4.inputs).toEqual([{ id: 'kept' }])

		const v3 = throughPureStep(v4, downgradeBlockPropsV4ToV3)
		expect(v3).toMatchObject({ view: 'simple', w: 320, h: 206 })
		expect(v3.views).not.toHaveProperty('value')
	})

	it('gives pre-diff Blocks the required ordinary state', () => {
		const store = createTLStore({ shapeUtils: [BlockShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = markerBlock()
		legacy.props.inputs = []
		legacy.props.outputs = []
		delete legacy.props.state
		const snapshot = {
			schema: {
				...currentSchema,
				sequences: { ...currentSchema.sequences, [BLOCK_MIGRATION_SEQUENCE]: 4 },
			},
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		expect((store.get(legacy.id) as BlockShape).props.state).toBe('normal')
	})

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
		const downgraded = record.props as Record<string, unknown>
		expect(downgraded).not.toHaveProperty('state')
		// A reader without the vocabulary would draw a ghost row as an ordinary
		// port, which is the board telling a lie.
		expect((downgraded.inputs as { id: string }[]).map((port) => port.id)).toEqual(['in_1'])
		expect(downgraded.inputs).toEqual([{ id: 'in_1', name: 'out', type: '', visible: true }])
		expect(downgraded.outputs).toEqual([{ id: 'out_1', name: 'pose', type: '', visible: true }])
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
		const downgraded = record.props as Record<string, unknown>
		// The whole point of this migration. A reader without round 2's
		// vocabulary would draw the Block under its NEW title with no sign that
		// it was renamed, and at its new pose with no sign that it moved —
		// silently correct, and silently missing the finding.
		expect(downgraded).not.toHaveProperty('fieldDiffs')
		expect(downgraded).not.toHaveProperty('priorPose')
		expect(downgraded.inputs).toEqual([
			{ id: 'in_1', name: 'callable', type: 'PoseEstimator', visible: true },
		])
		// The value itself is the current one and survives: only the lens comes off.
		expect(downgraded.title).toBe('run_predict')
	})
})
