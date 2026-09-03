import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createSystemSketchStore } from '../store/createSystemSketchStore'
import { inspectWorkspaceDocumentSource } from './workspaceDocument'

const REVIEW_DIR = resolve('sketches/review')
const REVIEW_BOARDS = readdirSync(REVIEW_DIR)
	.filter((name) => name.endsWith('.systemsketch'))
	.sort()

describe('committed review boards', () => {
	const schema = createSystemSketchStore().schema

	it.each(REVIEW_BOARDS)('loads %s with the current product schema', (name) => {
		const source = readFileSync(join(REVIEW_DIR, name), 'utf8')
		const result = inspectWorkspaceDocumentSource(source, schema)
		expect(result.kind).toBe('ready')
	})
})
