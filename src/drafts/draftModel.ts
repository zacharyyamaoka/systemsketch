/**
 * Document-draft branching — pure data model, no React or tldraw.
 *
 * A draft forks Main's current content into its own localStorage slot, is
 * edited in isolation (see the autosave-hold guards in
 * src/workspace/LocalWorkspace.tsx), and is later Merged or Rebased against
 * Main — orchestrated by DraftProvider.tsx. This module owns only the
 * bookkeeping: which drafts and pinned versions exist, and where their
 * content lives. It deliberately never diffs a snapshot itself — every
 * "how much changed" question (the bar's badge, the conflict check, Compare,
 * Rebase) goes through the one shared engine in compareModel.ts instead, via
 * draftSnapshot.ts. A bespoke diff living here would give each of those four
 * consumers its own idea of "changed".
 *
 * Storage layout, both keys scoped by document path so two open boards never
 * collide:
 * - State:    systemsketch.drafts.v1:<documentPath>
 * - Snapshot: systemsketch.draftSnapshot.v1:<documentPath>:<slot>
 *   where slot is "current" (Main's own head), a draft's id (its live head),
 *   or "<draftId>:base" (the immutable Main snapshot the draft forked from —
 *   read again only by Rebase's conflict check, never overwritten after
 *   creation).
 *
 * Every read below is defensive, the same convention as toolbarModel.ts and
 * appearancePreferences.ts: a corrupt or missing record must never stop the
 * canvas from drawing, so a parse failure quietly resets to empty rather than
 * throwing. Storage is an injected parameter rather than a bare global for
 * the same reason those two modules take one — a test can hand it a plain
 * object instead of stubbing `window`.
 */

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Slot name for Main's own head snapshot — never a draft id. */
export const MAIN_SNAPSHOT_SLOT = 'current'

export interface DraftRecord {
	readonly id: string
	readonly name: string
	/** Human label for Main's head at fork time, e.g. "v0.1". */
	readonly baseLabel: string
	/** Fingerprint of Main's snapshot at fork time; null when Main has no file yet. */
	readonly baseDigest: string | null
	readonly createdAt: number
	readonly updatedAt: number
}

export interface VersionRecord {
	readonly id: string
	readonly label: string
	readonly name: string
	readonly createdAt: number
	readonly note?: string
}

export interface DocumentDraftState {
	readonly version: 1
	readonly activeDraftId: string | null
	readonly drafts: readonly DraftRecord[]
	readonly versions: readonly VersionRecord[]
}

export const EMPTY_DRAFT_STATE: DocumentDraftState = {
	version: 1,
	activeDraftId: null,
	drafts: [],
	versions: [],
}

export function draftStateKey(documentPath: string): string {
	return `systemsketch.drafts.v1:${documentPath}`
}

export function draftSnapshotKey(documentPath: string, slot: string): string {
	return `systemsketch.draftSnapshot.v1:${documentPath}:${slot}`
}

/** The immutable Main snapshot a draft forked from. */
export function draftBaseSlot(draftId: string): string {
	return `${draftId}:base`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isDraftRecord(value: unknown): value is DraftRecord {
	if (!isRecord(value)) return false
	return (
		typeof value.id === 'string'
		&& typeof value.name === 'string'
		&& typeof value.baseLabel === 'string'
		&& (value.baseDigest === null || typeof value.baseDigest === 'string')
		&& typeof value.createdAt === 'number'
		&& typeof value.updatedAt === 'number'
	)
}

function isVersionRecord(value: unknown): value is VersionRecord {
	if (!isRecord(value)) return false
	return (
		typeof value.id === 'string'
		&& typeof value.label === 'string'
		&& typeof value.name === 'string'
		&& typeof value.createdAt === 'number'
		&& (value.note === undefined || typeof value.note === 'string')
	)
}

/**
 * Read the draft/version bookkeeping for one document.
 *
 * A malformed individual record is dropped rather than discarding the whole
 * list — the same "a field this record predates is missing, not wrong"
 * tolerance appearancePreferences.ts applies to object fields, here applied
 * to array entries instead.
 */
export function parseDraftState(
	documentPath: string,
	storage: DraftStorage = window.localStorage,
): DocumentDraftState {
	try {
		const raw = storage.getItem(draftStateKey(documentPath))
		if (!raw) return EMPTY_DRAFT_STATE
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed) || parsed.version !== 1) return EMPTY_DRAFT_STATE
		return {
			version: 1,
			activeDraftId: typeof parsed.activeDraftId === 'string' ? parsed.activeDraftId : null,
			drafts: Array.isArray(parsed.drafts) ? parsed.drafts.filter(isDraftRecord) : [],
			versions: Array.isArray(parsed.versions) ? parsed.versions.filter(isVersionRecord) : [],
		}
	} catch {
		return EMPTY_DRAFT_STATE
	}
}

export function saveDraftState(
	documentPath: string,
	state: DocumentDraftState,
	storage: DraftStorage = window.localStorage,
): void {
	try {
		storage.setItem(draftStateKey(documentPath), JSON.stringify(state))
	} catch {
		// Storage full or disabled — the canvas keeps working; the next
		// successful write catches persisted state back up.
	}
}

export function readDraftSnapshot(
	documentPath: string,
	slot: string,
	storage: DraftStorage = window.localStorage,
): string | null {
	try {
		return storage.getItem(draftSnapshotKey(documentPath, slot))
	} catch {
		return null
	}
}

