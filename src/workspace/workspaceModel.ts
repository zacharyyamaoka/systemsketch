import { encodeSystemSketchDocument } from './systemSketchFile'

/**
 * SystemSketch owns two document extensions, and the extension is the whole
 * contract: `.systemsketch` carries the envelope in `systemSketchFile.ts`,
 * `.tldr` stays a plain tldraw file. Everything new is written as
 * `.systemsketch`; `.tldr` is opened, edited and saved in place, unconverted,
 * because silently rewriting the type of a file someone already has is not
 * backwards compatibility.
 */
export const SYSTEMSKETCH_SUFFIX = '.systemsketch'
export const TLDRAW_SUFFIX = '.tldr'
export const DOCUMENT_SUFFIXES = [SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX] as const
export type DocumentSuffix = (typeof DOCUMENT_SUFFIXES)[number]
export const RECENT_DOCUMENTS_KEY = 'systemsketch.recentDocuments.v1'
export const MAX_RECENT_DOCUMENTS = 12

export interface DocumentFingerprint {
  mtime: number
  size: number
  /** Digest of the exact UTF-8 file bytes; authoritative when both sides have one. */
  digest: string | null
}

export const AUTOSAVE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const

export interface AutosaveSchedule {
  /** The first edit in the still-unpersisted burst. */
  pendingSince: number
  /** Delay from `now` until the next save attempt. */
  delayMs: number
}

export type SyncAction =
  | { kind: 'idle' }
  | { kind: 'reload' }
  | { kind: 'conflict' }
  | { kind: 'missing' }

/**
 * The document extension `path` uses, or `null` if it is not a SystemSketch
 * document. Both separators are split on: an IDE host hands over the operating
 * system's own path, which on Windows is `C:\\goldens\\01\\target.systemsketch`.
 */
export function documentSuffix(path: string): DocumentSuffix | null {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  return DOCUMENT_SUFFIXES.find(
    (suffix) => name.length > suffix.length && name.endsWith(suffix),
  ) ?? null
}

/** Which on-disk encoding a path implies. The suffix decides; nothing else does. */
export function documentEncoding(path: string): 'systemsketch' | 'tldraw' {
  return documentSuffix(path) === SYSTEMSKETCH_SUFFIX ? 'systemsketch' : 'tldraw'
}

/** Serialized tldraw JSON, wrapped for `path` if — and only if — `path` asks for it. */
export function encodeDocumentForPath(path: string, tldrawJson: string): string {
  return documentEncoding(path) === 'systemsketch'
    ? encodeSystemSketchDocument(tldrawJson)
    : tldrawJson
}

export function documentTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  const suffix = documentSuffix(name)
  return suffix ? name.slice(0, -suffix.length) : name
}

export function parentDirectory(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
}

