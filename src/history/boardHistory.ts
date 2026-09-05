/**
 * Turning the files that exist on disk into history rows that are true.
 *
 * SystemSketch has no version store, so nothing here reads a history — it
 * MEASURES one. The chain is the `<stem>.vN.systemsketch` siblings beside the
 * open board plus the live editor, and every field on the rows it produces is
 * either read from the filesystem or computed by diffing two real documents:
 *
 * | field       | where it comes from                                        |
 * |-------------|------------------------------------------------------------|
 * | timestamp   | the file's `mtime`, via `/api/workspace/stat`               |
 * | title       | `compareBoards(previous, this)` — counted, not labelled     |
 * | description | the element names out of that same comparison               |
 * | author      | nothing. The app records none. The field stays null.       |
 *
 * The honest limitation, because it decides what this panel can ever say: a
 * derived history can only see the snapshots that happen to exist. It can tell
 * you a Block was retitled somewhere between v1 and v2; it can never tell you
 * that happened at 14:32, or that it happened in the same edit as something
 * else, because no save recorded either. Only a real per-save log can, and that
 * is a different track.
 */

import type { Editor, TLStoreSnapshot } from 'tldraw'

import {
	compareBoards,
	recordsOfSnapshot,
	type BoardCompare,
	type CompareChange,
} from '../compare/compareModel'
import { inspectWorkspaceDocumentSource } from '../workspace/workspaceDocument'
import type { HistoryRecord } from './historyModel'

/** How many `.vN` siblings to probe for before giving up. */
const HISTORY_PROBE_DEPTH = 6

export interface VersionFile {
	readonly id: string
	readonly label: string
	/** Absolute path, or null for the live board. */
	readonly path: string | null
	/** Epoch milliseconds from the file's mtime, or null when unknown. */
	readonly mtime: number | null
	readonly isCurrent: boolean
	/** Short glyph for the avatar circle: `v1`, `v2`, or a dot. */
	readonly badge: string
}

export interface VersionStep {
	readonly file: VersionFile
	readonly snapshot: TLStoreSnapshot | null
	/** What changed between the previous step and this one. Null on the earliest. */
	readonly compare: BoardCompare | null
}

function stemOf(path: string): { stem: string; extension: string } {
	const match = path.match(/^(.*)(\.systemsketch|\.tldr)$/)
	if (!match) return { stem: path, extension: '.systemsketch' }
	return { stem: match[1], extension: match[2] }
}