export function writeDraftSnapshot(
	documentPath: string,
	slot: string,
	snapshot: string,
	storage: DraftStorage = window.localStorage,
): void {
	try {
		storage.setItem(draftSnapshotKey(documentPath, slot), snapshot)
	} catch {
		// ignore, same convention as saveDraftState above
	}
}

export function deleteDraftSnapshot(
	documentPath: string,
	slot: string,
	storage: DraftStorage = window.localStorage,
): void {
	try {
		storage.removeItem(draftSnapshotKey(documentPath, slot))
	} catch {
		// ignore
	}
}

/**
 * A stable fingerprint for a serialized board: length plus a djb2 hash, so
 * two snapshots sharing a long prefix still disagree once the tail differs.
 * Not cryptographic — this only ever gates a same-process conflict check
 * (has Main moved since a draft's fork point?), never anything adversarial.
 */
export function snapshotDigest(snapshot: string | null): string | null {
	if (snapshot === null) return null
	let hash = 5381
	for (let i = 0; i < snapshot.length; i++) {
		hash = ((hash << 5) + hash) ^ snapshot.charCodeAt(i)
	}
	return `${snapshot.length}:${(hash >>> 0).toString(16)}`
}

function generateId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

/** "Draft 1", "Draft 2", … — reuses a name a discarded or merged draft freed. */
export function nextDraftName(state: DocumentDraftState): string {
	const used = new Set(state.drafts.map((draft) => draft.name))
	let n = 1
	while (used.has(`Draft ${n}`)) n++
	return `Draft ${n}`
}

/**
 * "v0.1" … "v0.9", "v1.0" … — derived from how many versions are pinned so
 * far rather than stored on its own, so the label can never drift from the
 * count that produces it.
 *
 * The 0.x row is 9-wide (0.1 … 0.9, no "0.0") because a version label is
 * also read before anything has ever been pinned; every row from 1.x on is
 * the ordinary 10-wide count (#.0 … #.9). A single `floor`/`%` over the
 * whole count would need to be 9-wide throughout, which lands on "v1.1"
 * right after "v0.9" and never produces "v1.0" — so the first row is split
 * out before the regular one begins.
 */
export function currentVersionLabel(state: DocumentDraftState): string {
	const n = state.versions.length
	if (n < 9) return `v0.${n + 1}`
	const rest = n - 9
	return `v${1 + Math.floor(rest / 10)}.${rest % 10}`
}

export function createDraft(
	state: DocumentDraftState,
	name: string,
	baseLabel: string,
	baseDigest: string | null,
): { state: DocumentDraftState; draft: DraftRecord } {
	const now = Date.now()
	const draft: DraftRecord = { id: generateId(), name, baseLabel, baseDigest, createdAt: now, updatedAt: now }
	return {
		state: { ...state, activeDraftId: draft.id, drafts: [...state.drafts, draft] },
		draft,
	}
}

export function activateDraft(state: DocumentDraftState, draftId: string | null): DocumentDraftState {
	return { ...state, activeDraftId: draftId }
}

export function renameDraft(state: DocumentDraftState, draftId: string, name: string): DocumentDraftState {
	return {
		...state,
		drafts: state.drafts.map((draft) => (
			draft.id === draftId ? { ...draft, name, updatedAt: Date.now() } : draft
		)),
	}
}

/**
 * Move a draft's fork point forward after a successful Rebase: Main's current
 * state (as of the rebase) becomes the draft's new base, so a later Merge or
 * Rebase conflict-checks against it instead of the stale original fork.
 *
 * Bookkeeping only, same convention as `mergeDraft` above — writing the new
 * base/head snapshots into their storage slots is `draftRebase.ts`'s /
 * `DraftProvider`'s job, not this module's.
 */
export function rebaseDraft(
	state: DocumentDraftState,
	draftId: string,
	baseLabel: string,
	baseDigest: string | null,
): DocumentDraftState {
	return {
		...state,
		drafts: state.drafts.map((draft) => (
			draft.id === draftId ? { ...draft, baseLabel, baseDigest, updatedAt: Date.now() } : draft
		)),
	}
}

export function discardDraft(state: DocumentDraftState, draftId: string): DocumentDraftState {
	return {
		...state,
		activeDraftId: state.activeDraftId === draftId ? null : state.activeDraftId,
		drafts: state.drafts.filter((draft) => draft.id !== draftId),
	}
}

export function pinVersion(
	state: DocumentDraftState,
	name: string,
): { state: DocumentDraftState; version: VersionRecord } {
	const version: VersionRecord = { id: generateId(), label: currentVersionLabel(state), name, createdAt: Date.now() }
	return { state: { ...state, versions: [...state.versions, version] }, version }
}

/**
 * Merge a draft into Main: drop it from the draft list, clear it as active,
 * and pin a version recording the merge.
 *
 * Bookkeeping only. Writing the draft's content into Main's own snapshot
 * slot and saving the file are DraftProvider's job — this module never reads
 * or writes a snapshot itself, per the module comment above.
 */
export function mergeDraft(state: DocumentDraftState, draftId: string): DocumentDraftState {
	const draft = state.drafts.find((d) => d.id === draftId)
	if (!draft) return state
	const version: VersionRecord = {
		id: generateId(),
		label: currentVersionLabel(state),
		name: `Merged ${draft.name}`,
		createdAt: Date.now(),
	}
	return {
		...state,
		activeDraftId: null,
		drafts: state.drafts.filter((d) => d.id !== draftId),
		versions: [...state.versions, version],
	}
}