function comparableAbsolutePath(path: string): string {
  let comparable = path.replace(/\\/g, '/')
  while (comparable.length > 1 && comparable.endsWith('/')) comparable = comparable.slice(0, -1)
  // Windows paths are case-insensitive. The browser may receive one spelling
  // from an IDE URL and another from the workspace host, so compare drives in
  // the same way the filesystem does.
  if (/^[a-z]:\//i.test(comparable)) comparable = comparable.toLowerCase()
  return comparable
}

/**
 * Pick the directory an app-owned file browser should open in.
 *
 * A development Preview may be authorized to load one document directly from
 * its source worktree. That extra document root deliberately does not grant
 * directory-listing authority, so Save As / New must fall back to the primary
 * workspace instead of trying to browse beside the source fixture.
 */
export function workspaceBrowserDirectory(
  documentPath: string | null,
  primaryRoot: string | null,
  defaultDirectory: string | null,
): string | undefined {
  if (!defaultDirectory) return undefined
  if (!documentPath || !primaryRoot) return defaultDirectory

  const candidate = comparableAbsolutePath(documentPath)
  const root = comparableAbsolutePath(primaryRoot)
  const isInsidePrimaryRoot = root === '/'
    ? candidate.startsWith('/')
    : candidate === root || candidate.startsWith(`${root}/`)
  return isInsidePrimaryRoot ? parentDirectory(documentPath.replace(/\\/g, '/')) : defaultDirectory
}

/**
 * Turn a typed name into a document path. A name that already names a known
 * type keeps it, so `Export.tldr` in Save As really does write a `.tldr`;
 * anything else takes `fallbackSuffix`, which is `.systemsketch` everywhere a
 * new document is being made.
 */
export function documentPathFor(
  directory: string,
  rawName: string,
  fallbackSuffix: DocumentSuffix = SYSTEMSKETCH_SUFFIX,
): string | null {
  const typed = rawName.trim()
  const suffix = documentSuffix(typed) ?? fallbackSuffix
  const trimmed = (documentSuffix(typed) ? typed.slice(0, -suffix.length) : typed).trim()
  if (!trimmed) return null
  const safe = trimmed.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim()
  if (!safe) return null
  return `${directory.replace(/\/$/, '')}/${safe}${suffix}`
}

/** Rename keeps the document's type: a `.tldr` renamed is still a `.tldr`. */
export function renamedDocumentPath(path: string, rawName: string): string | null {
  return documentPathFor(
    parentDirectory(path),
    rawName,
    documentSuffix(path) ?? SYSTEMSKETCH_SUFFIX,
  )
}

/**
 * Allocate the next free `Untitled` document. Collision is judged on the
 * *title*, not the full path, so a folder already holding `Untitled.tldr` gets
 * `Untitled 2.systemsketch` rather than two files that read as the same name.
 */
export function nextUntitledDocumentPath(
  directory: string,
  existingPaths: readonly string[],
): string {
  const occupied = new Set(existingPaths.map((path) => documentTitle(path).toLowerCase()))
  for (let index = 1; ; index += 1) {
    const title = index === 1 ? 'Untitled' : `Untitled ${index}`
    if (!occupied.has(title.toLowerCase())) return documentPathFor(directory, title)!
  }
}

export function documentHref(path: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('board', path)
  return `${url.pathname}${url.search}${url.hash}`
}

/** Export always means a stock `.tldr`, even when a known different suffix was typed. */
export function exportedTldrawPath(path: string): string {
  const suffix = documentSuffix(path)
  return suffix === TLDRAW_SUFFIX
    ? path
    : `${suffix ? path.slice(0, -suffix.length) : path}${TLDRAW_SUFFIX}`
}

export function sameFingerprint(
  left: DocumentFingerprint | null,
  right: DocumentFingerprint | null,
): boolean {
  if (left === null || right === null) return left === right
  // WHY: a rapid same-length rewrite can preserve both mtime and byte count;
  // when both sides have an exact-byte digest, it is the authoritative identity.
  if (left.digest !== null && right.digest !== null) return left.digest === right.digest
  return Math.abs(left.mtime - right.mtime) <= 1e-6 && left.size === right.size
}

/** The next bounded retry delay; forced writes and digest conflicts always require a person. */
export function autosaveRetryDelay(
  failedAttempts: number,
  options: { conflict?: boolean; force?: boolean } = {},
): number | null {
  if (options.conflict || options.force) return null
  return AUTOSAVE_RETRY_DELAYS_MS[failedAttempts] ?? null
}

/**
 * Debounce nearby edits without allowing a continuous gesture to defer its
 * first save forever.
 *
 * WHY: draw.io 31.4.2 gives its local recovery draft both an idle delay and a
 * 30-second ceiling (DrawioFile.js L2216-L2238). Keeping the original start
 * time gives SystemSketch the same bounded-loss window while retaining its
 * shorter normal debounce. Retry backoff is intentionally handled separately.
 */
export function autosaveSchedule(
  now: number,
  pendingSince: number | null,
  debounceMs: number,
  maxDelayMs: number,
): AutosaveSchedule {
  const startedAt = pendingSince ?? now
  const remainingBeforeDeadline = Math.max(0, maxDelayMs - (now - startedAt))
  return {
    pendingSince: startedAt,
    delayMs: Math.min(debounceMs, remainingBeforeDeadline),
  }
}

/**
 * A clean external reload spans two requests (`stat`, then `read`). Refuse to
 * apply its result if the user edited, a save advanced the base revision, or a
 * newer disk revision replaced the one that caused the reload.
 */
export function canApplyExternalReload(input: {
  requestedChangeEpoch: number
  currentChangeEpoch: number
  requestedBaseDigest: string | null
  currentBaseDigest: string | null
  expectedDiskDigest: string | null
  loadedDiskDigest: string | null
  hasUnsavedEdits: boolean
  discardRequestedEdits: boolean
}): boolean {
  return input.requestedChangeEpoch === input.currentChangeEpoch
    && input.requestedBaseDigest === input.currentBaseDigest
    && (!input.hasUnsavedEdits || input.discardRequestedEdits)
    && (
      input.expectedDiskDigest === null
      || input.loadedDiskDigest === input.expectedDiskDigest
    )
}

export function nextSyncAction(input: {
  disk: DocumentFingerprint | null
  base: DocumentFingerprint | null
  hasUnsavedEdits: boolean
}): SyncAction {
  if (input.disk === null) return input.base === null ? { kind: 'idle' } : { kind: 'missing' }
  if (sameFingerprint(input.disk, input.base)) return { kind: 'idle' }
  return input.hasUnsavedEdits ? { kind: 'conflict' } : { kind: 'reload' }
}

export function readRecentDocumentPaths(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): string[] {
  try {
    const value = JSON.parse(storage.getItem(RECENT_DOCUMENTS_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.filter((path): path is string => typeof path === 'string')
      : []
  } catch {
    return []
  }
}

export function rememberDocumentPath(
  path: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
): string[] {
  const next = [path, ...readRecentDocumentPaths(storage).filter((candidate) => candidate !== path)]
    .slice(0, MAX_RECENT_DOCUMENTS)
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next))
  } catch {
    // Recents are convenience state; file persistence must remain independent.
  }
  return next
}

