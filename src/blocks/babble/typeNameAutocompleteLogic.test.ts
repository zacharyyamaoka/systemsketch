import { createShapeId, PageRecordType, type Editor, type TLPage, type TLPageId, type TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from '../blockModel'
import {
	applyAcceptance,
	buildBrowseList,
	buildQueryResults,
	buildRegistry,
	findExpressionTypeSlot,
	findTypeSlot,
} from './typeNameAutocompleteLogic'

// A minimal fake `Editor` — only what `allBlocks` reads (`getPages`,
// `getPageShapeIds`, `getShape`), trimmed from the harness in
// `src/commands/boardSearch.test.ts` since this module never mutates shapes.
function shape(id: string, parentId: TLPageId, props: Record<string, unknown>): TLShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		parentId,
		index: 'a1',
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		isLocked: false,
		meta: {},
		props,
	} as unknown as TLShape
}

function block(id: string, parentId: TLPageId, title: string, blockType: string, attributeSource = '') {
	return shape(id, parentId, { ...getDefaultBlockProps(), title, blockType, view: 'port', attributeSource })
}

function mappingBlock(id: string, parentId: TLPageId, attributeSource: string) {
	const built = block(id, parentId, '', '', attributeSource)
	return { ...built, meta: { typeMappingBabbleVariant: 1 } } as unknown as TLShape
}

function makeEditor(shapes: TLShape[]): Editor {
	const page = { id: PageRecordType.createId('board'), typeName: 'page', name: 'Board', index: 'a1', meta: {} } as TLPage
	const byId = new Map(shapes.map((item) => [item.id, item]))
	return {
		getPages: () => [page],
		getPageShapeIds: () => new Set(shapes.map((item) => item.id)),
		getShape: (id: string) => byId.get(id as never),
	} as unknown as Editor
}

describe('type-name autocomplete registry', () => {
	it('scans board types, mapped-type aliases and primitives into one registry', () => {
		const page = PageRecordType.createId('board')
		const editor = makeEditor([
			block('pose', page, 'Pose', 'type', 'x: float\ny: float'),
			mappingBlock('mapping', page, 'Estimator = Callable[[Frame, float], Pose]'),
		])
		const registry = buildRegistry(editor)
		expect(registry).toContainEqual({ kind: 'board-type', name: 'Pose', detail: 'Type · this board' })
		expect(registry).toContainEqual({
			kind: 'mapped-type', name: 'Estimator', detail: '= Callable[[Frame, float], Pose]',
			alsoMatches: 'Callable[[Frame, float], Pose]',
		})
		expect(registry).toContainEqual({ kind: 'primitive', name: 'float', detail: 'built-in' })
	})

	it('excludes only the named block, never a type that legitimately self-references', () => {
		const page = PageRecordType.createId('board')
		const poseId = createShapeId('pose')
		const editor = makeEditor([
			{ ...block('pose', page, 'Pose', 'type', 'x: float'), id: poseId } as TLShape,
		])
		expect(buildRegistry(editor).some((entry) => entry.name === 'Pose')).toBe(true)
		expect(buildRegistry(editor, poseId).some((entry) => entry.name === 'Pose')).toBe(false)
	})

	it('surfaces a mapping that matches only via its expression, ranked below a name match, inserting its NAME', () => {
		const page = PageRecordType.createId('board')
		const editor = makeEditor([
			block('pose', page, 'Pose', 'type'),
			mappingBlock('mapping', page, 'Estimator = Callable[[Frame, float], Pose]'),
		])
		const registry = buildRegistry(editor)
		const results = buildQueryResults(registry, 'Pose')

		// "Pose" itself (a name match, rank 0) outranks "Estimator" (matched only
		// through its expression, rank 1) — but the mapping still appears.
		expect(results.map((entry) => entry.name)).toEqual(['Pose', 'Estimator'])
		const estimator = results.find((entry) => entry.name === 'Estimator')!
		expect(estimator.kind).toBe('mapped-type')
		expect(estimator.detail).toBe('= Callable[[Frame, float], Pose]')
		// The insertable value is always the alias's NAME, never the raw expression.
		expect(estimator.name).toBe('Estimator')
	})

	it('orders the browse list board-type, then mapped-type, then primitive, regardless of registry order', () => {
		const page = PageRecordType.createId('board')
		const editor = makeEditor([
			block('pose', page, 'Pose', 'type'),
			mappingBlock('mapping', page, 'Estimator = Callable[[Frame, float], Pose]'),
		])
		const registry = buildRegistry(editor)
		const browse = buildBrowseList(registry)
		const kinds = browse.map((entry) => entry.kind)
		expect(kinds.indexOf('board-type')).toBeLessThan(kinds.indexOf('mapped-type'))
		expect(kinds.indexOf('mapped-type')).toBeLessThan(kinds.indexOf('primitive'))
		expect(browse).toHaveLength(registry.length)
	})

	it('does not bury a primitive under an unrelated board-type substring match in query mode', () => {
		const page = PageRecordType.createId('board')
		const editor = makeEditor([
			// Contains "float" as a substring, but does not START with it.
			block('afloater', page, 'AutoFloatSensor', 'type'),
		])
		const registry = buildRegistry(editor)
		const results = buildQueryResults(registry, 'float')
		expect(results[0]).toMatchObject({ kind: 'primitive', name: 'float' })
		expect(results.map((entry) => entry.name)).toContain('AutoFloatSensor')
	})

	it('an empty query yields no query-mode results (the caller shows a browse/prompt state instead)', () => {
		const editor = makeEditor([])
		expect(buildQueryResults(buildRegistry(editor), '')).toEqual([])
		expect(buildQueryResults(buildRegistry(editor), '   ')).toEqual([])
	})
})

