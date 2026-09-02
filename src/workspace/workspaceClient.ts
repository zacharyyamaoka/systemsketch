/** Which on-disk encoding a listed document uses. The Python host derives it from the suffix. */
export type WorkspaceDocumentKind = 'systemsketch' | 'tldraw'

export interface WorkspaceDocumentEntry {
  name: string
  title: string
  path: string
  kind: WorkspaceDocumentKind
  mtime: number
  size: number
}

export interface WorkspaceListing {
  dir: string
  exists: boolean
  parent: string | null
  root: string
  /** The document a clean launch opens: an existing `Untitled`, else a new `.systemsketch` one. */
  defaultDocument: string
  directories: { name: string; path: string }[]
  documents: WorkspaceDocumentEntry[]
}

export interface WorkspaceDocument {
  path: string
  source: string | null
  title?: string
  digest?: string
  mtime?: number
  size?: number
}

export interface WorkspaceDocumentStat {
  path: string
  mtime: number | null
  size?: number
}

export interface WorkspaceDocumentSaved {
  path: string
  title: string
  digest: string
  mtime: number
  size: number
}

export interface WorkspaceDirectoryCreated {
  name: string
  path: string
}

export class WorkspaceConflict extends Error {
  readonly diskMtime: number | null
  readonly diskDigest: string | null

  constructor(message: string, diskMtime: number | null, diskDigest: string | null) {
    super(message)
    this.name = 'WorkspaceConflict'
    this.diskMtime = diskMtime
    this.diskDigest = diskDigest
  }
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`the local SystemSketch controller returned non-JSON (${response.status})`)
  }
}

async function expectOk(response: Response): Promise<Record<string, unknown>> {
  const payload = await responsePayload(response)
  if (response.status === 409 && payload.conflict === true) {
    throw new WorkspaceConflict(
      typeof payload.error === 'string' ? payload.error : 'the document changed on disk',
      typeof payload.mtime === 'number' ? payload.mtime : null,
      typeof payload.digest === 'string' ? payload.digest : null,
    )
  }
  if (!response.ok || typeof payload.error === 'string') {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : `request failed (${response.status})`,
    )
  }
  return payload
}

export async function listWorkspace(dir?: string): Promise<WorkspaceListing> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : ''
  return (await expectOk(await fetch(`/api/workspace/list${query}`))) as unknown as WorkspaceListing
}

export async function readWorkspaceDocument(path: string): Promise<WorkspaceDocument> {
  return (await expectOk(
    await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`),
  )) as unknown as WorkspaceDocument
}

export async function statWorkspaceDocument(path: string): Promise<WorkspaceDocumentStat> {
  return (await expectOk(
    await fetch(`/api/workspace/stat?path=${encodeURIComponent(path)}`),
  )) as unknown as WorkspaceDocumentStat
}

async function post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return expectOk(
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}

function workspaceWritePayload(input: {
  path: string
  source: string
  baseDigest: string | null
  force?: boolean
}): Record<string, unknown> {
  return {
    path: input.path,
    source: input.source,
    baseDigest: input.baseDigest,
    force: input.force === true,
  }
}

export async function writeWorkspaceDocument(input: {
  path: string
  source: string
  baseDigest: string | null
  force?: boolean
}): Promise<WorkspaceDocumentSaved> {
  return (await post('/api/workspace/file', workspaceWritePayload(input))) as unknown as WorkspaceDocumentSaved
}

export async function createWorkspaceDirectory(
  parent: string,
  name: string,
): Promise<WorkspaceDirectoryCreated> {
  return (await post('/api/workspace/directory', { parent, name })) as unknown as WorkspaceDirectoryCreated
}

/**
 * Best-effort final write after the page has committed to leaving.
 *
 * The ordinary save path remains authoritative while the page is alive. This
 * deliberately uses fetch's keepalive flag and does not wait for a response,
 * because pagehide gives the client no remaining UI in which to resolve a
 * conflict. The same digest fence still makes the server refuse clobbering an
 * external edit.
 */
export function flushWorkspaceDocument(input: {
  path: string
  source: string
  baseDigest: string | null
  force?: boolean
}): Promise<Response> {
  return fetch('/api/workspace/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspaceWritePayload(input)),
    keepalive: true,
  })
}

export async function renameWorkspaceDocument(input: {
  path: string
  destination: string
  baseDigest: string
}): Promise<WorkspaceDocumentSaved> {
  return (await post('/api/workspace/rename', input)) as unknown as WorkspaceDocumentSaved
}

export async function trashWorkspaceDocument(input: {
  path: string
  baseDigest: string
}): Promise<void> {
  await post('/api/workspace/trash', input)
}

export async function revealWorkspaceDocument(path: string): Promise<void> {
  await post('/api/workspace/reveal', { path })
}