async function readSource(path: string): Promise<string | null> {
	try {
		const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`)
		if (!response.ok) return null
		const payload = (await response.json()) as { source?: unknown }
		return typeof payload.source === 'string' ? payload.source : null
	} catch {
		return null
	}
}

/**
 * The file's real modification time, in epoch milliseconds.
 *
 * `scripts/workspace_store.py` reports `st_mtime`, which is SECONDS as a float.
 * Multiplying is not cosmetic: a timestamp left in seconds lands in January 1970
 * and every row would read as an absolute date fifty years ago — which is
 * exactly the sort of quietly-wrong number a history panel is worst at, because
 * it looks like data.
 */
async function readMtime(path: string): Promise<number | null> {
	try {
		const response = await fetch(`/api/workspace/stat?path=${encodeURIComponent(path)}`)
		if (!response.ok) return null
		const payload = (await response.json()) as { mtime?: unknown }
		return typeof payload.mtime === 'number' ? Math.round(payload.mtime * 1000) : null
	} catch {
		return null
	}
}

/** Find the versions that exist beside the open board, oldest first. */
export async function discoverVersions(currentPath: string | null): Promise<VersionFile[]> {
	const files: VersionFile[] = []
	if (currentPath) {
		const { stem, extension } = stemOf(currentPath)
		for (let version = 1; version <= HISTORY_PROBE_DEPTH; version += 1) {
			const candidate = `${stem}.v${version}${extension}`
			// eslint-disable-next-line no-await-in-loop -- ordered probe, at most six
			const source = await readSource(candidate)
			if (!source) continue
			// eslint-disable-next-line no-await-in-loop -- one stat per file that exists
			const mtime = await readMtime(candidate)
			files.push({
				id: `v${version}`,
				label: `Version ${version}`,
				path: candidate,
				mtime,
				isCurrent: false,
				badge: `v${version}`,
			})
		}
	}
	files.push({
		id: 'current',
		label: 'Current version',
		path: currentPath,
		mtime: currentPath ? await readMtime(currentPath) : null,
		isCurrent: true,
		badge: '●',
	})
	return files
}

/** Read one version into a store snapshot, through the same parser the File menu uses. */
export async function loadVersionSnapshot(
	file: VersionFile,
	editor: Editor,
): Promise<TLStoreSnapshot | null> {
	if (file.isCurrent) return editor.store.getStoreSnapshot()
	if (!file.path) return null
	const source = await readSource(file.path)
	if (!source) return null
	const inspected = inspectWorkspaceDocumentSource(source, editor.store.schema)
	if (inspected.kind !== 'ready' && inspected.kind !== 'future') return null
	return inspected.snapshot as TLStoreSnapshot
}

/**
 * Load every version and diff each against the one before it.
 *
 * The chain is built once and shared, because both panels ask the same question
 * of it: the modal wants every step, the inspector wants the steps that touched
 * one element. Computing it twice would let the two lists disagree about what
 * happened, which is the failure the shared component exists to prevent.
 */
export async function buildVersionChain(
	files: readonly VersionFile[],
	editor: Editor,
): Promise<VersionStep[]> {
	const snapshots = await Promise.all(files.map((file) => loadVersionSnapshot(file, editor)))
	const steps: VersionStep[] = []
	for (const [index, file] of files.entries()) {
		const snapshot = snapshots[index]
		const previous = index > 0 ? snapshots[index - 1] : null
		steps.push({
			file,
			snapshot,
			compare:
				previous && snapshot
					? compareBoards(recordsOfSnapshot(previous), recordsOfSnapshot(snapshot))
					: null,
		})
	}
	return steps
}

/** The review table's vocabulary, so one legend serves the table and the list. */
const VERB: Record<string, string> = { added: 'Added', removed: 'Removed', modified: 'Edited' }
const PLURAL: Record<string, string> = { added: 'added', removed: 'removed', modified: 'edited' }

function toneOf(changes: readonly CompareChange[]): HistoryRecord['tone'] {
	const kinds = new Set(changes.map((change) => change.kind))
	if (kinds.size === 0) return 'none'
	if (kinds.size > 1) return 'mixed'
	const [only] = [...kinds]
	return only
}

/**
 * The short title, measured from the diff.
 *
 * One element gets named — "Edited run_predict" is the sentence a person would
 * write, and it is the one Figma's list shows. More than one falls back to
 * counts, because a title that named four elements would wrap, and a wrapping
 * title is the thing that breaks the row rhythm this list is copying.
 */
function titleOf(compare: BoardCompare | null): string {
	if (!compare) return 'Earliest recorded version'
	if (compare.total === 0) return 'No measurable change'

	const elements = new Map<string, CompareChange[]>()
	for (const change of compare.changes) {
		const list = elements.get(change.elementId)
		if (list) list.push(change)
		else elements.set(change.elementId, [change])
	}

	if (elements.size === 1) {
		const [changes] = [...elements.values()]
		const name = changes[0].element
		// An element whose own row is added/removed IS that verb; an element that
		// only had properties touched was edited, whatever its properties did.
		const own = changes.find((change) => change.elementId === change.id)
		const kind = own ? own.kind : 'modified'
		return `${VERB[kind] ?? 'Edited'} ${name}`
	}

	const counts = new Map<string, number>()
	for (const changes of elements.values()) {
		const own = changes.find((change) => change.elementId === change.id)
		const kind = own ? own.kind : 'modified'
		counts.set(kind, (counts.get(kind) ?? 0) + 1)
	}
	return ['added', 'removed', 'modified']
		.filter((kind) => counts.has(kind))
		.map((kind) => `${counts.get(kind)} ${PLURAL[kind]}`)
		.join(' · ')
}

/**
 * The longer description — the detail the title had to drop.
 *
 * Present only when it says something the title did not. A description that
 * merely restated its own title would put a disclosure chevron on every row and
 * teach the reader that opening one is never worth it.
 */
function descriptionOf(compare: BoardCompare | null): string | undefined {
	if (!compare || compare.total === 0) return undefined
	const byElement = new Map<string, CompareChange[]>()
	for (const change of compare.changes) {
		const list = byElement.get(change.elementId)
		if (list) list.push(change)
		else byElement.set(change.elementId, [change])
	}
	const parts: string[] = []
	for (const changes of byElement.values()) {
		const name = changes[0].element
		const own = changes.find((change) => change.elementId === change.id)
		if (own && own.kind !== 'modified') {
			parts.push(`${VERB[own.kind]} ${name}`)
			continue
		}
		// Name the properties, which is the thing the counted title cannot say.
		const detail = changes
			.flatMap((change) =>
				change.fields.length > 0
					? change.fields.map((field) => field.path)
					: [change.name],
			)
			.filter((value, index, all) => all.indexOf(value) === index)
		parts.push(detail.length > 0 ? `${name} — ${detail.join(', ')}` : `Edited ${name}`)
	}
	return parts.join('; ')
}

/**
 * The live row's description: the count its title gave up, then the detail.
 *
 * Leads with the summary a reader lost from the title ("2 edited") rather than
 * going straight to the property list, so opening the row answers the question
 * the shortened title raised before it answers anything else.
 */
function summaryDescription(compare: BoardCompare | null): string | undefined {
	if (!compare || compare.total === 0) return undefined
	const detail = descriptionOf(compare)
	const summary = `Unsaved since the last version — ${titleOf(compare).toLowerCase()}`
	return detail ? `${summary}. ${detail}` : summary
}

/** The board-level rows: one per version, newest first, the way Figma lists them. */
export function boardHistoryRecords(steps: readonly VersionStep[]): HistoryRecord[] {
	return steps
		.map<HistoryRecord>((step) => ({
			id: step.file.id,
			title: step.file.isCurrent ? currentTitle() : titleOf(step.compare),
			// The live row's measurement moves here, so the title can stay short
			// without the count being dropped altogether.
			description: step.file.isCurrent
				? summaryDescription(step.compare)
				: descriptionOf(step.compare),
			timestamp: step.file.mtime,
			// No author is recorded anywhere in this app. See historyModel.ts.
			author: null,
			badge: step.file.badge,
			tone: step.file.isCurrent ? 'current' : toneOf(step.compare?.changes ?? []),
			isCurrent: step.file.isCurrent,
			path: step.file.path,
		}))
		.reverse()
}

/**
 * The live board's own row: `Current version`, and nothing appended.
 *
 * It is not a saved version, so it does not get a measured title in the same
 * voice — "3 added" would imply a save that happened. It briefly read
 * `Current version — 2 edited`, which was true and which truncated to
 * "Current ver…" in a 228px rail, costing the row the one word that identified
 * it. Figma labels this row plainly for the same reason. The measurement is not
 * lost: it is still the row's description, one click away.
 */
function currentTitle(): string {
	return 'Current version'
}

/**
 * The same chain, filtered to one element on the board.
 *
 * This is the per-element history, and it is derived rather than logged. A
 * version where the element did not change is DROPPED rather than shown as an
 * empty row: the list answers "when did this thing change", and a list of
 * mostly-nothing would bury the answer under the versions that are not about it.
 *
 * The live board always gets a row, so the panel is never empty and always says
 * what state you are looking at now.
 */
export function elementHistoryRecords(
	steps: readonly VersionStep[],
	elementId: string | null,
): HistoryRecord[] {
	if (!elementId) return []
	const records: HistoryRecord[] = []
	for (const step of steps) {
		const mine = step.compare?.changes.filter((change) => change.elementId === elementId) ?? []
		if (step.file.isCurrent) {
			records.push({
				id: step.file.id,
				title: mine.length > 0 ? titleOf(scoped(step.compare, mine)) : 'Current state',
				description: mine.length > 0 ? descriptionOf(scoped(step.compare, mine)) : undefined,
				timestamp: step.file.mtime,
				author: null,
				badge: step.file.badge,
				tone: 'current',
				isCurrent: true,
				path: step.file.path,
			})
			continue
		}
		if (mine.length === 0) continue
		records.push({
			id: step.file.id,
			title: titleOf(scoped(step.compare, mine)),
			description: descriptionOf(scoped(step.compare, mine)),
			timestamp: step.file.mtime,
			author: null,
			badge: step.file.badge,
			tone: toneOf(mine),
			isCurrent: false,
			path: step.file.path,
		})
	}
	return records.reverse()
}

/** A comparison narrowed to a subset of its own changes, for the per-element voice. */
function scoped(compare: BoardCompare | null, changes: readonly CompareChange[]): BoardCompare | null {
	if (!compare) return null
	return { changes, tally: compare.tally, total: changes.length }
}
