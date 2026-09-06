/**
 * DraftProvider — React orchestration for document-draft branching.
 *
 * Mounted above `<Tldraw>`, inside `<SystemSketchWorkspaceProvider>`, so it
 * can hold Main's autosave (`workspace.setDraftHold`) for as long as a draft
 * is open. `attachEditor` is called directly from the canvas's `onMount`,
 * the same tick as the workspace's own `attach(editor)` — not received as a
 * React prop the way `CompareProvider` takes `editor` — because a resumed
 * draft has to swap its content in before the first paint. A prop would
 * still work eventually, just one render tick later: long enough to flash
 * Main's content first on every reload where a draft was active.
 *
 * `draftModel.ts` owns the bookkeeping (which drafts exist, where their
 * content lives); this module owns turning that bookkeeping into an actual
 * editing session — loading a draft's content into the live editor, keeping
 * its own localStorage snapshot in sync as the user edits, and measuring
 * "how much changed" through the one shared engine (`compareModel.ts`) via
 * `draftSnapshot.ts`, never a bespoke diff of its own.
 */
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { loadSnapshot, serializeTldrawJson, type Editor, type TLStoreSnapshot } from 'tldraw'

import { settleConnectionParents } from '../blocks/connections/ConnectionBindingUtil'
import { compareBoards, recordsOfSnapshot, type BoardCompare } from '../compare/compareModel'
import { useLocalWorkspace } from '../workspace/LocalWorkspace'
import { readWorkspaceDocument } from '../workspace/workspaceClient'
import {
	MAIN_SNAPSHOT_SLOT,
	activateDraft,
	createDraft,
	currentVersionLabel,
	deleteDraftSnapshot,
	discardDraft,
	draftBaseSlot,
	mergeDraft,
	nextDraftName,
	parseDraftState,
	readDraftSnapshot,
	rebaseDraft,
	renameDraft,
	saveDraftState,
	snapshotDigest,
	writeDraftSnapshot,
	EMPTY_DRAFT_STATE,
	type DocumentDraftState,
	type DraftRecord,
	type VersionRecord,
} from './draftModel'
import { computeRebase } from './draftRebase'
import { readFreshMainSnapshot, snapshotFromDraftSource } from './draftSnapshot'

export interface RebaseResult {
	readonly ok: boolean
	readonly conflictCount: number
}

/**
 * What `merge()` did, in the same shape `RebaseResult` already uses so the bar
 * reads both actions the same way.
 *
 * Merge is fast-forward ONLY: it refuses whenever Main has moved since this
 * draft forked, rather than promoting a stale snapshot over someone else's
 * work. `reason` says which refusal it was, so the bar can tell "rebase first"
 * apart from "we could not even check".
 */
export interface MergeResult {
	readonly ok: boolean
	/** Changes Main has taken on since this draft's fork point. */
	readonly driftCount: number
	readonly reason: 'drifted' | 'unreadable' | null
}

/** Both sides `DraftModeBar`'s Compare button needs — see `getCompareSnapshots` below. */
export interface CompareSnapshots {
	readonly main: TLStoreSnapshot | null
	readonly draftHead: TLStoreSnapshot | null
}

/**
 * What a Rebase WOULD do, computed without doing it.
 *
 * `computeRebase` has always been a pure function over three snapshots that
 * returns the merged result rather than applying it — a dry run was already
 * sitting there. This exposes it so Rebase can be reviewed before it happens,
 * which is the whole point of routing Rebase through the Compare dialog: the
 * `after` side is the draft as it WOULD look, not Main.
 */
export interface RebasePreview {
	readonly outcome: 'ready' | 'conflicted' | 'unreadable'
	/** Conflicting records, when `conflicted`. Zero otherwise. */
	readonly conflictCount: number
	/** The draft's current head. Null only when `unreadable`. */
	readonly draftHead: TLStoreSnapshot | null
	/** Fresh Main — the other half of a conflicted review. Null when `unreadable`. */
	readonly main: TLStoreSnapshot | null
	/** The post-rebase snapshot. Present only when `ready`. */
	readonly proposed: TLStoreSnapshot | null
}

