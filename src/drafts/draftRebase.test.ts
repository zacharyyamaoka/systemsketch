import type { TLStoreSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { recordsOfSnapshot, type RecordMap } from '../compare/compareModel'
import { computeRebase } from './draftRebase'

/** Same fixture shape as compareModel.test.ts, just wrapped as a loadable snapshot. */
function block(id: string, props: Record<string, unknown>): [string, RecordMap[string]] {
	return [
		id,
		{
			id,
			typeName: 'shape',
			type: 'block',
			props: { title: '', description: '', blockType: '', inputs: [], outputs: [], ...props },
		},
	]
}

/**
 * The same Block with a real pose. `x`/`y` live on the record, NOT in `props`,
 * which is exactly why a props-only display diff cannot see a drag.
 */
function blockAt(id: string, x: number, y: number, props: Record<string, unknown>): [string, RecordMap[string]] {
	const [, record] = block(id, props)
	return [id, { ...record, x, y } as unknown as RecordMap[string]]
}

function port(id: string, name: string, type = '', defaultValue = '') {
	return { id, name, type, visible: true, defaultValue }
}

function cable(id: string, props: Record<string, unknown> = {}): [string, RecordMap[string]] {
	return [
		id,
		{
			id,
			typeName: 'shape',
			type: 'connection',
			props: { temporal: 'data', delayValue: '', routing: 'elbow', ...props },
		},
	]
}

function binding(
	id: string,
	fromId: string,
	toId: string,
	portId: string,
	terminal: string,
): [string, RecordMap[string]] {
	return [id, { id, typeName: 'binding', type: 'connection', fromId, toId, props: { portId, terminal } }]
}

/** A shape whose `parentId` (not modelled on `RecordLike`, real on a `TLShape`) matters to the test. */
function shapeParentedTo(id: string, parentId: string): [string, RecordMap[string]] {
	return [id, { id, typeName: 'shape', type: 'geo', props: {}, parentId } as unknown as RecordMap[string]]
}

function snapshot(entries: Array<[string, RecordMap[string]]>): TLStoreSnapshot {
	return { store: Object.fromEntries(entries), schema: { schemaVersion: 2, sequences: {} } } as unknown as TLStoreSnapshot
}

const FAKE_SCHEMA = { schemaVersion: 2, sequences: {} }

describe('computeRebase — no changes on either side', () => {
	it('succeeds trivially, producing Main unchanged', () => {
		const base = snapshot([block('shape:a', { title: 'load' })])
		const result = computeRebase({ base, draftHead: base, freshMain: base })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected ok')
		expect(recordsOfSnapshot(result.snapshot)).toEqual(recordsOfSnapshot(base))
		expect(result.snapshot.schema).toEqual(FAKE_SCHEMA)
	})
})

describe('computeRebase — disjoint changes', () => {
	it('merges the draft\'s own change together with Main\'s independent one', () => {
		const base = snapshot([
			block('shape:a', { title: 'load' }),
			block('shape:b', { title: 'predict' }),
		])
		// Main independently retitles shape:a.
		const freshMain = snapshot([
			block('shape:a', { title: 'load_v2' }),
			block('shape:b', { title: 'predict' }),
		])
		// The draft independently retitles the OTHER Block, shape:b.
		const draftHead = snapshot([
			block('shape:a', { title: 'load' }),
			block('shape:b', { title: 'predict_v2' }),
		])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected ok')
		const merged = recordsOfSnapshot(result.snapshot)
		expect(merged['shape:a'].props?.title).toBe('load_v2')
		expect(merged['shape:b'].props?.title).toBe('predict_v2')
	})

	it('carries a brand-new draft record (and its binding) into the merge untouched', () => {
		const base = snapshot([block('shape:a', { title: 'load', outputs: [port('out-f', 'frames')] })])
		const freshMain = snapshot([block('shape:a', { title: 'load_v2', outputs: [port('out-f', 'frames')] })])
		const draftHead = snapshot([
			block('shape:a', { title: 'load', outputs: [port('out-f', 'frames')] }),
			block('shape:d', { title: 'log', inputs: [port('in-d', 'data')] }),
			cable('shape:c'),
			binding('binding:1', 'shape:c', 'shape:a', 'out-f', 'start'),
			binding('binding:2', 'shape:c', 'shape:d', 'in-d', 'end'),
		])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected ok')
		const merged = recordsOfSnapshot(result.snapshot)
		expect(merged['shape:a'].props?.title).toBe('load_v2')
		expect(merged['shape:d']).toBeDefined()
		expect(merged['shape:c']).toBeDefined()
		expect(merged['binding:1']).toBeDefined()
		expect(merged['binding:2']).toBeDefined()
	})
})

describe('computeRebase — same-record conflict', () => {
	it('blocks when both sides modify the same field of the same record', () => {
		const base = snapshot([block('shape:a', { title: 'load' })])
		const freshMain = snapshot([block('shape:a', { title: 'load_main' })])
		const draftHead = snapshot([block('shape:a', { title: 'load_draft' })])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result).toEqual({ ok: false, conflictCount: 1 })
	})

	it('blocks when both sides edit the SAME field of a record neither added nor removed', () => {
		// The inverse of the clean same-record merges below: one field, two
		// different new values, nothing to choose between them.
		const base = snapshot([block('shape:a', { title: 'run()', inputs: [port('in-x', 'x')] })])
		const freshMain = snapshot([block('shape:a', { title: 'run()', inputs: [port('in-x', 'x'), port('in-main', 'from_main')] })])
		const draftHead = snapshot([block('shape:a', { title: 'run()', inputs: [port('in-x', 'x'), port('in-draft', 'from_draft')] })])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(false)
		if (result.ok) throw new Error('expected blocked')
		expect(result.conflictCount).toBe(1)
	})
})

