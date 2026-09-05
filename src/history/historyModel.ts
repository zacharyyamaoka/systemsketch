/**
 * One history record, and the honest account of where each field comes from.
 *
 * Zach's field list for a history row is short and it is the whole spec: *"the
 * time it was made, a short title about what the change was, potentially an
 * optional more detailed description, and potentially a user who made it."*
 * This type is exactly those four, and nothing else — a row that wanted a fifth
 * would be a row the two panels could not share.
 *
 * What is REAL in this app today, stated plainly because the temptation to fake
 * it is the whole risk of building a history panel against an app that has no
 * history store:
 *
 * - **`timestamp` is real.** It is the file's `mtime`, read from
 *   `/api/workspace/stat` (`scripts/workspace_store.py` `_metadata`). Nothing is
 *   rounded, guessed, or seeded.
 * - **`title` and `description` are real but DERIVED, not stored.** No save in
 *   SystemSketch records what it changed, so a title cannot be read back. It is
 *   computed at read time by diffing the two versions with the same
 *   `compareBoards` the review modal runs — so "3 added · 1 edited" is a
 *   measurement of the two files, not a label somebody typed.
 * - **`author` is `null`, always, and that is not an oversight.** The app has no
 *   identity: the only one that exists anywhere is the comments feature's
 *   `LOCAL_COMMENT_AUTHOR` stub, and `SystemSketchSharePanel` already deleted a
 *   "Profile placeholder" button for promising a person the app does not have.
 *   Stamping a name onto a row the file never recorded would repeat that exact
 *   mistake, one layer deeper where it is harder to notice. The field is here so
 *   the row is ready the day identity lands; until then it renders nothing.
 *
 * `badge` is what fills Figma's circular avatar slot while `author` is null. It
 * keeps the row's left rail and its rhythm — the thing that makes the list read
 * as Figma's — without drawing a face for a person nobody recorded.
 */

export interface HistoryAuthor {
	readonly id: string
	/** Display name. Rendered verbatim — never trimmed or initialised away. */
	readonly name: string
}

export interface HistoryRecord {
	readonly id: string
	/** Short — what changed. Primary text in the row. */
	readonly title: string
	/** Optional longer prose. Absent on most rows; disclosed on click. */
	readonly description?: string
	/** Epoch milliseconds, or null when genuinely unknown. */
	readonly timestamp: number | null
	/** Who made it, or null when the app recorded no author — which is always. */
	readonly author: HistoryAuthor | null
	/** Short glyph for the circular slot: 'v1', 'v2', a dot for the live board. */
	readonly badge: string
	/** Tints the badge. `current` is the live board; `none` is a version with nothing measured. */
	readonly tone: 'added' | 'removed' | 'modified' | 'mixed' | 'current' | 'none'
	/** The live editor rather than a file on disk. */
	readonly isCurrent: boolean
	/** Absolute path this record was read from, or null for the live board. */
	readonly path: string | null
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Figma's own relative phrasing — "7 minutes ago" — and its rounding.
 *
 * Deliberately NOT `Intl.RelativeTimeFormat`. That formatter is excellent and it
 * is the wrong tool here: it renders "7 minutes ago" and "last week" from the
 * same call, and the second one is a phrase Figma's list never shows. Matching
 * the reference means choosing the unit the reference chooses, so this walks the
 * thresholds explicitly. Anything past a week reads as a date, because "37 days
 * ago" is a number nobody converts.
 */
export function relativeTime(timestamp: number | null, now: number = Date.now()): string {
	if (timestamp === null || !Number.isFinite(timestamp)) return 'time not recorded'
	const elapsed = now - timestamp
	// A clock skew or a file written a moment ago must not read "in 3 seconds".
	if (elapsed < 45_000) return 'just now'
	if (elapsed < HOUR) {
		const minutes = Math.round(elapsed / MINUTE)
		return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
	}
	if (elapsed < DAY) {
		const hours = Math.round(elapsed / HOUR)
		return `${hours} hour${hours === 1 ? '' : 's'} ago`
	}
	if (elapsed < 7 * DAY) {
		const days = Math.round(elapsed / DAY)
		return `${days} day${days === 1 ? '' : 's'} ago`
	}
	return new Date(timestamp).toLocaleDateString(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	})
}

/** Absolute stamp for the tooltip, so the relative one is never the only record. */
export function absoluteTime(timestamp: number | null): string {
	if (timestamp === null || !Number.isFinite(timestamp)) return 'No timestamp recorded'
	return new Date(timestamp).toLocaleString()
}

/**
 * The secondary line: `7 minutes ago` alone, or `7 minutes ago · Mitch`.
 *
 * The separator only appears with an author to separate FROM. A row that read
 * "7 minutes ago ·" with nothing after it would be the fabricated-author bug
 * showing through the punctuation.
 */
export function metaLine(record: HistoryRecord, now?: number): string {
	const when = relativeTime(record.timestamp, now)
	return record.author ? `${when} · ${record.author.name}` : when
}
