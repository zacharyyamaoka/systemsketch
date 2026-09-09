import { describe, expect, it } from 'vitest'

import {
	EMOJI_GROUP_ORDER,
	applySkinTone,
	buildEmojiLibrary,
	searchEmoji,
	type EmojiEntry,
} from './emojiLibrary'

function entry(over: Partial<EmojiEntry>): EmojiEntry {
	return {
		char: '🙂',
		name: 'slightly smiling face',
		slug: 'slightly_smiling_face',
		group: 'Smileys & Emotion',
		keywords: [],
		skinTone: false,
		...over,
	}
}

const GRIN = entry({ char: '😀', name: 'grinning face', slug: 'grinning_face', keywords: ['happy', 'smile'] })
const WAVE = entry({
	char: '👋',
	name: 'waving hand',
	slug: 'waving_hand',
	group: 'People & Body',
	keywords: ['hello', 'goodbye'],
	skinTone: true,
})
const FLAG = entry({ char: '🏳️', name: 'white flag', slug: 'white_flag', group: 'Flags', keywords: ['surrender'] })
const ENTRIES = [GRIN, WAVE, FLAG]

describe('searchEmoji', () => {
	it('matches by name', () => {
		expect(searchEmoji(ENTRIES, 'grinning').map((e) => e.slug)).toEqual(['grinning_face'])
	})

	it('matches by slug', () => {
		expect(searchEmoji(ENTRIES, 'waving_hand').map((e) => e.slug)).toEqual(['waving_hand'])
	})

	it('matches by keyword', () => {
		expect(searchEmoji(ENTRIES, 'surrender').map((e) => e.slug)).toEqual(['white_flag'])
	})

	it('requires every typed word to match somewhere on the entry', () => {
		expect(searchEmoji(ENTRIES, 'hello goodbye').map((e) => e.slug)).toEqual(['waving_hand'])
		expect(searchEmoji(ENTRIES, 'hello surrender')).toEqual([])
	})

	it('returns every entry, in the set\'s own order, for an empty query', () => {
		expect(searchEmoji(ENTRIES, '')).toEqual(ENTRIES)
	})
})

describe('applySkinTone', () => {
	it('appends the Fitzpatrick modifier only when the entry supports a skin tone', () => {
		expect(applySkinTone(WAVE, 3)).toBe(WAVE.char + '\u{1F3FD}')
		expect(applySkinTone(GRIN, 3)).toBe(GRIN.char)
	})

	it('leaves the glyph unchanged for tone 0 ("no tone")', () => {
		expect(applySkinTone(WAVE, 0)).toBe(WAVE.char)
	})
})

describe('buildEmojiLibrary', () => {
	it('orders present groups in Notion/Unicode order and drops absent ones', () => {
		const library = buildEmojiLibrary('1.0.0', ENTRIES)
		const present = library.groups
		// Present: Smileys & Emotion, People & Body, Flags — in that canonical order,
		// with every absent group (Animals & Nature, Food & Drink, ...) left out.
		expect(present).toEqual(['Smileys & Emotion', 'People & Body', 'Flags'])
		expect(EMOJI_GROUP_ORDER.indexOf('Smileys & Emotion')).toBeLessThan(EMOJI_GROUP_ORDER.indexOf('People & Body'))
		expect(EMOJI_GROUP_ORDER.indexOf('People & Body')).toBeLessThan(EMOJI_GROUP_ORDER.indexOf('Flags'))
	})

	it('wires version and search to the built entries', () => {
		const library = buildEmojiLibrary('1.0.0', ENTRIES)
		expect(library.version).toBe('1.0.0')
		expect(library.search('grinning').map((e) => e.slug)).toEqual(['grinning_face'])
	})

	// RISK: the Emoji tab's Recent section looks entries up by slug the same
	// way Lucide's Recent looks them up by name — a stable id survives a skin
	// tone change, the rendered `char` alone wouldn't.
	it('indexes entries by slug for the Recent section', () => {
		const library = buildEmojiLibrary('1.0.0', ENTRIES)
		expect(library.bySlug.get('waving_hand')).toBe(WAVE)
		expect(library.bySlug.get('does-not-exist')).toBeUndefined()
	})
})
