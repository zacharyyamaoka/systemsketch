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
}

export type SyncAction =
  | { kind: 'idle' }
  | { kind: 'reload' }
  | { kind: 'conflict' }
  | { kind: 'missing' }

/** The document extension `path` uses, or `null` if it is not a SystemSketch document. */
export function documentSuffix(path: string): DocumentSuffix | null {
  const name = (path.split('/').pop() ?? path).toLowerCase()
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
  const name = path.split('/').pop() ?? path
  const suffix = documentSuffix(name)
  return suffix ? name.slice(0, -suffix.length) : name
}

export function parentDirectory(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
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

export function sameFingerprint(
  left: DocumentFingerprint | null,
  right: DocumentFingerprint | null,
): boolean {
  if (left === null || right === null) return left === right
  return Math.abs(left.mtime - right.mtime) <= 1e-6 && left.size === right.size
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
