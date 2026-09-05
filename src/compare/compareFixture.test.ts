/**
 * The model, run against the real review fixture rather than hand-built input.
 *
 * `compareModel.test.ts` pins the rules in isolation. This one pins that the
 * rules survive contact with an actual `.systemsketch` written by the real
 * editor through the real autosave path — the file Zach will open. If the
 * fixture and the panel ever disagree about what changed, this fails first.
 */

import { describe, expect, it } from 'vitest'

// The real files, read the way the bundler reads them, so this test cannot
// drift from what the app ships.
import currentSource from '../../sketches/review/diff-review-modal.systemsketch?raw'
import v1Source from '../../sketches/review/diff-review-modal.v1.systemsketch?raw'
import v2Source from '../../sketches/review/diff-review-modal.v2.systemsketch?raw'
import { compareBoards, type RecordMap } from './compareModel'

function boardRecords(source: string): RecordMap {
	const document = JSON.parse(source) as { records: unknown[] }
	const records: Record<string, RecordMap[string]> = {}
	for (const entry of document.records) {
		const record = entry as RecordMap[string]
		records[record.id] = record
	}
	return records
}

const v1 = boardRecords(v1Source)
const v2 = boardRecords(v2Source)
const current = boardRecords(currentSource)

describe('the review fixture exercises every state', () => {
	const { changes, tally } = compareBoards(v1, current)
	const find = (id: string) => changes.find((change) => change.id === id)

	it('renames the Block, and the rename is a modification', () => {
		const change = find('block:shape:predict')
		expect(change?.kind).toBe('modified')
		expect(change?.fields).toEqual([
			{ path: 'title', before: 'run_inference', after: 'run_predict' },
		])
	})

	it('reports the gained port as an insertion', () => {
		expect(find('port:shape:predict:in_threshold')?.kind).toBe('added')
	})

	it('reports the lost port as a deletion, anchored only on the before board', () => {
		const change = find('port:shape:predict:in_model')
		expect(change?.kind).toBe('removed')
		expect(change?.anchorAfter).toBeNull()
		expect(change?.anchorBefore).toBe('shape:predict')
	})

	it('reports the changed port type as a modification of that port', () => {
		const change = find('port:shape:overlay:out_image')
		expect(change?.kind).toBe('modified')
		expect(change?.fields).toEqual([{ path: 'type', before: 'RGB', after: 'RGBA' }])
	})

	it('reports the rewired cable by the ports it moved between', () => {
		const change = find('cable:shape:cable_xm')
		expect(change?.kind).toBe('modified')
		expect(change?.fields).toEqual([
			{
				path: 'endpoint.start',
				before: 'load_frames.frames',
				after: 'run_predict.boxes',
			},
		])
	})

	it('produces all three states and nothing else', () => {
		expect({ ...tally.block, ...{} }).toEqual({ added: 0, removed: 0, modified: 1 })
		expect(tally.port).toEqual({ added: 1, removed: 1, modified: 1 })
		expect(tally.cable).toEqual({ added: 0, removed: 0, modified: 1 })
		// The cue cards and their arrow are identical in both files, so an
		// unchanged thing produces no row — the contract's zero-change case.
		expect(tally.shape).toEqual({ added: 0, removed: 0, modified: 0 })
	})
})

describe('a nearer version shows fewer changes', () => {
	it('v2 differs from current only by the rename and the rewire', () => {
		const { changes } = compareBoards(v2, current)
		expect(changes.map((change) => change.id).sort()).toEqual([
			'block:shape:predict',
			'cable:shape:cable_xm',
		])
	})

	it('comparing a version with itself is a board with no changes', () => {
		expect(compareBoards(current, current).total).toBe(0)
	})
})
