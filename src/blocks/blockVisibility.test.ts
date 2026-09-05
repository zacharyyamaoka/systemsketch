import { createShapeId, type Editor, type TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps, type BlockShape } from './blockModel'
import { getBlockShapeVisibility } from './blockVisibility'
import { stepIntoDepthScope } from '../depth/depthNavigation'

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

	it('hides a directly parented connection before applying Branch endpoint rules', () => {
		const parent = block('port')
		const connection = { ...child(parent.id), type: 'connection' } as TLShape
		expect(getBlockShapeVisibility(connection, editorWith(parent))).toBe('hidden')
	})

	it('lets children inherit normal visibility while their Block is expanded', () => {
		const parent = block('expanded')
		expect(getBlockShapeVisibility(child(parent.id), editorWith(parent))).toBe('inherit')
	})

	it('does not hide page-owned shapes or external cables', () => {
		const parent = block('simple')
		expect(getBlockShapeVisibility(child('page:page'), editorWith(parent))).toBe('inherit')
	})

	it('isolates the active Expanded Block through editor visibility rather than a screen mask', () => {
		const scope = block('expanded')
		const inside = child(scope.id)
		const outside = child('page:page')
		const shapes = new Map([scope, inside, outside].map((shape) => [shape.id, shape]))
		const editor = {
			getShape: (id: TLShape['id']) => shapes.get(id),
			getShapeAncestors: (shape: TLShape) => shape.parentId === scope.id ? [scope] : [],
			hasAncestor: (shape: TLShape, id: TLShape['id']) => shape.parentId === id,
			getAncestorPageId: () => 'page:page',
			getCurrentPageId: () => 'page:page',
			getCurrentPage: () => ({ id: 'page:page', name: 'Page 1' }),
			getPage: () => ({ id: 'page:page', name: 'Page 1' }),
			getShapePageBounds: () => ({ x: 0, y: 0, w: 400, h: 300 }),
			getCamera: () => ({ x: 0, y: 0, z: 1 }),
			getSelectedShapeIds: () => [],
			setCurrentTool: () => undefined,
			selectNone: () => undefined,
			zoomToBounds: () => undefined,
		} as unknown as Editor

		expect(stepIntoDepthScope(editor, scope.id)).toBe(true)
		expect(getBlockShapeVisibility(scope, editor)).toBe('visible')
		expect(getBlockShapeVisibility(inside, editor)).toBe('inherit')
		expect(getBlockShapeVisibility(outside, editor)).toBe('hidden')
	})
})
