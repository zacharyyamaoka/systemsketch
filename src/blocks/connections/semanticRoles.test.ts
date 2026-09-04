import { describe, expect, it } from 'vitest'
import type { Editor, TLShapeId } from 'tldraw'

import { BLOCK_SHAPE_TYPE, getDefaultBlockProps, type BlockShape } from '../blockModel'
import { CONNECTION_BINDING_TYPE, CONNECTION_SHAPE_TYPE } from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'
import {
	resolveBlockPortSemanticRole,
	resolveConnectionSemanticRole,
	resolveHostPortSemanticRole,
	resolveLivePortSemanticRole,
} from './semanticRoles'

function block(id: string, inputs: BlockShape['props']['inputs'], outputs: BlockShape['props']['outputs']): BlockShape {
	return {
		id: `shape:${id}` as TLShapeId, typeName: 'shape', type: BLOCK_SHAPE_TYPE,
		x: 0, y: 0, rotation: 0, index: 'a1' as BlockShape['index'], parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false, opacity: 1, meta: {}, props: { ...getDefaultBlockProps(), inputs, outputs },
	}
}

function connectionFixture(source: BlockShape, sink: BlockShape, bindingsOverride?: object[]) {
	const cable = {
		id: 'shape:cable' as TLShapeId, typeName: 'shape', type: CONNECTION_SHAPE_TYPE,
		x: 0, y: 0, rotation: 0, index: 'a2', parentId: 'page:page', isLocked: false, opacity: 1, meta: {},
		props: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, routing: 'elbow', curve: null, pins: [], elbowRoute: null, routeMode: 'automatic', temporal: 'data', delayValue: '', pillPosition: .5, tunnel: false, tunnelLayer: '', state: 'normal' },
	} as unknown as ConnectionShape
	const bindings = bindingsOverride ?? [
		{ id: 'binding:source', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: cable.id, toId: source.id, props: { portId: 'out', terminal: 'start', face: 'outer' }, meta: {} },
		{ id: 'binding:sink', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: cable.id, toId: sink.id, props: { portId: 'in', terminal: 'end', face: 'outer' }, meta: {} },
	]
	const shapes = new Map<TLShapeId, unknown>([[source.id, source], [sink.id, sink], [cable.id, cable]])
	const editor = {
		store: undefined,
		getShape: (id: TLShapeId) => shapes.get(id),
		getBindingsFromShape: (id: TLShapeId, type: string) => type === CONNECTION_BINDING_TYPE && id === cable.id ? bindings : [],
	} as unknown as Editor
	return { editor, cable }
}

describe('semantic port roles', () => {
	it('keeps authored override over derived claim and clearing exposes—not destroys—the provenance', () => {
		const port = {
			id: 'out', name: 'message', type: 'Message', visible: true,
			semanticRoleDerived: { role: 'event' as const, source: 'event analyzer', analyzer: 'pyblocks' },
			semanticRoleAuthored: { role: 'error' as const },
		}
		expect(resolveBlockPortSemanticRole(port)).toMatchObject({ role: 'error', origin: 'authored' })
		const cleared = { ...port, semanticRoleAuthored: undefined }
		expect(resolveBlockPortSemanticRole(cleared)).toMatchObject({ role: 'event', origin: 'derived', claim: { source: 'event analyzer' } })
	})

	it('derives a wire live from source first, falls back to its sink, and reports disagreements without vetoing it', () => {
		const source = block('source', [], [{ id: 'out', name: 'tick', type: 'Tick', visible: true, semanticRoleAuthored: { role: 'event' } }])
		const sink = block('sink', [{ id: 'in', name: 'gate', type: 'Tick', visible: true, semanticRoleDerived: { role: 'control', source: 'signature' } }], [])
		const { editor, cable } = connectionFixture(source, sink)
		const result = resolveConnectionSemanticRole(editor, cable)
		expect(result.effective).toMatchObject({ role: 'event', origin: 'authored' })
		expect(result).toMatchObject({ conflict: true, label: 'Event → Control' })
		expect(result.warning).toContain('remains legal')
	})

	it('keeps data implicit and treats a branch band as synthesized Control', () => {
		expect(resolveBlockPortSemanticRole({ id: 'x', name: '', type: '', visible: true })).toMatchObject({ role: 'data', origin: 'implicit' })
		const branch = { type: 'branch', props: { controls: [{ id: 'when', name: 'when', type: 'bool' }] } } as never
		expect(resolveHostPortSemanticRole(branch, 'when')).toMatchObject({ role: 'control', origin: 'derived' })
	})

	it('never converts missing hosts, missing ports, or duplicate terminal records into implicit Data', () => {
		const source = block('source', [], [{ id: 'out', name: 'tick', type: 'Tick', visible: true, semanticRoleAuthored: { role: 'event' } }])
		const sink = block('sink', [{ id: 'in', name: 'gate', type: 'Tick', visible: true, semanticRoleDerived: { role: 'control' } }], [])
		const invalid = (toId: TLShapeId, portId: string) => [
			{ id: 'binding:source', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: 'shape:cable', toId, props: { portId, terminal: 'start', face: 'outer' }, meta: {} },
			{ id: 'binding:sink', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: 'shape:cable', toId: sink.id, props: { portId: 'in', terminal: 'end', face: 'outer' }, meta: {} },
		]

		for (const bindings of [invalid('shape:gone' as TLShapeId, 'out'), invalid(source.id, 'gone')]) {
			const { editor, cable } = connectionFixture(source, sink, bindings)
			expect(resolveConnectionSemanticRole(editor, cable)).toMatchObject({
				effective: null, halfBound: true, malformed: true, label: 'Malformed connection',
			})
		}

		const duplicate = [
			...invalid(source.id, 'out'),
			{ id: 'binding:duplicate-start', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: 'shape:cable', toId: source.id, props: { portId: 'out', terminal: 'start', face: 'outer' }, meta: {} },
		]
		const { editor, cable } = connectionFixture(source, sink, duplicate)
		expect(resolveConnectionSemanticRole(editor, cable)).toMatchObject({
			effective: null, halfBound: true, malformed: true, label: 'Malformed connection',
		})
		expect(resolveLivePortSemanticRole(editor, source.id, 'gone')).toBeNull()
	})

	it('uses the live inner-face direction when terminal order is reversed', () => {
		const source = block('source', [], [{ id: 'out', name: 'tick', type: 'Tick', visible: true, semanticRoleAuthored: { role: 'event' } }])
		const sink = block('sink', [{ id: 'in', name: 'gate', type: 'Tick', visible: true, semanticRoleDerived: { role: 'control' } }], [])
		const reversed = [
			// An input on the inner face emits into its containing scope.
			{ id: 'binding:start', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: 'shape:cable', toId: sink.id, props: { portId: 'in', terminal: 'start', face: 'inner' }, meta: {} },
			{ id: 'binding:end', typeName: 'binding', type: CONNECTION_BINDING_TYPE, fromId: 'shape:cable', toId: source.id, props: { portId: 'out', terminal: 'end', face: 'inner' }, meta: {} },
		]
		const { editor, cable } = connectionFixture(source, sink, reversed)
		expect(resolveConnectionSemanticRole(editor, cable)).toMatchObject({
			effective: { role: 'control', origin: 'derived' }, source: { role: 'control' }, sink: { role: 'event' }, conflict: true,
			label: 'Control → Event', malformed: false,
		})
	})
})
