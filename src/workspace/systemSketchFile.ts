/**
 * The `.systemsketch` document envelope.
 *
 * A `.systemsketch` file *is* a tldraw file — the same `tldrawFileFormatVersion`,
 * `schema`, and `records` — with one extra top-level `systemSketch` key written
 * in front of them. That single key is the whole difference between the two
 * document types, and it is deliberately load-bearing in both directions:
 *
 * - SystemSketch reads it, strips it, and hands the remainder to tldraw's own
 *   `parseTldrawJsonFile`. A plain `.tldr` has no key to strip, so it travels
 *   the identical path with nothing removed — that is the backwards
 *   compatibility, not a second reader.
 * - tldraw's file validator is `T.object(...)` *without* `allowUnknownProperties`
 *   at the top level, so tldraw.com declines a `.systemsketch` outright rather
 *   than half-loading a board whose Block and connection shapes it has no utils
 *   for. The refusal is honest and early instead of a migration failure.
 *
 * Everything here is a pure string → string transform: no tldraw import, no
 * editor, no DOM. The same rules are enforced independently by the Python host
 * in `scripts/workspace_store.py`.
 */

export const SYSTEMSKETCH_ENVELOPE_KEY = 'systemSketch'
export const SYSTEMSKETCH_FORMAT_VERSION = 1
export const SYSTEMSKETCH_APPLICATION = 'SystemSketch'

/**
 * What the envelope records. The counts are a plain inventory of the document,
 * not a judgement about which types are "ours" — so a reader can see what a
 * file holds (four Blocks, three cables) without loading the store, and a
 * future `.tldr` exporter knows exactly what it has to detach.
 */
export interface SystemSketchManifest {
  formatVersion: number
  application: string
  shapes: Record<string, number>
  bindings: Record<string, number>
}

export interface DecodedDocument {
  /** Portable tldraw JSON, ready for `parseTldrawJsonFile`. */
  core: string
  /** The envelope this document carried, or `null` for a plain `.tldr`. */
  manifest: SystemSketchManifest | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tally(records: unknown): { shapes: Record<string, number>; bindings: Record<string, number> } {
  const shapes: Record<string, number> = {}
  const bindings: Record<string, number> = {}
  if (!Array.isArray(records)) return { shapes, bindings }
  for (const record of records) {
    if (!isPlainObject(record)) continue
    const bucket = record.typeName === 'shape' ? shapes : record.typeName === 'binding' ? bindings : null
    if (!bucket) continue
    const type = typeof record.type === 'string' ? record.type : 'unknown'
    bucket[type] = (bucket[type] ?? 0) + 1
  }
  return { shapes, bindings }
}

export function systemSketchManifest(records: unknown): SystemSketchManifest {
  const { shapes, bindings } = tally(records)
  return {
    formatVersion: SYSTEMSKETCH_FORMAT_VERSION,
    application: SYSTEMSKETCH_APPLICATION,
    shapes,
    bindings,
  }
}

/**
 * Wrap portable tldraw JSON as a `.systemsketch` document.
 *
 * The envelope is written first so the first bytes of the file identify it, and
 * re-encoding an already-wrapped document replaces the envelope rather than
 * nesting a second one.
 */
export function encodeSystemSketchDocument(tldrawJson: string): string {
  const parsed: unknown = JSON.parse(tldrawJson)
  if (!isPlainObject(parsed)) throw new Error('a SystemSketch document must be a JSON object')
  const { [SYSTEMSKETCH_ENVELOPE_KEY]: _replaced, ...core } = parsed
  return JSON.stringify({ [SYSTEMSKETCH_ENVELOPE_KEY]: systemSketchManifest(core.records), ...core })
}

function readManifest(value: unknown): SystemSketchManifest | null {
  if (!isPlainObject(value)) return null
  const { shapes, bindings } = value
  return {
    formatVersion: typeof value.formatVersion === 'number' ? value.formatVersion : 0,
    application: typeof value.application === 'string' ? value.application : SYSTEMSKETCH_APPLICATION,
    shapes: isPlainObject(shapes) ? (shapes as Record<string, number>) : {},
    bindings: isPlainObject(bindings) ? (bindings as Record<string, number>) : {},
  }
}

/**
 * Strip the envelope, if there is one, and return tldraw's own file text.
 *
 * A document without the key comes back byte-identical: a `.tldr` is never
 * re-serialized on the way in, so nothing can be lost in a round trip that
 * SystemSketch did not intend to make. Malformed JSON is passed straight
 * through so tldraw reports the parse error in its own words.
 */
export function decodeSystemSketchDocument(source: string): DecodedDocument {
  if (!source.includes(`"${SYSTEMSKETCH_ENVELOPE_KEY}"`)) return { core: source, manifest: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { core: source, manifest: null }
  }
  if (!isPlainObject(parsed) || !(SYSTEMSKETCH_ENVELOPE_KEY in parsed)) {
    return { core: source, manifest: null }
  }
  const { [SYSTEMSKETCH_ENVELOPE_KEY]: envelope, ...core } = parsed
  return { core: JSON.stringify(core), manifest: readManifest(envelope) }
}

/** Whether a document's text already carries a top-level SystemSketch envelope. */
export function hasSystemSketchEnvelope(source: string): boolean {
  return decodeSystemSketchDocument(source).manifest !== null
}