export function forgetDocumentPath(
  path: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
): string[] {
  const next = readRecentDocumentPaths(storage).filter((candidate) => candidate !== path)
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next))
  } catch {
    // A disabled/full localStorage does not change the disk operation.
  }
  return next
}

export function replaceRememberedDocumentPath(
  previousPath: string,
  nextPath: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
): string[] {
  const next = [
    nextPath,
    ...readRecentDocumentPaths(storage).filter(
      (candidate) => candidate !== previousPath && candidate !== nextPath,
    ),
  ].slice(0, MAX_RECENT_DOCUMENTS)
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next))
  } catch {
    // The successful disk rename is canonical even if recents cannot update.
  }
  return next
}

export function removesDocumentBoundary(entry: {
  changes: { removed: Record<string, { typeName: string }> }
}): boolean {
  return Object.values(entry.changes.removed).some((record) => record.typeName === 'document')
}

export const UNTITLED_CLAIMS_KEY = 'systemsketch.untitledClaims.v1'
export const UNTITLED_CLAIM_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Paths a window has reserved for an untitled board it has not written yet.
 *
 * Two windows opened seconds apart would otherwise both compute `Untitled 2`
 * — `nextUntitledDocumentPath` can only see what is already on disk, and a
 * brand-new board writes nothing until its first edit. A claim is a short-lived
 * local reservation, never a file, so a crashed window cannot leak a name.
 */
