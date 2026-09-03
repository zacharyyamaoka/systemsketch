import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, type BlockShape } from './blockModel'
import type { ConnectionBinding } from './connections/ConnectionBindingUtil'
import type { ConnectionShape } from './connections/ConnectionShapeUtil'
import {
	expandedScopeHasBoundaryConnection,
	getSelectedExpandedBlockLayoutScope,
} from './expandedBlockLayoutScope'
import { canOrganizeNodes } from './layout'

function block(
	id: string,
	parentId = 'page:page',
	view: BlockShape['props']['view'] = 'simple',
): BlockShape {
	return {
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: { ...getDefaultBlockProps(), view },
	} as BlockShape
}

function connection(id: string, parentId: string): ConnectionShape {
	return {
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'connection',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId,
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
			temporal: 'data',
			delayValue: '',
			pillPosition: 0.5,
		},
	} as unknown as ConnectionShape
}

function binding(
	connectionId: string,
	toId: string,
	terminal: 'start' | 'end',
	face: 'inner' | 'outer' = 'outer',
): ConnectionBinding {
	return {
		id: `binding:${connectionId}:${terminal}`,
		typeName: 'binding',
		type: 'connection',
		fromId: `shape:${connectionId}`,
		toId,
		meta: {},
		props: { terminal, face, portId: terminal === 'start' ? 'out' : 'in' },
	} as ConnectionBinding
}

describe('expanded Block layout scope', () => {
	it('collects immediate Blocks and directly owned cables without descending or leaking out', () => {
		const parent = block('parent', 'page:page', 'expanded')
		const child = block('child', parent.id)
		const nested = block('nested', parent.id, 'expanded')
		const grandchild = block('grandchild', nested.id)
		const interior = connection('interior', parent.id)
		const nestedInterior = connection('nested-interior', nested.id)
		const exterior = connection('exterior', 'page:page')
		const shapes = [parent, child, nested, grandchild, interior, nestedInterior, exterior]
		const editor = {
			getSelectedShapes: () => [parent],
			getCurrentPageShapes: () => shapes,
		} as never

		const scope = getSelectedExpandedBlockLayoutScope(editor)
		expect(scope?.childBlocks.map((shape) => shape.id)).toEqual([child.id, nested.id])
		expect(scope?.connections.map((shape) => shape.id)).toEqual([interior.id])
	})

	it('enables one boundary-connected child but not one arbitrary disconnected child', () => {
		const parent = block('parent', 'page:page', 'expanded')
		const child = block('child', parent.id)
		const edge = connection('boundary', parent.id)
		const bindings = [
			binding('boundary', parent.id, 'start', 'inner'),
			binding('boundary', child.id, 'end'),
		]
		const base = {
			getSelectedShapeIds: () => [parent.id],
			getSelectedShapes: () => [parent],
			getBindingsFromShape: () => bindings,
		}
		const disconnectedEditor = {
			...base,
			getCurrentPageShapes: () => [parent, child],
		} as never
		const connectedEditor = {
			...base,
			getCurrentPageShapes: () => [parent, child, edge],
		} as never

		expect(canOrganizeNodes(disconnectedEditor)).toBe(false)
		expect(canOrganizeNodes(connectedEditor)).toBe(true)
		const scope = getSelectedExpandedBlockLayoutScope(connectedEditor)!
		expect(expandedScopeHasBoundaryConnection(connectedEditor, scope)).toBe(true)
	})

	it('enables two immediate children and leaves the normal two-selected-Block rule intact', () => {
		const parent = block('parent', 'page:page', 'expanded')
		const a = block('a', parent.id)
		const b = block('b', parent.id)
		const scopedEditor = {
			getSelectedShapeIds: () => [parent.id],
			getSelectedShapes: () => [parent],
			getCurrentPageShapes: () => [parent, a, b],
			getBindingsFromShape: () => [],
		} as never
		const selectionEditor = {
			getSelectedShapeIds: () => [a.id, b.id],
			getSelectedShapes: () => [a, b],
			getCurrentPageShapes: () => [parent, a, b],
		} as never

		expect(canOrganizeNodes(scopedEditor)).toBe(true)
		expect(canOrganizeNodes(selectionEditor)).toBe(true)
	})
})
