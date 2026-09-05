import { describe, expect, it } from 'vitest'

import { absoluteTime, metaLine, relativeTime, type HistoryRecord } from './historyModel'

const NOW = Date.parse('2026-09-03T12:00:00Z')

function record(patch: Partial<HistoryRecord> = {}): HistoryRecord {
	return {
		id: 'v1',
		title: 'Edited run_predict',
		timestamp: NOW - 7 * 60_000,
		author: null,
		badge: 'v1',
		tone: 'modified',
		isCurrent: false,
		path: '/boards/x.v1.systemsketch',
		...patch,
	}
}

describe('relativeTime', () => {
	it("uses Figma's own phrasing at each unit", () => {
		expect(relativeTime(NOW - 7 * 60_000, NOW)).toBe('7 minutes ago')
		expect(relativeTime(NOW - 60 * 60_000, NOW)).toBe('1 hour ago')
		expect(relativeTime(NOW - 5 * 60 * 60_000, NOW)).toBe('5 hours ago')
		expect(relativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3 days ago')
	})

	it('singularises rather than printing "1 minutes ago"', () => {
		expect(relativeTime(NOW - 60_000, NOW)).toBe('1 minute ago')
		expect(relativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1 day ago')
	})

	it('says "just now" instead of a negative age when the clock is skewed', () => {
		// A file written a moment ago can carry an mtime slightly ahead of the
		// browser's clock. "in 3 seconds" would be the arithmetic answer and a
		// nonsense thing for a history row to say.
		expect(relativeTime(NOW + 3_000, NOW)).toBe('just now')
		expect(relativeTime(NOW - 10_000, NOW)).toBe('just now')
	})

	it('falls back to a date past a week, because "37 days ago" converts to nothing', () => {
		expect(relativeTime(NOW - 40 * 24 * 60 * 60_000, NOW)).toMatch(/\d{4}/)
	})

	it('says so plainly when there is no timestamp, rather than showing an epoch', () => {
		expect(relativeTime(null, NOW)).toBe('time not recorded')
		expect(relativeTime(Number.NaN, NOW)).toBe('time not recorded')
		expect(absoluteTime(null)).toBe('No timestamp recorded')
	})
})

describe('metaLine', () => {
	it('is the time alone when no author was recorded', () => {
		// The load-bearing case: this app records no author, so the separator must
		// not render either. A line reading "7 minutes ago ·" would be the
		// fabricated-author bug showing through the punctuation.
		expect(metaLine(record(), NOW)).toBe('7 minutes ago')
		expect(metaLine(record(), NOW)).not.toContain('·')
	})

	it('joins the author only when there actually is one', () => {
		expect(metaLine(record({ author: { id: 'u1', name: 'Mitch' } }), NOW)).toBe(
			'7 minutes ago · Mitch',
		)
	})

	it('renders an author name verbatim, without trimming it to fit', () => {
		const long = 'A Person With A Very Long Recorded Name'
		expect(metaLine(record({ author: { id: 'u2', name: long } }), NOW)).toContain(long)
	})
})
