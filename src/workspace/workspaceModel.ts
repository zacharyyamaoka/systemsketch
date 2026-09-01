export const TLDRAW_SUFFIX = '.tldr'
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

export function documentTitle(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.toLowerCase().endsWith(TLDRAW_SUFFIX)
    ? name.slice(0, -TLDRAW_SUFFIX.length)
    : name
}

export function parentDirectory(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator <= 0 ? '/' : path.slice(0, separator)
}

export function documentPathFor(directory: string, rawName: string): string | null {
  const trimmed = rawName.trim().replace(/\.tldr$/i, '').trim()
  if (!trimmed) return null
  const safe = trimmed.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim()
  if (!safe) return null
  return `${directory.replace(/\/$/, '')}/${safe}${TLDRAW_SUFFIX}`
}

export function renamedDocumentPath(path: string, rawName: string): string | null {
  return documentPathFor(parentDirectory(path), rawName)
}

export function nextUntitledDocumentPath(
  directory: string,
  existingPaths: readonly string[],
): string {
  const occupied = new Set(existingPaths)
  for (let index = 1; ; index += 1) {
    const title = index === 1 ? 'Untitled' : `Untitled ${index}`
    const candidate = documentPathFor(directory, title)!
    if (!occupied.has(candidate)) return candidate
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