export interface DraftContextValue {
	readonly activeDraftId: string | null
	readonly drafts: readonly DraftRecord[]
	readonly versions: readonly VersionRecord[]
	/** Convenience lookup — `drafts.find((d) => d.id === activeDraftId)`. */
	readonly activeDraft: DraftRecord | null
	readonly isDraftMode: boolean
	/**
	 * `compareBoards(fresh Main, draft's live head)` — the SAME question
	 * Compare's dialog answers, so the bar's badge and the dialog it opens can
	 * never disagree (see the WHY on `recomputeChanges` below). NOT the
	 * draft's own fork-point diff — use `hasUnpromotedEdits` for "is there
	 * anything to promote at all".
	 */
	readonly changes: BoardCompare
	/** True when Main has moved since the active draft's fork point. */
	readonly hasConflict: boolean
	/**
	 * True when the draft's live head differs from its base AT ALL — a raw
	 * digest of the stored source strings, not `compareBoards`. `changes`
	 * (and the "Compare N Changes" badge it drives) structurally cannot see a
	 * shape that only moved: `x`/`y`/`rotation`/`parentId` live outside
	 * `props`, which is all `compareBoards` diffs. Gate Merge/Rebase
	 * enablement on THIS, never on `changes.total === 0` — a move-only draft
	 * must still be promotable.
	 */
	readonly hasUnpromotedEdits: boolean
	createDraftAction(name?: string): Promise<void>
	/** Enter OR resume a draft; `null` exits to Main. One path for both. */
	switchTo(draftId: string | null): Promise<void>
	renameDraftAction(draftId: string, name: string): void
	/** Discard the active draft: release the hold, restore Main, forget its content. */
	discard(draftId: string): Promise<void>
	/** Promote the draft to Main. Fast-forward only — see the implementation. */
	merge(draftId: string): Promise<MergeResult>
	rebaseDraftAction(draftId: string): Promise<RebaseResult>
	/** What `rebaseDraftAction` would produce, computed and NOT applied. */
	previewRebase(draftId: string): Promise<RebasePreview>
	/**
	 * Fresh Main plus the active draft's current live content, as real
	 * `TLStoreSnapshot`s — additive, for `DraftModeBar`'s Compare button.
	 *
	 * `DraftModeBar` renders as a sibling above `<Tldraw>` (the bar pushes the
	 * canvas down rather than overlaying it), so it has no `useEditor()` of its
	 * own to read the live document from. This module already holds the one
	 * thing that does — `editorRef` — plus the fresh-Main read Compare/Rebase
	 * both need, so it is the natural owner rather than a second copy of
	 * `readFreshMainSnapshot` living in the bar component.
	 */
	getCompareSnapshots(): Promise<CompareSnapshots>
	/** Call synchronously from the canvas's `onMount`, right after `attach(editor)`. */
	attachEditor(editor: Editor): () => void
}

const DraftContext = createContext<DraftContextValue | null>(null)

export function useDrafts(): DraftContextValue {
	const ctx = useContext(DraftContext)
	if (!ctx) throw new Error('useDrafts must be used inside DraftProvider')
	return ctx
}

/** How long an edit sits before it is written to the draft's own localStorage slot. */
const SNAPSHOT_DEBOUNCE_MS = 300
/**
 * How long an edit sits before `changes` is recomputed — now a real disk read
 * (fresh Main), not just a local slot comparison. Bumped from 400ms: this
 * fires only once activity settles (stacked on top of `SNAPSHOT_DEBOUNCE_MS`
 * already gating the write beneath it), so a slightly longer pause here trims
 * disk reads during a drag without making the badge feel stale.
 */
const CHANGES_DEBOUNCE_MS = 600

function emptyCompare(): BoardCompare {
	return compareBoards({}, {})
}

/**
 * Load a stored source into the live editor without dirtying Main's autosave.
 *
 * `mergeRemoteChanges` is what makes this invisible to `LocalWorkspace`'s own
 * `editor.store.listen({ source: 'user' })` autosave listener — the same
 * trick every other "load a serialized board back in" site in this app uses
 * (`LocalWorkspace.tsx`'s `loadDocumentSource`). Returns false, changing
 * nothing, if the source will not parse.
 */
