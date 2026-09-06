/**
 * Rebase — pull Main's current state into an open draft, the inverse of
 * Merge. Pure computation only: no React, no editor, no localStorage. Given a
 * draft's fork point, its own current content, and Main's current content
 * (all three already resolved to `TLStoreSnapshot`s by the caller — see
 * `DraftProvider.tsx`'s `rebaseDraftAction`), decide whether the two sides can
 * be combined and, if so, produce the combined snapshot.
 *
 * ONE "what changed" question is asked here, at ONE granularity, and that is
 * the whole point of the module.
 *
 * WHY: an earlier version asked it twice at two different altitudes, and the
 * gap between them silently destroyed data. Conflict detection went through
 * `compareBoards` — the display engine behind the bar's badge and Compare —
 * while the merge overlay went through a raw whole-record diff. `compareBoards`
 * exists to describe a board to a person, so it reads only a curated field list
 * (`BLOCK_COMPARE_FIELDS` and friends) off `record.props`, and never looks at a
 * record's top-level `x`/`y` at all. A draft that only MOVED a shape was
 * therefore invisible to the conflict check, but plainly visible to the raw
 * overlay — so the overlay copied the draft's entire stale record over Main's
 * freshly-renamed one and the rename was gone, with the rebase reporting
 * success. A display diff must never decide what is safe to overwrite: it is
 * deliberately incomplete, and every field it chooses not to show is a field
 * a merge would discard without noticing.
 *
 * So the merge does its own complete, field-by-field comparison
 * (`fieldViewOf`) over every field of every record, ignore-list free, and both
 * halves of the decision — which records conflict, and what the merged record
 * contains — are read off that one view. `compareBoards` keeps its job of
 * describing changes to a human and has no say in what gets written.
 *
 * Two consequences of working at the raw record level, both deliberate and
 * both load-bearing:
 *
 * - A port lives INSIDE its Block's `props.inputs`/`props.outputs` array, so
 *   it is not a record and never gets its own merge decision. Two drafts
 *   editing different ports of one Block both write `props.inputs`, so they
 *   genuinely conflict; a draft editing a port while Main retitles the same
 *   Block touches a different field and merges cleanly.
 * - A `binding` — the record that actually wires a cable to a port — is not a
 *   `compareBoards` subject at all (bindings are read only to resolve a
 *   cable's endpoints). Diffing raw records carries a brand-new cable's own
 *   binding rows across, where walking `compareBoards`' changes would have
 *   dropped them and delivered the cable already dangling.
 */
import type { TLStoreSnapshot } from 'tldraw'

import { recordsOfSnapshot, type RecordLike, type RecordMap } from '../compare/compareModel'

export interface RebaseInput {
	/** The draft's own immutable fork point — Main's content when the draft was created. */
	readonly base: TLStoreSnapshot
	/** The draft's current content. */
	readonly draftHead: TLStoreSnapshot
	/** Main's content right now, read fresh — never a cached slot. */
	readonly freshMain: TLStoreSnapshot
}

export type RebaseComputation =
	| { readonly ok: true; readonly snapshot: TLStoreSnapshot }
	| { readonly ok: false; readonly conflictCount: number }

/** Marks a field that lives one level inside `props` rather than on the record. */
const PROPS_PREFIX = 'props.'

/** A record's fields, flattened so `props` is transparent. */
type FieldView = Map<string, unknown>

/**
 * Every field of a record, as one flat map: top-level keys (`x`, `y`,
 * `parentId`, `fromId`, `meta`, …) plus one level into `props`
 * (`props.title`, `props.inputs`, …).
 *
 * WHY one level and no deeper: `props` keys are the unit this app actually
 * writes — every `editor.updateShape({ props })` call site sets whole prop
 * keys — so they are the finest granularity at which two edits can be said to
 * be independent. Recursing further would start treating array positions as
 * fields, where inserting one port shifts every later index and manufactures
 * conflicts out of an append. Anything below a prop key is compared whole.
 *
 * A key whose value is `undefined` is treated as absent, so an optional field
 * that one side spelled out and the other omitted is not a phantom change.
 */
function fieldViewOf(record: RecordLike | undefined): FieldView {
	const view: FieldView = new Map()
	if (!record) return view
	for (const [key, value] of Object.entries(record)) {
		if (key === 'props' || value === undefined) continue
		view.set(key, value)
	}
	const props = (record as { props?: unknown }).props
	if (props && typeof props === 'object') {
		for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
			if (value === undefined) continue
			view.set(`${PROPS_PREFIX}${key}`, value)
		}
	}
	return view
}

function sameField(a: FieldView, b: FieldView, key: string): boolean {
	if (a.has(key) !== b.has(key)) return false
	return JSON.stringify(a.get(key)) === JSON.stringify(b.get(key))
}

/**
 * A record both sides edited: either the one merged record that keeps both
 * sets of edits, or the news that they collided on a field.
 */
type RecordMerge =
	| { readonly conflicted: true }
	| { readonly conflicted: false; readonly record: RecordLike }

/**
 * Three-way merge of ONE record that base, Main and the draft all still have.
 *
 * Per field: only the draft moved it → take the draft's; only Main moved it,
 * or neither did → Main's value already stands; both moved it to the SAME
 * value → they agree, no conflict; both moved it differently → a real
 * conflict, and the record blocks.
 */
