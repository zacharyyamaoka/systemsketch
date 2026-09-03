import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from '../blockModel'
import {
	definitionBadge,
	definitionKeyFor,
	normalizedDefinitionName,
} from './definitionLinking'

describe('Definition naming', () => {
	it('keeps display spelling separate from its collision-free namespace key', () => {
		expect(normalizedDefinitionName('  run()  ')).toBe('run()')
		expect(definitionKeyFor('run()')).toBe('run')
		expect(definitionKeyFor('run()', 1)).toBe('run_draft_1')
		expect(definitionKeyFor('estimate pair()', 2)).toBe('estimate_pair_draft_2')
	})

	it('shows draft state as quiet metadata rather than changing the title', () => {
		const props = { ...getDefaultBlockProps(), title: 'run()', draftOrdinal: 3 }
		expect(props.title).toBe('run()')
		expect(definitionBadge(props)).toBe('Draft 3')
		expect(definitionBadge({ ...props, draftOrdinal: undefined })).toBeNull()
	})
})
