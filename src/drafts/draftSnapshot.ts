/**
 * Turning a document-draft's stored content into a `TLStoreSnapshot` — the
 * one shape every consumer of "how much changed" needs, so the bar's badge,
 * the conflict check, Compare, and Rebase all measure the same two things
 * `compareModel.ts`'s `recordsOfSnapshot`/`compareBoards` already know how to
 * read.
 *
 * Both functions here return `null` rather than throw on any parse failure —
 * the same contract `loadVersionSnapshot`/`loadEntrySnapshot`
 * (history/boardHistory.ts, compare/compareSource.ts) already give their
 * callers for exactly this reason: a draft badge or a conflict check has no
 * dialog to put an error in, so "nothing to compare yet" has to be a value,
 * not an exception a caller must remember to catch.
 */
import type { Editor, TLStoreSnapshot } from 'tldraw'

import { hydrateCustomColors } from '../appearance/customColors'
import { decodeSystemSketchDocument } from '../workspace/systemSketchFile'
import { inspectWorkspaceDocumentSource } from '../workspace/workspaceDocument'
import { readWorkspaceDocument, type WorkspaceRequestOptions } from '../workspace/workspaceClient'

/**
 * Parse a stored draft (or Main) source string into a detached snapshot.
 *
 * `source` is whatever `serializeTldrawJson` produced when the slot was last
 * written — the same `.tldr`-shaped JSON every other load path in this app
 * parses. Custom colours are hydrated first, same as every other load site
 * (`LocalWorkspace.tsx`'s `loadDocumentSource`, `applySerializedBoard`-style
 * helpers): the store's colour enum is validated at parse time, so a name
 * registered only after the parse runs would still reject the document.
 */
export function snapshotFromDraftSource(source: string, editor: Editor): TLStoreSnapshot | null {
	const { core } = decodeSystemSketchDocument(source)
	hydrateCustomColors(core, editor)
	const inspected = inspectWorkspaceDocumentSource(source, editor.store.schema)
	if (inspected.kind !== 'ready' && inspected.kind !== 'future') return null
	return inspected.snapshot as TLStoreSnapshot
}

/**
 * Read Main's on-disk content fresh — never a cached slot — and parse it the
 * same way.
 *
 * WHY this exists instead of reading the draft model's own `"current"`
 * snapshot slot: while a draft is open, `LocalWorkspace`'s idle disk-poll
 * that would otherwise notice Main changing is suspended (draftHoldRef), so
 * that cached slot can go stale the moment anything else touches the file.
 * Compare and Rebase both need to know what Main *actually* looks like right
 * now, so both call this instead of `readDraftSnapshot(path, MAIN_SNAPSHOT_SLOT)`.
 */
export async function readFreshMainSnapshot(
	path: string,
	editor: Editor,
	options?: WorkspaceRequestOptions,
): Promise<TLStoreSnapshot | null> {
	try {
		const document = await readWorkspaceDocument(path, options)
		if (document.source === null) return null
		return snapshotFromDraftSource(document.source, editor)
	} catch {
		return null
	}
}