describe('computeRebase — same record, different fields', () => {
	/**
	 * The regression these three cover: a display-oriented diff decided which
	 * records conflicted while a raw diff decided what to copy, so an edit the
	 * display diff did not look at (a move) let the draft's whole stale record
	 * overwrite a real Main edit, and the rebase still reported success.
	 */
	it('keeps Main\'s rename AND the draft\'s move of the very same shape', () => {
		const base = snapshot([blockAt('shape:a', 100, 200, { title: 'run()' })])
		// Main renames it and never moves it.
		const freshMain = snapshot([blockAt('shape:a', 100, 200, { title: 'run_MAIN_IMPORTANT' })])
		// The draft only drags it — the title is still the original.
		const draftHead = snapshot([blockAt('shape:a', 640, 480, { title: 'run()' })])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected a clean rebase')
		const shape = recordsOfSnapshot(result.snapshot)['shape:a'] as unknown as Record<string, unknown>
		// Neither side's real edit is lost.
		expect((shape.props as Record<string, unknown>).title).toBe('run_MAIN_IMPORTANT')
		expect(shape.x).toBe(640)
		expect(shape.y).toBe(480)
	})

	it('merges a Main rename with a draft port addition on one Block', () => {
		// WHY this is no longer a conflict: title and ports are different
		// fields, and blocking here left the user no resolution UI and only
		// destructive ways out — discard the draft (lose the port) or discard
		// Main (lose the rename). Merging keeps both, which is what a person
		// doing it by hand would produce.
		const base = snapshot([block('shape:a', { title: 'load', inputs: [port('in-x', 'x')] })])
		const freshMain = snapshot([block('shape:a', { title: 'load_v2', inputs: [port('in-x', 'x')] })])
		const draftHead = snapshot([
			block('shape:a', { title: 'load', inputs: [port('in-x', 'x'), port('in-y', 'y')] }),
		])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected a clean rebase')
		const props = recordsOfSnapshot(result.snapshot)['shape:a'].props as Record<string, unknown>
		expect(props.title).toBe('load_v2')
		expect(props.inputs).toEqual([port('in-x', 'x'), port('in-y', 'y')])
	})

	it('does not call it a conflict when both sides made the identical edit', () => {
		const base = snapshot([block('shape:a', { title: 'load' })])
		const converged = snapshot([block('shape:a', { title: 'load_v2' })])

		const result = computeRebase({ base, draftHead: converged, freshMain: converged })
		expect(result.ok).toBe(true)
		if (!result.ok) throw new Error('expected a clean rebase')
		expect(recordsOfSnapshot(result.snapshot)['shape:a'].props?.title).toBe('load_v2')
	})

	it('still blocks when Main deletes a record the draft edited', () => {
		const base = snapshot([block('shape:a', { title: 'load' })])
		const freshMain = snapshot([])
		const draftHead = snapshot([block('shape:a', { title: 'load_draft' })])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result).toEqual({ ok: false, conflictCount: 1 })
	})
})

describe('computeRebase — dangling reference conflict', () => {
	it('blocks when Main deletes a Block the draft independently wired a cable to', () => {
		const base = snapshot([
			block('shape:a', { title: 'load', outputs: [port('out-f', 'frames')] }),
			block('shape:d', { title: 'log', inputs: [port('in-d', 'data')] }),
		])
		// Main deletes shape:a entirely — no shared id with the draft's own change below.
		const freshMain = snapshot([
			block('shape:d', { title: 'log', inputs: [port('in-d', 'data')] }),
		])
		// The draft, unaware, adds a cable wiring shape:a to shape:d.
		const draftHead = snapshot([
			block('shape:a', { title: 'load', outputs: [port('out-f', 'frames')] }),
			block('shape:d', { title: 'log', inputs: [port('in-d', 'data')] }),
			cable('shape:c'),
			binding('binding:1', 'shape:c', 'shape:a', 'out-f', 'start'),
			binding('binding:2', 'shape:c', 'shape:d', 'in-d', 'end'),
		])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(false)
		if (result.ok) throw new Error('expected blocked')
		// binding:1 dangles (toId shape:a is gone) — one broken record, not two.
		expect(result.conflictCount).toBe(1)
	})

	it('blocks when a shape\'s parent shape (a frame/region) was independently removed', () => {
		const frame: [string, RecordMap[string]] = ['shape:frame', { id: 'shape:frame', typeName: 'shape', type: 'frame', props: {} }]
		const base = snapshot([frame])
		const freshMain = snapshot([])
		const draftHead = snapshot([frame, shapeParentedTo('shape:child', 'shape:frame')])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(false)
		if (result.ok) throw new Error('expected blocked')
		expect(result.conflictCount).toBe(1)
	})

	it('does not flag a shape parented directly to a page', () => {
		const base = snapshot([])
		const freshMain = snapshot([])
		const draftHead = snapshot([shapeParentedTo('shape:child', 'page:main')])

		const result = computeRebase({ base, draftHead, freshMain })
		expect(result.ok).toBe(true)
	})
})
