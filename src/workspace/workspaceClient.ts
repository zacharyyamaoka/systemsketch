import { emitRecorderDiagnostic } from '../recorder/recorderEvents'

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
  digest?: string
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

export interface WorkspaceRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export class WorkspaceRequestTimeout extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`The local SystemSketch controller did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`)
    this.name = 'WorkspaceRequestTimeout'
    this.timeoutMs = timeoutMs
  }
}

export class WorkspaceRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'WorkspaceRequestError'
    this.status = status
  }
}

export class WorkspaceTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceTransportError'
  }
}

/** Only transport failures and explicitly transient HTTP responses should retry. */
export function isRetryableWorkspaceFailure(cause: unknown): boolean {
  if (cause instanceof WorkspaceRequestTimeout || cause instanceof WorkspaceTransportError) return true
  return cause instanceof WorkspaceRequestError
    && (cause.status === 408 || cause.status === 429 || cause.status >= 500)
}

const METADATA_TIMEOUT_MS = 10_000
const READ_TIMEOUT_MS = 30_000
const WRITE_TIMEOUT_MS = 45_000

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new WorkspaceRequestError(
      `the local SystemSketch controller returned non-JSON (${response.status})`,
      response.status,
    )
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
    throw new WorkspaceRequestError(
      typeof payload.error === 'string' ? payload.error : `request failed (${response.status})`,
      response.status,
    )
  }
  return payload
}

async function requestPayload(
  path: string,
  init: RequestInit,
  options: WorkspaceRequestOptions,
  defaultTimeoutMs: number,
): Promise<Record<string, unknown>> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs)
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await expectOk(await fetch(path, { ...init, signal: controller.signal }))
  } catch (cause) {
    if (timedOut) throw new WorkspaceRequestTimeout(timeoutMs)
    // `fetch` uses TypeError for network failures. Wrap it here so a TypeError
    // from document serialization elsewhere in the save pipeline is never
    // mistaken for a retryable transport problem.
    if (cause instanceof TypeError) throw new WorkspaceTransportError(cause.message)
    throw cause
  } finally {
    globalThis.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

async function traceWorkspace<T>(
  name: string,
  summary: string,
  detail: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now()
  emitRecorderDiagnostic({
    lane: 'workspace', name, summary: `${summary} started`, detail: { ...detail, phase: 'start' },
  })
  try {
    const result = await run()
    emitRecorderDiagnostic({
      lane: 'workspace', name, summary: `${summary} completed`,
      detail: { ...detail, phase: 'complete', durationMs: +(performance.now() - started).toFixed(1) },
    })
    return result
  } catch (cause) {
    emitRecorderDiagnostic({
      lane: 'workspace', name, summary: `${summary} failed`, level: 'error',
      detail: {
        ...detail,
        phase: cause instanceof WorkspaceConflict ? 'conflict' : 'error',
        durationMs: +(performance.now() - started).toFixed(1),
        error: cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : String(cause),
        diskMtime: cause instanceof WorkspaceConflict ? cause.diskMtime : undefined,
        diskDigest: cause instanceof WorkspaceConflict ? cause.diskDigest : undefined,
      },
    })
    throw cause
  }
}

export async function listWorkspace(
  dir?: string,
  options: WorkspaceRequestOptions = {},
): Promise<WorkspaceListing> {
  const query = dir ? `?dir=${encodeURIComponent(dir)}` : ''
  return traceWorkspace('list', 'workspace listing', { dir: dir ?? null }, async () => (
    (await requestPayload(`/api/workspace/list${query}`, {}, options, METADATA_TIMEOUT_MS)) as unknown as WorkspaceListing
  ))
}

export async function readWorkspaceDocument(
  path: string,
  options: WorkspaceRequestOptions = {},
): Promise<WorkspaceDocument> {
  return traceWorkspace('read', 'board read', { path }, async () => (
    (await requestPayload(
      `/api/workspace/file?path=${encodeURIComponent(path)}`,
      {},
      options,
      READ_TIMEOUT_MS,
    )) as unknown as WorkspaceDocument
  ))
}

export async function statWorkspaceDocument(
  path: string,
  options: WorkspaceRequestOptions = {},
): Promise<WorkspaceDocumentStat> {
  return traceWorkspace('stat', 'board revision check', { path }, async () => (
    (await requestPayload(
      `/api/workspace/stat?path=${encodeURIComponent(path)}`,
      {},
      options,
      METADATA_TIMEOUT_MS,
    )) as unknown as WorkspaceDocumentStat
  ))
}

async function post(
  path: string,
  payload: Record<string, unknown>,
  options: WorkspaceRequestOptions = {},
): Promise<Record<string, unknown>> {
  return requestPayload(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    options,
    WRITE_TIMEOUT_MS,
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
}, options: WorkspaceRequestOptions = {}): Promise<WorkspaceDocumentSaved> {
  return traceWorkspace('write', 'board save', {
    path: input.path,
    baseDigest: input.baseDigest,
    force: input.force === true,
    sourceBytes: new TextEncoder().encode(input.source).length,
  }, async () => (
    (await post('/api/workspace/file', workspaceWritePayload(input), options)) as unknown as WorkspaceDocumentSaved
  ))
}

export async function createWorkspaceDirectory(
  parent: string,
  name: string,
  options: WorkspaceRequestOptions = {},
): Promise<WorkspaceDirectoryCreated> {
  return traceWorkspace('mkdir', 'folder creation', { parent, name }, async () => (
    (await post('/api/workspace/directory', { parent, name }, options)) as unknown as WorkspaceDirectoryCreated
  ))
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
  emitRecorderDiagnostic({
    lane: 'workspace', name: 'final-flush', summary: 'final board flush requested',
    detail: {
      path: input.path,
      baseDigest: input.baseDigest,
      force: input.force === true,
      sourceBytes: new TextEncoder().encode(input.source).length,
      phase: 'requested',
    },
  })
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
}, options: WorkspaceRequestOptions = {}): Promise<WorkspaceDocumentSaved> {
  return traceWorkspace('rename', 'board rename', input, async () => (
    (await post('/api/workspace/rename', input, options)) as unknown as WorkspaceDocumentSaved
  ))
}

export async function trashWorkspaceDocument(input: {
  path: string
  baseDigest: string
}, options: WorkspaceRequestOptions = {}): Promise<void> {
  await traceWorkspace('trash', 'board trash', input, async () => { await post('/api/workspace/trash', input, options) })
}

export async function revealWorkspaceDocument(
  path: string,
  options: WorkspaceRequestOptions = {},
): Promise<void> {
  await traceWorkspace('reveal', 'board reveal', { path }, async () => { await post('/api/workspace/reveal', { path }, options) })
}
