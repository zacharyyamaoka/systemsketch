/**
 * Where the two endpoints of a comparison come from.
 *
 * Every tool in the prior-art sweep that has real version history — Figma,
 * Simulink, Camunda — makes *picking which two versions to compare* an explicit
 * first step rather than an always-on lens. So this panel needs a history, and
 * SystemSketch does not have one yet.
 *
 * What is real here and what is standing in, stated plainly:
 *
 * - **The `after` side is real and live.** It is a snapshot of the editor the
 *   modal opened over — literally "Current version", the same thing Figma's
 *   right pane shows. Nothing is fetched for it and nothing is faked.
 * - **The `before` side is a real `.systemsketch` file**, opened through the
 *   ordinary workspace reader and tldraw's own parser — the same code path the
 *   File menu uses, so a board that opens here opens in the app.
 * - **The *list* of prior versions is the stub.** With no version store to ask,
 *   this probes for sibling files named `<stem>.v1.systemsketch`,
 *   `<stem>.v2.systemsketch` … beside the open board and offers the ones that
 *   exist. When a real history lands, only `discoverHistory` changes; the
 *   panel above it already speaks in entries and does not care where they came
 *   from.
 */

import type { Editor, TLStoreSnapshot } from 'tldraw'

import { inspectWorkspaceDocumentSource } from '../workspace/workspaceDocument'

export interface HistoryEntry {
	/** Stable id for selection. */
	readonly id: string
	/** What the entry is called in the rail. */
	readonly label: string
	/** A one-line description of what that version was. */
	readonly note: string
	/** Absolute path, or null for the live board. */
	readonly path: string | null
	/** Whether this entry is the live editor rather than a file. */
	readonly isCurrent: boolean
}

/** How many `.vN` siblings to probe for before giving up. */
const HISTORY_PROBE_DEPTH = 6

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
 * Find the prior versions that exist beside the open board.
 *
 * Absence is a finding, not an error: a board with no `.vN` siblings gets a
 * history of one entry — itself — and the panel says there is nothing to
 * compare against rather than inventing a second endpoint.
 */
export async function discoverHistory(currentPath: string | null): Promise<HistoryEntry[]> {
	const entries: HistoryEntry[] = []
	if (currentPath) {
		const { stem, extension } = stemOf(currentPath)
		for (let version = 1; version <= HISTORY_PROBE_DEPTH; version += 1) {
			const candidate = `${stem}.v${version}${extension}`
			// eslint-disable-next-line no-await-in-loop -- ordered probe, at most six
			const source = await readSource(candidate)
			if (!source) continue
			entries.push({
				id: `v${version}`,
				label: `Version ${version}`,
				note: candidate.split('/').pop() ?? candidate,
				path: candidate,
				isCurrent: false,
			})
		}
	}
	entries.push({
		id: 'current',
		label: 'Current version',
		note: currentPath ? (currentPath.split('/').pop() ?? currentPath) : 'unsaved board',
		path: currentPath,
		isCurrent: true,
	})
	return entries
}

/** Read one history entry into a store snapshot, or null if it will not load. */
export async function loadEntrySnapshot(
	entry: HistoryEntry,
	editor: Editor,
): Promise<TLStoreSnapshot | null> {
	if (entry.isCurrent) return editor.store.getStoreSnapshot()
	if (!entry.path) return null
	const source = await readSource(entry.path)
	if (!source) return null
	// The same parser the File menu uses. A comparison that read the bytes its
	// own way would be a second, invisible importer.
	const inspected = inspectWorkspaceDocumentSource(source, editor.store.schema)
	if (inspected.kind !== 'ready' && inspected.kind !== 'future') return null
	return inspected.snapshot as TLStoreSnapshot
}
