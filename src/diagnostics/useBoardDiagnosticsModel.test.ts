import type { RecordsDiff, TLRecord } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { boardDiagnosticsMayHaveChanged } from './useBoardDiagnosticsModel'

const asRecord = (record: object) => record as TLRecord
const empty = (): RecordsDiff<TLRecord> => ({ added: {}, updated: {}, removed: {} })

function block(id: string, x: number, props: object): TLRecord {
	return asRecord({
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'block',
		x,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId: 'page:page',
		props,
	})
}

function connection(id: string, props: object, parentId = 'page:page'): TLRecord {
	return asRecord({
		id: `shape:${id}`,
		typeName: 'shape',
		type: 'connection',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a2',
		parentId,
		props,
	})
}

describe('board diagnostics store subscription', () => {
	it('ignores per-frame transforms when semantic props and ancestry are unchanged', () => {
		const props = { title: 'Parser', inputs: [], outputs: [] }
		const before = block('parser', 10, props)
		const after = block('parser', 120, props)
		const changes = empty()
		changes.updated[before.id] = [before, after]

		expect(boardDiagnosticsMayHaveChanged(changes)).toBe(false)
	})

	it('ignores in-flight cable geometry but refreshes when the cable changes scope', () => {
		const before = connection('cable', { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } })
		const dragged = connection('cable', { start: { x: 0, y: 0 }, end: { x: 120, y: 90 } })
		const dragChanges = empty()
		dragChanges.updated[before.id] = [before, dragged]

		const reparented = connection('cable', dragged.typeName === 'shape' ? dragged.props : {}, 'shape:scope')
		const reparentChanges = empty()
		reparentChanges.updated[dragged.id] = [dragged, reparented]

		expect(boardDiagnosticsMayHaveChanged(dragChanges)).toBe(false)
		expect(boardDiagnosticsMayHaveChanged(reparentChanges)).toBe(true)
	})

	it('refreshes when a diagnostic shape changes props or parent', () => {
		const before = block('parser', 10, { title: '', inputs: [], outputs: [] })
		const repaired = block('parser', 10, { title: 'Parser', inputs: [], outputs: [] })
		const repairedChanges = empty()
		repairedChanges.updated[before.id] = [before, repaired]

		const reparented = { ...repaired, parentId: 'shape:scope' } as TLRecord
		const reparentChanges = empty()
		reparentChanges.updated[repaired.id] = [repaired, reparented]

		expect(boardDiagnosticsMayHaveChanged(repairedChanges)).toBe(true)
		expect(boardDiagnosticsMayHaveChanged(reparentChanges)).toBe(true)
	})

	it('refreshes for diagnostic records entering or leaving the document', () => {
		const shape = block('parser', 0, { title: 'Parser', inputs: [], outputs: [] })
		const added = empty()
		added.added[shape.id] = shape
		const removed = empty()
		removed.removed[shape.id] = shape

		expect(boardDiagnosticsMayHaveChanged(added)).toBe(true)
		expect(boardDiagnosticsMayHaveChanged(removed)).toBe(true)
	})

	it('ignores unrelated records but refreshes connection bindings and pages', () => {
		const pointer = asRecord({ id: 'pointer:pointer', typeName: 'pointer', x: 0, y: 0 })
		const pointerAfter = { ...pointer, x: 12 } as TLRecord
		const pointerChanges = empty()
		pointerChanges.updated[pointer.id] = [pointer, pointerAfter]

		const binding = asRecord({
			id: 'binding:cable-start',
			typeName: 'binding',
			type: 'connection',
			fromId: 'shape:cable',
			toId: 'shape:parser',
			props: { terminal: 'start', portId: 'out', face: 'outer' },
		})
		const bindingChanges = empty()
		bindingChanges.added[binding.id] = binding

		const page = asRecord({ id: 'page:page', typeName: 'page', name: 'Board', index: 'a1' })
		const pageChanges = empty()
		pageChanges.updated[page.id] = [page, { ...page, name: 'Runtime' } as TLRecord]

		expect(boardDiagnosticsMayHaveChanged(pointerChanges)).toBe(false)
		expect(boardDiagnosticsMayHaveChanged(bindingChanges)).toBe(true)
		expect(boardDiagnosticsMayHaveChanged(pageChanges)).toBe(true)
	})
})
