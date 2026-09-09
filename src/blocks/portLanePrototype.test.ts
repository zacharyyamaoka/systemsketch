import { describe, expect, it } from 'vitest'

import {
	DEFAULT_PORT_EDITOR_PREFERENCE,
	modeOf,
	parseStoredPortEditorPreference,
} from './portLanePrototype'

describe('port editor preference', () => {
	it('defaults to the multi-line lanes with a solid box', () => {
		expect(DEFAULT_PORT_EDITOR_PREFERENCE).toEqual({ portEditor: 'multi-line', laneStyle: 'solid' })
		expect(modeOf(DEFAULT_PORT_EDITOR_PREFERENCE)).toBe('lanes')
	})

	it('reads a stored record field by field and falls back per key', () => {
		expect(parseStoredPortEditorPreference({ portEditor: 'single-line' })).toEqual({ portEditor: 'single-line', laneStyle: 'solid' })
		expect(parseStoredPortEditorPreference({ portEditor: 'multi-line', laneStyle: 'ragged' })).toEqual({ portEditor: 'multi-line', laneStyle: 'ragged' })
		expect(parseStoredPortEditorPreference({ portEditor: 'nonsense', laneStyle: 42 })).toEqual(DEFAULT_PORT_EDITOR_PREFERENCE)
		expect(parseStoredPortEditorPreference(null)).toEqual(DEFAULT_PORT_EDITOR_PREFERENCE)
	})

	it('spells the three drop-down faces from the two keys', () => {
		expect(modeOf({ portEditor: 'single-line', laneStyle: 'ragged' })).toBe('one-line')
		expect(modeOf({ portEditor: 'multi-line', laneStyle: 'ragged' })).toBe('lanes-ragged')
	})
})
