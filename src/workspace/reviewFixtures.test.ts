import { describe, expect, it } from 'vitest'

import { createSystemSketchStore } from '../store/createSystemSketchStore'
import { inspectWorkspaceDocumentSource } from './workspaceDocument'

const REVIEW_BOARDS = Object.entries(import.meta.glob<string>(
	'../../sketches/review/*.systemsketch',
	{ eager: true, import: 'default', query: '?raw' },
)).sort(([a], [b]) => a.localeCompare(b))

describe('committed review boards', () => {
	const schema = createSystemSketchStore().schema

	it.each(REVIEW_BOARDS)('loads %s with the current product schema', (_path, source) => {
		const result = inspectWorkspaceDocumentSource(source, schema)
		expect(result.kind).toBe('ready')
	})
})
