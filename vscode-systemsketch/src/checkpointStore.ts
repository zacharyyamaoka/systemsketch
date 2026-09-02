import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface StoredCanvasCheckpoint {
  sourceUri: string
  sourceHash: string
  session: string
  revision: number
  snapshot: unknown
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function isStoredCanvasCheckpoint(value: unknown): value is StoredCanvasCheckpoint {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StoredCanvasCheckpoint>
  return typeof candidate.sourceUri === 'string'
    && typeof candidate.sourceHash === 'string'
    && typeof candidate.session === 'string'
    && Number.isSafeInteger(candidate.revision)
    && (candidate.revision ?? -1) >= 0
    && 'snapshot' in candidate
}

/**
 * Persistent, opaque recovery for the interval before tldraw serialization.
 *
 * The extension never interprets or converts a snapshot. It stores the value
 * returned by stock `Editor.getSnapshot()` and gives it back to stock
 * `loadSnapshot()` only when the source bytes still match. One file per URI
 * lives under VS Code's extension-owned global storage, outside the workspace.
 */
export class CanvasCheckpointStore {
  private readonly storageRoot: string

  constructor(storageRoot: string) {
    this.storageRoot = storageRoot
  }

  adopt(sourceUri: string, sourceText: string, session: string): StoredCanvasCheckpoint | null {
    const stored = this.readRaw(sourceUri)
    if (!stored) return null
    if (stored.sourceHash !== textHash(sourceText)) {
      this.clear(sourceUri)
      return null
    }
    const adopted = { ...stored, session, revision: 0 }
    this.writeRaw(adopted)
    return adopted
  }

  save(
    sourceUri: string,
    sourceText: string,
    session: string,
    revision: number,
    snapshot: unknown,
  ): void {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('Invalid SystemSketch checkpoint revision')
    }
    const current = this.readRaw(sourceUri)
    if (current?.session === session && current.revision > revision) return
    this.writeRaw({
      sourceUri,
      sourceHash: textHash(sourceText),
      session,
      revision,
      snapshot,
    })
  }

  /**
   * Remove a checkpoint covered by serialized text. If a newer checkpoint
   * arrived while that text was being applied, rebase it onto the new source
   * bytes so it remains recoverable instead.
   */
  settle(sourceUri: string, session: string, revision: number, nextSourceText: string): void {
    const current = this.readRaw(sourceUri)
    if (!current || current.session !== session) return
    if (current.revision <= revision) {
      this.clear(sourceUri)
      return
    }
    this.writeRaw({ ...current, sourceHash: textHash(nextSourceText) })
  }

  clear(sourceUri: string, session?: string): void {
    if (session !== undefined && this.readRaw(sourceUri)?.session !== session) return
    rmSync(this.pathFor(sourceUri), { force: true })
  }

  private pathFor(sourceUri: string): string {
    const key = createHash('sha256').update(sourceUri).digest('hex')
    return join(this.storageRoot, 'canvas-checkpoints', `${key}.json`)
  }

  private readRaw(sourceUri: string): StoredCanvasCheckpoint | null {
    const path = this.pathFor(sourceUri)
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
      if (isStoredCanvasCheckpoint(parsed) && parsed.sourceUri === sourceUri) return parsed
    } catch {
      rmSync(path, { force: true })
      return null
    }
    rmSync(path, { force: true })
    return null
  }

  private writeRaw(checkpoint: StoredCanvasCheckpoint): void {
    const path = this.pathFor(checkpoint.sourceUri)
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify(checkpoint), { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, path)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
}
