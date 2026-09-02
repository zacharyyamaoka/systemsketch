import { createShapeId, type Editor, type TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'
import { getBlockShapeVisibility } from './blockVisibility'

function block(view: BlockShape['props']['view']): BlockShape {
	return {
		id: createShapeId('container'),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: setBlockViewProps(getDefaultBlockProps(), view),
	}
}

function child(parentId: BlockShape['id'] | 'page:page'): TLShape {
	return {
		id: createShapeId('child'),
		typeName: 'shape',
		type: 'geo',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a2' as TLShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {},
	} as TLShape
}

function editorWith(parent: BlockShape): Editor {
	return {
		getShape: (id: string) => id === parent.id ? parent : undefined,
	} as unknown as Editor
}

describe('Block child visibility', () => {
	for (const view of ['simple', 'port'] as const) {
		it(`hides a direct child while its Block parent is ${view}`, () => {
			const parent = block(view)
			expect(getBlockShapeVisibility(child(parent.id), editorWith(parent))).toBe('hidden')
		})
	}

	it('lets children inherit normal visibility while their Block is expanded', () => {
		const parent = block('expanded')
		expect(getBlockShapeVisibility(child(parent.id), editorWith(parent))).toBe('inherit')
	})

	it('does not hide page-owned shapes or external cables', () => {
		const parent = block('simple')
		expect(getBlockShapeVisibility(child('page:page'), editorWith(parent))).toBe('inherit')
	})
})
