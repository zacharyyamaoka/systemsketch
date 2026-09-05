import { describe, expect, it } from 'vitest'

import { getSemanticTagsVisible, setSemanticTagsVisible } from './semanticTagVisibility'

function fixture(meta: Record<string, unknown> = {}) {
	const document = { id: 'document:document', meta }
	let written: typeof document | null = null
	const editor = {
		getDocumentSettings: () => document,
		store: { put: (records: typeof document[]) => { written = records[0] } },
	}
	return { editor, written: () => written }
}

describe('semantic tag visibility', () => {
	it('defaults existing boards to visible, then persists a board-wide canvas lens', () => {
		const board = fixture({ retained: 'metadata' })
		expect(getSemanticTagsVisible(board.editor as never)).toBe(true)

		setSemanticTagsVisible(board.editor as never, false)
		expect(board.written()).toMatchObject({ meta: { retained: 'metadata', 'systemsketch:semanticTagsVisible': false } })
		expect(getSemanticTagsVisible({ ...board.editor, getDocumentSettings: () => board.written()! } as never)).toBe(false)
	})
})