export function readUntitledClaims(
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): string[] {
  try {
    const value = JSON.parse(storage.getItem(UNTITLED_CLAIMS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value
      .filter((entry): entry is { path: string; at: number } =>
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as { path?: unknown }).path === 'string'
        && typeof (entry as { at?: unknown }).at === 'number')
      .filter((entry) => now - entry.at < UNTITLED_CLAIM_TTL_MS)
      .map((entry) => entry.path)
  } catch {
    return []
  }
}

export function claimUntitledPath(
  path: string,
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
): string[] {
  const kept = readUntitledClaims(now, storage).filter((candidate) => candidate !== path)
  const next = [...kept, path]
  try {
    storage.setItem(
      UNTITLED_CLAIMS_KEY,
      JSON.stringify(next.map((candidate) => ({ path: candidate, at: now }))),
    )
  } catch {
    // A reservation is a convenience; the digest fence still refuses a clash.
  }
  return next
}

export interface BrowserRow {
  kind: 'folder' | 'document'
  /** Which document type a row is, so the list can say so; null for a folder. */
  encoding: 'systemsketch' | 'tldraw' | null
  name: string
  title: string
  path: string
  mtime: number | null
}

export interface BrowserListingShape {
  directories: { name: string; path: string }[]
  documents: {
    name: string
    title: string
    path: string
    mtime: number
    kind?: 'systemsketch' | 'tldraw'
  }[]
}

/** Folders first, then documents, both already filtered by the search box. */
export function browserRows(
  listing: BrowserListingShape | null,
  query: string,
): BrowserRow[] {
  if (!listing) return []
  const needle = query.trim().toLowerCase()
  const matches = (value: string) => !needle || value.toLowerCase().includes(needle)
  return [
    ...listing.directories
      .filter((directory) => matches(directory.name))
      .map((directory): BrowserRow => ({
        kind: 'folder',
        encoding: null,
        name: directory.name,
        title: directory.name,
        path: directory.path,
        mtime: null,
      })),
    ...listing.documents
      .filter((document) => matches(document.title) || matches(document.name))
      .map((document): BrowserRow => ({
        kind: 'document',
        // The host reports the encoding; the suffix is the fallback, and the
        // two cannot disagree because the host derives its answer the same way.
        encoding: document.kind ?? documentEncoding(document.path),
        name: document.name,
        title: document.title,
        path: document.path,
        mtime: document.mtime,
      })),
  ]
}

/**
 * Which row should be selected once the visible set changes.
 *
 * Keeping a selection that a filter just hid would leave Enter pointing at a
 * document the user can no longer see, so a hidden selection falls back to the
 * first document — or the first folder, when the filter matched only folders.
 */
export function resolveBrowserSelection(
  rows: readonly BrowserRow[],
  selectedPath: string | null,
): string | null {
  if (selectedPath !== null && rows.some((row) => row.path === selectedPath)) return selectedPath
  const preferred = rows.find((row) => row.kind === 'document') ?? rows[0]
  return preferred?.path ?? null
}

/** Arrow-key movement over the visible rows, clamped at both ends. */
export function moveBrowserSelection(
  rows: readonly BrowserRow[],
  selectedPath: string | null,
  delta: number,
): string | null {
  if (!rows.length) return null
  const current = rows.findIndex((row) => row.path === selectedPath)
  if (current === -1) return delta > 0 ? rows[0].path : rows[rows.length - 1].path
  const next = Math.min(rows.length - 1, Math.max(0, current + delta))
  return rows[next].path
}

export interface BreadcrumbSegment {
  label: string
  path: string
}

/**
 * The clickable path from the workspace root down to the open folder.
 *
 * A folder outside the root cannot be reached through the API, so an unrelated
 * directory collapses to a single segment rather than pretending to be nested.
 */
export function breadcrumbTrail(directory: string, root: string): BreadcrumbSegment[] {
  const trimmedRoot = root.replace(/\/+$/, '')
  const rootLabel = trimmedRoot.split('/').pop() || '/'
  const rootSegment: BreadcrumbSegment = { label: rootLabel, path: trimmedRoot || '/' }
  if (directory === trimmedRoot || !trimmedRoot) return [rootSegment]
  if (!directory.startsWith(`${trimmedRoot}/`)) {
    return [{ label: directory.split('/').pop() || directory, path: directory }]
  }
  const rest = directory.slice(trimmedRoot.length + 1).split('/').filter(Boolean)
  let walked = trimmedRoot
  return [
    rootSegment,
    ...rest.map((segment) => {
      walked = `${walked}/${segment}`
      return { label: segment, path: walked }
    }),
  ]
}
