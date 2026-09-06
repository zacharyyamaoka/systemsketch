import { describe, expect, it } from 'vitest'

import {
	DEFAULT_TYPE_ATTRIBUTE_PRESENTATION,
	readTypeAttributePresentation,
	writeTypeAttributePresentation,
} from './typeAttributePresentation'

describe('Type attribute presentation preference', () => {
	it('round-trips through storage and tolerates garbage', () => {
		const store = new Map<string, string>()
		const storage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
		}
		expect(readTypeAttributePresentation(storage)).toEqual(DEFAULT_TYPE_ATTRIBUTE_PRESENTATION)
		writeTypeAttributePresentation({ chevronPlacement: 'gutter' }, storage)
		expect(readTypeAttributePresentation(storage)).toEqual({ chevronPlacement: 'gutter' })
		store.set('systemsketch.type-attributes.v1', '{not json')
		expect(readTypeAttributePresentation(storage)).toEqual(DEFAULT_TYPE_ATTRIBUTE_PRESENTATION)
		expect(readTypeAttributePresentation(null)).toEqual(DEFAULT_TYPE_ATTRIBUTE_PRESENTATION)
	})
})