describe('type-slot caret detection', () => {
	it('is not active before the colon', () => {
		expect(findTypeSlot('pose: Pose', 2)).toBeNull()
	})

	it('is active with an empty query right after the colon', () => {
		expect(findTypeSlot('pose:', 5)).toEqual({ start: 5, query: '' })
	})

	it('is active with the typed query up to the caret', () => {
		expect(findTypeSlot('pose: Po', 8)).toEqual({ start: 6, query: 'Po' })
	})

	it('is not active once the caret sits past a trailing default value', () => {
		expect(findTypeSlot('pose: Pose = 10', 15)).toBeNull()
	})

	it('is not active on a line that does not parse as `name: type` at all', () => {
		expect(findTypeSlot('this is not ready', 5)).toBeNull()
	})

	it('finds the slot on the caret\'s own line inside a multi-line source', () => {
		const source = 'pose: Pose\nquality: fl'
		expect(findTypeSlot(source, source.length)).toEqual({ start: 20, query: 'fl' })
	})
})

describe('expression type-slot caret detection (Type Mapping grammar)', () => {
	it('is not active before the =', () => {
		expect(findExpressionTypeSlot('Estimator = Callable[Pose]', 3)).toBeNull()
	})

	it('finds the identifier run touching the caret, wherever it sits in the expression', () => {
		const value = 'Estimator = Callable[[Frame, float], Pose]'
		const caret = value.indexOf('Pose') + 2 // caret inside "Po|se"
		expect(findExpressionTypeSlot(value, caret)).toEqual({ start: value.indexOf('Pose'), query: 'Po' })
	})

	it('is active with an empty query right after opening punctuation, like a real IDE', () => {
		const value = 'Estimator = Callable[[Frame, float], Pose]'
		const caret = value.indexOf('[[') + 1
		expect(findExpressionTypeSlot(value, caret)).toEqual({ start: caret, query: '' })
	})

	it('is active with an empty query right after the =', () => {
		expect(findExpressionTypeSlot('Client = ', 9)).toEqual({ start: 9, query: '' })
	})

	it('does not activate on a line that is not `Name = expr` at all', () => {
		expect(findExpressionTypeSlot('not an alias line', 5)).toBeNull()
	})
})

describe('accept replaces only the query span', () => {
	it('leaves a trailing default value intact', () => {
		const value = 'pose: Po = 10'
		const slot = findTypeSlot(value, 8)!
		expect(slot).toEqual({ start: 6, query: 'Po' })
		expect(applyAcceptance(value, slot, 8, 'Pose')).toEqual({ value: 'pose: Pose = 10', caret: 10 })
	})

	it('inserts at the end of the line when there is nothing after the caret', () => {
		const value = 'pose:'
		const slot = findTypeSlot(value, 5)!
		expect(applyAcceptance(value, slot, 5, 'Pose')).toEqual({ value: 'pose:Pose', caret: 9 })
	})
})