function applyDraftSourceToEditor(editor: Editor, source: string): boolean {
	const snapshot = snapshotFromDraftSource(source, editor)
	if (!snapshot) return false
	editor.store.mergeRemoteChanges(() => {
		loadSnapshot(editor.store, snapshot)
	})
	settleConnectionParents(editor)
	editor.selectNone()
	return true
}

export function DraftProvider({ children }: { children: ReactNode }) {
	const workspace = useLocalWorkspace()
	const documentPath = workspace.path ?? ''

	const editorRef = useRef<Editor | null>(null)
	const stateRef = useRef<DocumentDraftState>(EMPTY_DRAFT_STATE)
	const [state, setState] = useState<DocumentDraftState>(
		() => (documentPath ? parseDraftState(documentPath) : EMPTY_DRAFT_STATE),
	)
	stateRef.current = state

	const [changes, setChanges] = useState<BoardCompare>(emptyCompare)
	const [hasConflict, setHasConflict] = useState(false)
	const [hasUnpromotedEdits, setHasUnpromotedEdits] = useState(false)
	const snapshotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const changesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const persistState = useCallback((next: DocumentDraftState) => {
		stateRef.current = next
		setState(next)
		if (documentPath) saveDraftState(documentPath, next)
	}, [documentPath])

	const activeDraft = useMemo(
		() => state.drafts.find((draft) => draft.id === state.activeDraftId) ?? null,
		[state],
	)
	const isDraftMode = activeDraft !== null

	/**
	 * Settle both `hasUnpromotedEdits` and the bar's `changes` badge.
	 *
	 * The two questions are deliberately answered from different sources:
	 *
	 * - `hasUnpromotedEdits` is a raw digest of the draft's own stored base vs
	 *   head source strings — purely local, synchronous, and byte-level (it
	 *   sees a pure move, which `compareBoards` cannot). It gates Merge/Rebase
	 *   enablement, so it must never be blind to a real edit.
	 * - `changes` is `compareBoards(fresh Main, live head)` — the SAME two
	 *   snapshots `getCompareSnapshots` hands the dialog. It used to read the
	 *   draft's own cached base slot instead (fork-point vs head), which is a
	 *   different question from what the dialog answers: the two numbers
	 *   routinely disagreed (confirmed live — button said "1 Change", dialog
	 *   said "0 Added · 2 Removed · 1 Modified"). Reading Main fresh here is a
	 *   real disk read, which is why this is called from a debounce that only
	 *   fires once activity settles, not on every store event.
	 */
	const recomputeChanges = useCallback(async (draftId: string) => {
		const editor = editorRef.current
		if (!editor || !documentPath) return
		const baseSource = readDraftSnapshot(documentPath, draftBaseSlot(draftId))
		const headSource = readDraftSnapshot(documentPath, draftId)
		if (!headSource) {
			setChanges(emptyCompare())
			setHasUnpromotedEdits(false)
			return
		}
		setHasUnpromotedEdits(baseSource !== null && snapshotDigest(baseSource) !== snapshotDigest(headSource))

		const freshMain = await readFreshMainSnapshot(documentPath, editor)
		// The active draft may have changed (or closed) while that read was in
		// flight — a stale read must never overwrite a newer draft's numbers.
		if (stateRef.current.activeDraftId !== draftId) return
		const after = snapshotFromDraftSource(headSource, editor)
		setChanges(
			freshMain && after
				? compareBoards(recordsOfSnapshot(freshMain), recordsOfSnapshot(after))
				: emptyCompare(),
		)
	}, [documentPath])

	const scheduleChangesRecompute = useCallback((draftId: string) => {
		if (changesDebounceRef.current) clearTimeout(changesDebounceRef.current)
		changesDebounceRef.current = setTimeout(() => {
			changesDebounceRef.current = null
			void recomputeChanges(draftId)
		}, CHANGES_DEBOUNCE_MS)
	}, [recomputeChanges])

	/**
	 * How far Main has moved since this draft's fork point — read FRESH off
	 * disk, never off the `MAIN_SNAPSHOT_SLOT` cache. That cache can go stale
	 * the moment anything else touches the file, because the idle disk-poll
	 * that would otherwise notice is suspended for as long as this draft
	 * holds autosave (see the WHY comment on the poll's skip condition in
	 * `LocalWorkspace.tsx`).
	 *
	 * `null` means the question could not be answered at all — no editor, no
	 * fork point on record, or Main unreadable. Callers must treat that as
	 * "unknown", never as "clear": `merge()` refuses on it.
	 */
	const readMainDrift = useCallback(async (draftId: string): Promise<number | null> => {
		const editor = editorRef.current
		if (!editor || !documentPath) return null
		const baseSource = readDraftSnapshot(documentPath, draftBaseSlot(draftId))
		if (!baseSource) return null
		const base = snapshotFromDraftSource(baseSource, editor)
		const freshMain = await readFreshMainSnapshot(documentPath, editor)
		if (!base || !freshMain) return null
		return compareBoards(recordsOfSnapshot(base), recordsOfSnapshot(freshMain)).total
	}, [documentPath])

	/**
	 * Settle the advisory "Main changed since this draft" badge.
	 *
	 * WHY it is pulled on demand rather than polled: this is a deliberate disk
	 * read, and the plan explicitly avoided a second poll running beside
	 * `LocalWorkspace`'s (which is suspended under a draft hold anyway). So it
	 * runs at every moment the answer is about to matter — entering or resuming
	 * a draft, opening Compare, and either outcome of Rebase — instead of
	 * continuously. The badge is advisory only; nothing destructive is gated on
	 * it, because `merge()` does its own fresh check at the instant of the
	 * click rather than trusting this cached flag.
	 */
	const refreshConflict = useCallback(async (draftId: string) => {
		const drift = await readMainDrift(draftId)
		setHasConflict(drift !== null && drift > 0)
	}, [readMainDrift])

	/** Serialize the live editor and write it into the active draft's own head slot. */
	const flushActiveDraftSnapshot = useCallback(async (): Promise<string | null> => {
		const editor = editorRef.current
		const activeId = stateRef.current.activeDraftId
		if (!editor || !activeId || !documentPath) return null
		if (snapshotDebounceRef.current) {
			clearTimeout(snapshotDebounceRef.current)
			snapshotDebounceRef.current = null
		}
		const source = await serializeTldrawJson(editor)
		writeDraftSnapshot(documentPath, activeId, source)
		return source
	}, [documentPath])

	const attachEditor = useCallback((editor: Editor): (() => void) => {
		editorRef.current = editor

		const loaded = documentPath ? parseDraftState(documentPath) : EMPTY_DRAFT_STATE
		stateRef.current = loaded
		setState(loaded)

		if (loaded.activeDraftId) {
			const draft = loaded.drafts.find((candidate) => candidate.id === loaded.activeDraftId)
			const draftSource = draft ? readDraftSnapshot(documentPath, draft.id) : null
			if (draft && draftSource && applyDraftSourceToEditor(editor, draftSource)) {
				workspace.setDraftHold(true)
				void recomputeChanges(draft.id)
				void refreshConflict(draft.id)
			} else {
				// The draft's own content will not load — fail safe back to Main
				// rather than hold autosave over content nobody can see or edit.
				persistState(activateDraft(loaded, null))
			}
		}

		const stopListener = editor.store.listen(() => {
			if (editorRef.current !== editor) return
			const activeId = stateRef.current.activeDraftId
			if (!activeId || !documentPath) return
			if (snapshotDebounceRef.current) clearTimeout(snapshotDebounceRef.current)
			snapshotDebounceRef.current = setTimeout(() => {
				snapshotDebounceRef.current = null
				void serializeTldrawJson(editor).then((source) => {
					if (stateRef.current.activeDraftId !== activeId) return
					writeDraftSnapshot(documentPath, activeId, source)
					scheduleChangesRecompute(activeId)
				})
			}, SNAPSHOT_DEBOUNCE_MS)
		}, { source: 'user', scope: 'document' })

		return () => {
			stopListener()
			if (snapshotDebounceRef.current) {
				clearTimeout(snapshotDebounceRef.current)
				snapshotDebounceRef.current = null
			}
			if (changesDebounceRef.current) {
				clearTimeout(changesDebounceRef.current)
				changesDebounceRef.current = null
			}
			if (editorRef.current === editor) editorRef.current = null
		}
	}, [documentPath, workspace, persistState, recomputeChanges, refreshConflict, scheduleChangesRecompute])

	const createDraftAction = useCallback(async (name?: string) => {
		const editor = editorRef.current
		if (!editor || !documentPath) return
		const current = stateRef.current
		const draftName = name ?? nextDraftName(current)
		const baseLabel = currentVersionLabel(current)

		// A new draft always forks MAIN, never whatever draft happens to be open.
		let mainSource: string | null
		if (current.activeDraftId) {
			// Flush the outgoing draft's own edits first, then read Main FRESH —
			// it may have moved since this session last touched it, and the
			// cached MAIN_SNAPSHOT_SLOT has had no disk-poll keeping it honest
			// for as long as a draft has held autosave.
			await flushActiveDraftSnapshot()
			try {
				const document = await readWorkspaceDocument(documentPath)
				mainSource = document.source
			} catch {
				mainSource = null
			}
		} else {
			await workspace.save(true)
			mainSource = await serializeTldrawJson(editor)
			writeDraftSnapshot(documentPath, MAIN_SNAPSHOT_SLOT, mainSource)
		}
		if (mainSource === null) return

		const baseDigest = snapshotDigest(mainSource)
		const { state: nextState, draft } = createDraft(current, draftName, baseLabel, baseDigest)
		writeDraftSnapshot(documentPath, draft.id, mainSource)
		writeDraftSnapshot(documentPath, draftBaseSlot(draft.id), mainSource)

		workspace.setDraftHold(true)
		if (current.activeDraftId) applyDraftSourceToEditor(editor, mainSource)
		persistState(nextState)
		setChanges(emptyCompare())
		setHasConflict(false)
		setHasUnpromotedEdits(false)
	}, [documentPath, workspace, persistState, flushActiveDraftSnapshot])

	const switchTo = useCallback(async (draftId: string | null) => {
		const editor = editorRef.current
		if (!editor || !documentPath) return
		const current = stateRef.current
		const outgoingId = current.activeDraftId

		if (outgoingId) {
			await flushActiveDraftSnapshot()
		} else if (draftId !== null) {
			// Leaving Main for a draft: cache what Main looks like right now, so
			// Exit/Discard and a same-draft fork have something to fall back to
			// while the disk-poll that would otherwise track it is suspended.
			await workspace.save(true)
			const liveMain = await serializeTldrawJson(editor)
			writeDraftSnapshot(documentPath, MAIN_SNAPSHOT_SLOT, liveMain)
		}

		if (draftId === null) {
			const mainSource = readDraftSnapshot(documentPath, MAIN_SNAPSHOT_SLOT)
			workspace.setDraftHold(false)
			if (mainSource) applyDraftSourceToEditor(editor, mainSource)
			persistState(activateDraft(current, null))
			setChanges(emptyCompare())
			setHasConflict(false)
			setHasUnpromotedEdits(false)
			return
		}

		const draftSource = readDraftSnapshot(documentPath, draftId)
		workspace.setDraftHold(true)
		if (draftSource) applyDraftSourceToEditor(editor, draftSource)
		persistState(activateDraft(current, draftId))
		void recomputeChanges(draftId)
		const draft = current.drafts.find((candidate) => candidate.id === draftId)
		if (draft) void refreshConflict(draft.id)
	}, [documentPath, workspace, persistState, recomputeChanges, refreshConflict, flushActiveDraftSnapshot])

	const renameDraftAction = useCallback((draftId: string, name: string) => {
		persistState(renameDraft(stateRef.current, draftId, name))
	}, [persistState])

	const discard = useCallback(async (draftId: string) => {
		const editor = editorRef.current
		const current = stateRef.current
		const isActive = current.activeDraftId === draftId

		if (isActive && editor) {
			const mainSource = readDraftSnapshot(documentPath, MAIN_SNAPSHOT_SLOT)
			workspace.setDraftHold(false)
			if (mainSource) applyDraftSourceToEditor(editor, mainSource)
		}

		deleteDraftSnapshot(documentPath, draftId)
		deleteDraftSnapshot(documentPath, draftBaseSlot(draftId))
		persistState(discardDraft(current, draftId))
		if (isActive) {
			setChanges(emptyCompare())
			setHasConflict(false)
			setHasUnpromotedEdits(false)
		}
	}, [documentPath, workspace, persistState])

	/**
	 * Merge — promote the draft's content to Main. Fast-forward ONLY.
	 *
	 * WHY the drift check is here, fresh, before anything else happens: Merge
	 * writes the draft's snapshot into Main's slot and forces a save, so it
	 * overwrites Main WHOLESALE. If Main moved since this draft forked — a peer
	 * session, another window, an edit made before the draft was resumed — every
	 * one of those edits is destroyed with no diff, no undo entry on the other
	 * side, and a success report. A changed Main has to be a visible stop.
	 *
	 * It deliberately does NOT consult the cached `hasConflict` flag. That badge
	 * is refreshed only at the few moments listed on `refreshConflict`, and the
	 * disk-poll that would otherwise keep it honest is suspended for the whole
	 * life of a draft hold — so at the instant of the click it may be arbitrarily
	 * old. The one read that can be trusted is the one taken now, which is what
	 * `readMainDrift` does, mirroring `rebaseDraftAction`'s own fresh read.
	 *
	 * Unverifiable is a refusal too: without a fork point on record or a
	 * readable Main there is no way to know what promoting this draft would
	 * destroy, and "check failed" must never fall through to "overwrite".
	 */
	const merge = useCallback(async (draftId: string): Promise<MergeResult> => {
		const editor = editorRef.current
		if (!editor || !documentPath) return { ok: false, driftCount: 0, reason: 'unreadable' }
		if (!stateRef.current.drafts.some((draft) => draft.id === draftId)) {
			return { ok: false, driftCount: 0, reason: 'unreadable' }
		}

		const drift = await readMainDrift(draftId)
		if (drift === null) return { ok: false, driftCount: 0, reason: 'unreadable' }
		if (drift > 0) {
			// Rebase is the way forward, and it is one click away in the same
			// split button — so refuse and let the badge say why.
			setHasConflict(true)
			return { ok: false, driftCount: drift, reason: 'drifted' }
		}
		setHasConflict(false)

		if (stateRef.current.activeDraftId !== draftId) await switchTo(draftId)
		const draftSource = (await flushActiveDraftSnapshot()) ?? await serializeTldrawJson(editor)
		writeDraftSnapshot(documentPath, MAIN_SNAPSHOT_SLOT, draftSource)

		// The live editor already holds the draft's content (we are on it, per
		// the switchTo above), so releasing the hold and forcing a save writes
		// exactly that content to Main's real file — unchanged Merge semantics.
		workspace.setDraftHold(false)
		await workspace.save(true)

		persistState(mergeDraft(stateRef.current, draftId))
		deleteDraftSnapshot(documentPath, draftId)
		deleteDraftSnapshot(documentPath, draftBaseSlot(draftId))
		setChanges(emptyCompare())
		setHasConflict(false)
		setHasUnpromotedEdits(false)
		return { ok: true, driftCount: 0, reason: null }
	}, [documentPath, workspace, persistState, flushActiveDraftSnapshot, switchTo, readMainDrift])

	/**
	 * Rebase — pull Main's current state into this draft, the inverse of
	 * Merge. `draftRebase.ts`'s `computeRebase` does the actual decide-and-
	 * merge work as a pure function on three `TLStoreSnapshot`s; everything
	 * here is fetching those three inputs, and — on success — turning its
	 * output back into stored content.
	 *
	 * MVP scope, matching every other call site of this action today
	 * (`DraftModeBar` only ever rebases `activeDraft.id`): a rebased draft
	 * must be the currently ACTIVE one. `serializeTldrawJson` needs a live
	 * editor's own `store.allRecords()` to turn a constructed snapshot back
	 * into the string this app persists — there is no headless second tldraw
	 * store here to encode a background draft's snapshot with (unlike
	 * `exportPortableTldraw`'s off-screen `Editor`, which exists for a very
	 * different, already-mounted-DOM job) — so a background draft throws
	 * rather than silently doing nothing.
	 */
	const rebaseDraftAction = useCallback(async (draftId: string): Promise<RebaseResult> => {
		const editor = editorRef.current
		if (!editor || !documentPath) throw new Error('Rebase requires an open board.')
		const draft = stateRef.current.drafts.find((candidate) => candidate.id === draftId)
		if (!draft) throw new Error('Rebase requires an existing draft.')
		if (stateRef.current.activeDraftId !== draftId) {
			throw new Error('Rebase currently only supports the active draft.')
		}

		const baseSource = readDraftSnapshot(documentPath, draftBaseSlot(draftId))
		const base = baseSource ? snapshotFromDraftSource(baseSource, editor) : null
		if (!base) throw new Error("Could not read the draft's fork point.")

		// Flush the draft's own live edits to its head slot first — same
		// "read what is actually there" discipline `merge()` and `switchTo()`
		// already apply before treating a draft's snapshot as authoritative.
		const headSource = (await flushActiveDraftSnapshot()) ?? await serializeTldrawJson(editor)
		const draftHead = snapshotFromDraftSource(headSource, editor)
		if (!draftHead) throw new Error("Could not read the draft's current content.")

		// One fetch, not `readFreshMainSnapshot` — Rebase needs Main's raw
		// source string too (to become the draft's new base slot), which that
		// helper parses and discards.
		let freshMainSource: string | null
		try {
			freshMainSource = (await readWorkspaceDocument(documentPath)).source
		} catch {
			freshMainSource = null
		}
		if (!freshMainSource) throw new Error('Could not read Main to rebase onto.')
		const freshMain = snapshotFromDraftSource(freshMainSource, editor)
		if (!freshMain) throw new Error('Could not read Main to rebase onto.')

		// Both snapshots are already in hand, so settle the badge from them
		// rather than leaving it stale on the way out — no extra disk read.
		setHasConflict(compareBoards(recordsOfSnapshot(base), recordsOfSnapshot(freshMain)).total > 0)

		const computed = computeRebase({ base, draftHead, freshMain })
		if (!computed.ok) return { ok: false, conflictCount: computed.conflictCount }

		// Apply the merged result into the live editor — same
		// mergeRemoteChanges/loadSnapshot trick Exit/Resume/Discard use — then
		// serialize it back out; this is what "no headless store" above
		// actually costs: a background draft has no live editor to run this
		// through.
		editor.store.mergeRemoteChanges(() => {
			loadSnapshot(editor.store, computed.snapshot)
		})
		settleConnectionParents(editor)
		editor.selectNone()
		const mergedSource = await serializeTldrawJson(editor)

		// The new fork point IS fresh Main; the new head is the merge.
		writeDraftSnapshot(documentPath, draftBaseSlot(draftId), freshMainSource)
		writeDraftSnapshot(documentPath, draftId, mergedSource)

		const baseLabel = currentVersionLabel(stateRef.current)
		const baseDigest = snapshotDigest(freshMainSource)
		persistState(rebaseDraft(stateRef.current, draftId, baseLabel, baseDigest))

		void recomputeChanges(draftId)
		void refreshConflict(draftId)

		return { ok: true, conflictCount: 0 }
	}, [documentPath, persistState, flushActiveDraftSnapshot, recomputeChanges, refreshConflict])

	/**
	 * Compute a Rebase without applying it, so the reviewer sees the proposed
	 * result before committing to it.
	 *
	 * WHY this reads its three inputs itself instead of `rebaseDraftAction`
	 * being refactored to share them: that function was just hardened against a
	 * real data-loss bug, and a preview is advisory — the confirm re-runs the
	 * REAL action, which re-derives all three inputs from scratch at the instant
	 * of the click. So the worst a diverged preview can do is show a stale
	 * picture; it can never decide what gets written. Extracting a shared reader
	 * would put a fresh seam through the one path where being wrong destroys
	 * work, to save a duplication the design deliberately tolerates.
	 *
	 * It goes through `flushActiveDraftSnapshot` for the same reason the real
	 * action does, and this one is load-bearing for the DIFF: both sides of the
	 * preview then travel through the app's own codec (`serializeTldrawJson` ->
	 * `snapshotFromDraftSource`), so the review shows real edits instead of
	 * whatever the round trip normalises. Taking `before` from the live store
	 * and `after` from the computed merge would manufacture phantom rows.
	 */
	const previewRebase = useCallback(async (draftId: string): Promise<RebasePreview> => {
		const blank: RebasePreview = {
			outcome: 'unreadable', conflictCount: 0, draftHead: null, main: null, proposed: null,
		}
		const editor = editorRef.current
		if (!editor || !documentPath) return blank
		if (stateRef.current.activeDraftId !== draftId) return blank

		const baseSource = readDraftSnapshot(documentPath, draftBaseSlot(draftId))
		const base = baseSource ? snapshotFromDraftSource(baseSource, editor) : null
		if (!base) return blank

		const headSource = (await flushActiveDraftSnapshot()) ?? await serializeTldrawJson(editor)
		const draftHead = snapshotFromDraftSource(headSource, editor)
		if (!draftHead) return blank

		let freshMainSource: string | null
		try {
			freshMainSource = (await readWorkspaceDocument(documentPath)).source
		} catch {
			freshMainSource = null
		}
		const freshMain = freshMainSource ? snapshotFromDraftSource(freshMainSource, editor) : null
		if (!freshMain) return blank

		// Same free badge settle every other fresh-Main read in this file does.
		setHasConflict(compareBoards(recordsOfSnapshot(base), recordsOfSnapshot(freshMain)).total > 0)

		const computed = computeRebase({ base, draftHead, freshMain })
		if (!computed.ok) {
			return {
				outcome: 'conflicted',
				conflictCount: computed.conflictCount,
				draftHead,
				main: freshMain,
				proposed: null,
			}
		}
		return {
			outcome: 'ready',
			conflictCount: 0,
			draftHead,
			main: freshMain,
			proposed: computed.snapshot,
		}
	}, [documentPath, flushActiveDraftSnapshot])

	const getCompareSnapshots = useCallback(async (): Promise<CompareSnapshots> => {
		const editor = editorRef.current
		if (!editor || !documentPath) return { main: null, draftHead: null }
		const main = await readFreshMainSnapshot(documentPath, editor)
		// The live editor already holds the active draft's content whenever this
		// is called (Compare only appears in the bar while `isDraftMode`), so its
		// current store snapshot IS the draft's head — no extra parse needed.
		const draftHead = editor.store.getStoreSnapshot()

		// Opening Compare is already a fresh read of Main, so settle the
		// advisory badge off it for free. Without this the badge could sit
		// wrong for the whole life of a draft — it was computed at draft entry
		// and nothing since then re-asked.
		const activeId = stateRef.current.activeDraftId
		const baseSource = activeId ? readDraftSnapshot(documentPath, draftBaseSlot(activeId)) : null
		const base = baseSource ? snapshotFromDraftSource(baseSource, editor) : null
		if (main && base) {
			setHasConflict(compareBoards(recordsOfSnapshot(base), recordsOfSnapshot(main)).total > 0)
		}

		return { main, draftHead }
	}, [documentPath])

	const value = useMemo<DraftContextValue>(() => ({
		activeDraftId: state.activeDraftId,
		drafts: state.drafts,
		versions: state.versions,
		activeDraft,
		isDraftMode,
		changes,
		hasConflict,
		hasUnpromotedEdits,
		createDraftAction,
		switchTo,
		renameDraftAction,
		discard,
		merge,
		rebaseDraftAction,
		previewRebase,
		getCompareSnapshots,
		attachEditor,
	}), [
		state,
		activeDraft,
		isDraftMode,
		changes,
		hasConflict,
		hasUnpromotedEdits,
		createDraftAction,
		switchTo,
		renameDraftAction,
		discard,
		merge,
		rebaseDraftAction,
		previewRebase,
		getCompareSnapshots,
		attachEditor,
	])

	return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}
