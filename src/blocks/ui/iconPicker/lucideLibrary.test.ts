import { describe, expect, it } from 'vitest'

import packageJson from '../../../../package.json'
import lucideData from './data/lucide-icons.json'
import { buildLucideLibrary, searchLucide, type LucideLibraryEntry } from './lucideLibrary'

function entry(kebab: string, tags: readonly string[] = []): LucideLibraryEntry {
	// WHY: `name` only needs to be unique for these tests — production names
	// are the lucide-react PascalCase export, but ranking never reads `name`.
	return { name: kebab, kebab, tags, node: [] }
}

const BOX = entry('box', ['container', 'package'])
const BOXES = entry('boxes')
const SQUARE = entry('square', ['box'])
const CIRCUIT_BOARD = entry('circuit-board', ['electronics', 'board'])
const WHITEBOARD = entry('whiteboard', ['board'])
const ENTRIES = [BOX, BOXES, SQUARE, CIRCUIT_BOARD, WHITEBOARD]

describe('searchLucide ranking', () => {
	it('ranks an exact kebab match first, ahead of a prefix match and a tag match', () => {
		const results = searchLucide(ENTRIES, 'box')
		expect(results.map((e) => e.kebab)).toEqual(['box', 'boxes', 'square'])
	})

	it('matches on a tag when the kebab id does not contain the term', () => {
		const results = searchLucide(ENTRIES, 'container')
		expect(results.map((e) => e.kebab)).toEqual(['box'])
	})

	it('requires every typed word to match (AND), excluding an entry that only matches one term', () => {
		// "board" alone matches both circuit-board (tag+id) and whiteboard (tag),
		// but only circuit-board also matches "circuit" — whiteboard must drop out.
		const results = searchLucide(ENTRIES, 'circuit board')
		expect(results.map((e) => e.kebab)).toEqual(['circuit-board'])
	})

	it('returns every entry, in its original order, for an empty query', () => {
		expect(searchLucide(ENTRIES, '')).toEqual(ENTRIES)
		expect(searchLucide(ENTRIES, '   ')).toEqual(ENTRIES)
	})

	/**
	 * Mutation check (run by hand, not part of the suite): inverting the
	 * ranking — sorting ascending instead of descending — flips the exact/tag
	 * test above to `['square', 'boxes', 'box']✗`, and this assertion on the
	 * exact match's position catches it too.
	 */
	it('never lets a substring match outrank the exact id match', () => {
		const results = searchLucide(ENTRIES, 'box')
		expect(results[0].kebab).toBe('box')
	})
})

describe('buildLucideLibrary', () => {
	it('indexes entries by name and wires search to the same entries', () => {
		const library = buildLucideLibrary('9.9.9', ENTRIES)
		expect(library.version).toBe('9.9.9')
		expect(library.entries).toBe(ENTRIES)
		expect(library.byName.get('box')).toBe(BOX)
		expect(library.byName.get('nope')).toBeUndefined()
		expect(library.search('box').map((e) => e.kebab)).toEqual(['box', 'boxes', 'square'])
	})
})

describe('lucide version pin', () => {
	it('keeps the generated data, lucide-react and lucide-static on the same version', () => {
		const dataVersion = (lucideData as { version: string }).version
		const reactVersion = (packageJson.dependencies as Record<string, string>)['lucide-react']
		const staticVersion = (packageJson.devDependencies as Record<string, string>)['lucide-static']
		expect(dataVersion).toBe(reactVersion)
		expect(dataVersion).toBe(staticVersion)
	})
})
