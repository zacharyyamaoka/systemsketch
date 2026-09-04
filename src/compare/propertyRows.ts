/**
 * The row model behind the property table, ported from the omnibox variant.
 *
 * The `PropertyRow` union below, and the three accessors under it, are that
 * variant's `src/review/boardDiff.ts` verbatim — it is the model Zach picked
 * when he compared the five, and the discriminated union is the load-bearing
 * part: `added` has no `previous` KEY AT ALL, so "the value it used to have"
 * cannot be typed, let alone rendered. The three-state model enforced by the
 * compiler instead of by a convention.
 *
 * WHY the union is copied but its producer is not: omnibox computes these rows
 * from a hardcoded fixture (`reviewFixture.ts` — a demo with canned versions).
 * This track diffs REAL boards read off disk through `compareSource.ts`.
 * Importing omnibox's producer would have swapped live evidence for a mock, so
 * only the row SHAPE crossed over and `propertyRowsOf` below is the adapter
 * that feeds it from this tree's real `CompareChange`. The praised table and
 * the real data both survive; neither one had to win.
 */

import type { CompareChange } from './compareModel'

/**
 * One row of the property comparison table.
 *
 * A discriminated union, on purpose. `added` has no `previous` key at all, so
 * "the value it used to have" cannot be typed, let alone rendered.
 */
export type PropertyRow =
	| {
		readonly key: string
		readonly state: 'added'
		/** The `Layer` column — the noun, qualified enough to be found. */
		readonly layer: string
		readonly current: string
	}
	| {
		readonly key: string
		readonly state: 'removed'
		readonly layer: string
		readonly previous: string
	}
	| {
		readonly key: string
		readonly state: 'modified'
		readonly layer: string
		readonly previous: string
		readonly current: string
	}

/** Read a row's previous value, or `null` where the row asserts absence. */
export function rowPrevious(row: PropertyRow): string | null {
	return row.state === 'added' ? null : row.previous
}

/** Read a row's current value, or `null` where the row asserts absence. */
export function rowCurrent(row: PropertyRow): string | null {
	return row.state === 'removed' ? null : row.current
}

/**
 * Only a `modified` row has two values to compare, so only a `modified` row can
 * carry a word-level highlight. GitHub's asymmetry rule, one level up: a pure
 * addition has no "green nothing" on the other side to diff against.
 */
export function rowSupportsWordDiff(row: PropertyRow): row is Extract<PropertyRow, { state: 'modified' }> {
	return row.state === 'modified'
}

/** The state badge's copy, matching the omnibox variant's `OPERATION_LABEL`. */
export const STATE_LABEL: Readonly<Record<PropertyRow['state'], string>> = {
	added: 'Added',
	removed: 'Removed',
	modified: 'Modified',
}

/**
 * Sort order for the flattened table: added, then removed, then modified.
 *
 * Ported from omnibox's `STATE_ORDER`. Insertions and deletions are the coarse
 * findings a reviewer wants first; a modification is the one they have to read
 * a value to understand, so it reads last.
 */
const STATE_ORDER: Readonly<Record<string, number>> = {
	added: 0,
	removed: 1,
	modified: 2,
}

/** What a whole-object insertion or deletion says in its one populated cell. */
function describeWhole(change: CompareChange, side: 'before' | 'after'): string {
	const record = side === 'before' ? change.recordBefore : change.recordAfter
	if (!record || typeof record !== 'object') return change.name
	const props = (record as { props?: Record<string, unknown> }).props ?? record
	const bag = props as Record<string, unknown>
	const parts: string[] = []
	for (const key of ['name', 'title', 'type', 'blockType', 'defaultValue']) {
		const value = bag[key]
		if (typeof value !== 'string' || value === '') continue
		parts.push(key === 'defaultValue' ? `= ${value}` : value)
	}
	return parts.join(' · ') || change.name
}

/**
 * A change's `Layer` label — the noun, qualified enough to be found on a board.
 *
 * `run() · window` rather than bare `window`, which is omnibox's own idiom: a
 * port name alone is ambiguous across a board with forty Blocks on it.
 */
function layerOf(change: CompareChange, path: string | null): string {
	return path ? `${change.name} · ${path}` : change.name
}

/** Every row one change contributes, in the omnibox row shape. */
export function propertyRowsOf(change: CompareChange): PropertyRow[] {
	if (change.kind === 'added') {
		return [{
			key: change.id,
			state: 'added',
			layer: layerOf(change, null),
			current: describeWhole(change, 'after'),
		}]
	}
	if (change.kind === 'removed') {
		return [{
			key: change.id,
			state: 'removed',
			layer: layerOf(change, null),
			previous: describeWhole(change, 'before'),
		}]
	}
	// A `modified` change with no field pairs cannot say what changed, so it
	// falls back to its whole-object description on both sides rather than
	// rendering an empty pair — which would read as "both sides are blank".
	if (change.fields.length === 0) {
		return [{
			key: change.id,
			state: 'modified',
			layer: layerOf(change, null),
			previous: describeWhole(change, 'before'),
			current: describeWhole(change, 'after'),
		}]
	}
	return change.fields.map((field) => ({
		key: `${change.id}:${field.path}`,
		state: 'modified' as const,
		layer: layerOf(change, field.path),
		previous: field.before,
		current: field.after,
	}))
}

/** The changes, ordered the way the ported table lists them. */
export function orderChanges(changes: readonly CompareChange[]): CompareChange[] {
	return [...changes].sort(
		(a, b) => (STATE_ORDER[a.kind] ?? 9) - (STATE_ORDER[b.kind] ?? 9),
	)
}