function mergeRecordFields(base: RecordLike, main: RecordLike, draft: RecordLike): RecordMerge {
	const baseView = fieldViewOf(base)
	const mainView = fieldViewOf(main)
	const draftView = fieldViewOf(draft)

	const fromDraft: string[] = []
	for (const key of new Set([...baseView.keys(), ...mainView.keys(), ...draftView.keys()])) {
		if (sameField(baseView, draftView, key)) continue
		if (sameField(baseView, mainView, key)) {
			fromDraft.push(key)
			continue
		}
		if (sameField(mainView, draftView, key)) continue
		return { conflicted: true }
	}
	return { conflicted: false, record: withDraftFields(main, draftView, fromDraft) }
}

/**
 * Main's record with the fields only the draft changed written over it.
 * Built by spreading Main's own record first so key order — which
 * `recordsEqual` is sensitive to — stays Main's.
 */
function withDraftFields(main: RecordLike, draftView: FieldView, fromDraft: readonly string[]): RecordLike {
	if (fromDraft.length === 0) return main
	const merged = { ...(main as unknown as Record<string, unknown>) }
	const mainProps = (main as { props?: unknown }).props
	let props = mainProps && typeof mainProps === 'object'
		? { ...(mainProps as Record<string, unknown>) }
		: undefined

	for (const key of fromDraft) {
		if (key.startsWith(PROPS_PREFIX)) {
			const propKey = key.slice(PROPS_PREFIX.length)
			props ??= {}
			if (draftView.has(key)) props[propKey] = draftView.get(key)
			else delete props[propKey]
			continue
		}
		if (draftView.has(key)) merged[key] = draftView.get(key)
		else delete merged[key]
	}

	if (props) merged.props = props
	return merged as unknown as RecordLike
}

function recordsEqual(a: RecordLike | undefined, b: RecordLike | undefined): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Every record id that differs — added, removed, or modified — between two
 * record maps, at the raw record level. Deliberately not `compareBoards`:
 * see the module comment for why the merge itself needs this instead.
 */
function changedRecordIds(before: RecordMap, after: RecordMap): Set<string> {
	const ids = new Set<string>()
	for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (!recordsEqual(before[id], after[id])) ids.add(id)
	}
	return ids
}

function parentIdOf(record: RecordLike): string | null {
	const parentId = (record as unknown as { parentId?: unknown }).parentId
	return typeof parentId === 'string' ? parentId : null
}

/**
 * Count of records in the candidate merge whose reference(s) do not resolve
 * inside it: a `binding`'s `fromId`/`toId`, or a shape's `parentId` when that
 * parent is itself a shape (a page id, e.g. `page:xyz`, always resolves
 * outside this map and is not a dangling reference).
 *
 * One record with a broken reference counts once, even if both its ends are
 * missing — this is a count of "things Rebase would silently break", not of
 * individual dangling fields.
 */
function danglingReferenceCount(records: RecordMap): number {
	let count = 0
	for (const record of Object.values(records)) {
		if (record.typeName === 'binding') {
			const fromDangles = !!record.fromId && !(record.fromId in records)
			const toDangles = !!record.toId && !(record.toId in records)
			if (fromDangles || toDangles) count++
			continue
		}
		if (record.typeName === 'shape') {
			const parentId = parentIdOf(record)
			if (parentId && !parentId.startsWith('page:') && !(parentId in records)) count++
		}
	}
	return count
}

/**
 * Compute the result of rebasing a draft onto Main, or the reason it must be
 * blocked. Never mutates its inputs.
 */
export function computeRebase(input: RebaseInput): RebaseComputation {
	const baseRecords = recordsOfSnapshot(input.base)
	const draftHeadRecords = recordsOfSnapshot(input.draftHead)
	const freshMainRecords = recordsOfSnapshot(input.freshMain)

	const mainChanged = changedRecordIds(baseRecords, freshMainRecords)
	const draftChanged = changedRecordIds(baseRecords, draftHeadRecords)

	// Start from Main's full current record set — every record the draft did
	// not touch is already correct — then settle the ones the draft did.
	const merged: Record<string, RecordLike> = { ...freshMainRecords }
	let conflictCount = 0

	for (const id of draftChanged) {
		const draftRecord = draftHeadRecords[id]
		if (!mainChanged.has(id)) {
			// Main never moved this record, so the draft's copy loses nothing.
			if (draftRecord) merged[id] = draftRecord
			else delete merged[id]
			continue
		}

		// Both sides moved it. Agreeing on the result is not a conflict.
		const mainRecord = freshMainRecords[id]
		if (recordsEqual(mainRecord, draftRecord)) continue

		const baseRecord = baseRecords[id]
		if (!baseRecord || !mainRecord || !draftRecord) {
			// One side deleted (or independently created) what the other
			// edited. There is no field-level answer to "keep it or not", so
			// this stays the whole-record refusal it has always been.
			conflictCount += 1
			continue
		}

		const outcome = mergeRecordFields(baseRecord, mainRecord, draftRecord)
		if (outcome.conflicted) conflictCount += 1
		else merged[id] = outcome.record
	}

	if (conflictCount > 0) return { ok: false, conflictCount }

	const danglingCount = danglingReferenceCount(merged)
	if (danglingCount > 0) {
		// No shared id, but the draft's own change leans on (or Main's own
		// change removed) something the other side does not know about —
		// e.g. Main deletes a Block the draft independently wired a cable to.
		// Still a conflict: applying it would hand Main a broken reference.
		return { ok: false, conflictCount: danglingCount }
	}

	return {
		ok: true,
		snapshot: { store: merged, schema: input.freshMain.schema } as unknown as TLStoreSnapshot,
	}
}
