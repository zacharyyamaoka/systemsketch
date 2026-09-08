import { createTLStore, type TLShapeId, type TLStoreSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { CodeShapeUtil } from './CodeShapeUtil'
import {
	CODE_SHAPE_TYPE,
	downgradeCodePropsV1ToV0,
	type CodeShape,
	upgradeCodePropsV0ToV1,
} from './codeModel'

const CODE_MIGRATION_SEQUENCE = `com.tldraw.shape.${CODE_SHAPE_TYPE}`

function legacyCodeShape(): Omit<CodeShape, 'props'> & { props: Record<string, unknown> } {
	return {
		id: 'shape:legacy-code' as TLShapeId,
		typeName: 'shape',
		type: CODE_SHAPE_TYPE,
		x: 80,
		y: 120,
		rotation: 0,
		index: 'a1' as CodeShape['index'],
		parentId: 'page:legacy' as CodeShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			w: 500,
			h: 148,
			code: 'answer = 42',
			language: 'python',
			fontSize: 14,
			showLineNumbers: true,
			characterWidth: 48,
		},
	}
}

describe('Code shape migrations', () => {
	it('converts the first shipped Code format to stock size before loading', () => {
		const store = createTLStore({ shapeUtils: [CodeShapeUtil], bindingUtils: [] })
		const currentSchema = store.schema.serialize()
		const legacy = legacyCodeShape()
		const { [CODE_MIGRATION_SEQUENCE]: _currentVersion, ...legacySequences } = currentSchema.sequences
		const snapshot = {
			schema: { ...currentSchema, sequences: legacySequences },
			store: { [legacy.id]: legacy },
		} as unknown as TLStoreSnapshot

		expect(() => store.loadStoreSnapshot(snapshot)).not.toThrow()
		expect(store.get(legacy.id)).toMatchObject({
			props: {
				code: legacy.props.code,
				size: 'm',
				fontScale: 14 / 16,
			},
		})
		expect((store.get(legacy.id) as CodeShape).props).not.toHaveProperty('fontSize')
	})

	it('keeps a current rung while seeding its missing scale', () => {
		const current = { w: 500, h: 148, code: 'x', language: 'python', size: 'l', showLineNumbers: true, characterWidth: 48 }
		expect(upgradeCodePropsV0ToV1(current)).toEqual({ ...current, fontScale: 1 })
	})

	it('round-trips a first-release pixel size for an older reader', () => {
		const legacy = legacyCodeShape().props
		const current = upgradeCodePropsV0ToV1(legacy)
		expect(downgradeCodePropsV1ToV0(current)).toEqual(legacy)
	})

	it('makes an arbitrary current custom scale valid for the old font-size validator', () => {
		const current = { w: 500, h: 148, code: 'x', language: 'python', size: 'm', fontScale: 1.17, showLineNumbers: true, characterWidth: 48 }
		expect(downgradeCodePropsV1ToV0(current)).toEqual({
			w: 500, h: 148, code: 'x', language: 'python', fontSize: 18, showLineNumbers: true, characterWidth: 48,
		})
	})
})
