/**
 * Reading and writing a document a host handed over, by its suffix alone.
 *
 * A `.systemsketch` file *is* a tldraw file — same `tldrawFileFormatVersion`,
 * `schema` and `records` — with one extra top-level `systemSketch` key written
 * in front of them. Reading strips that key and hands the remainder to
 * tldraw's own parser; a `.tldr` has no key to strip and so travels the
 * identical path untouched. That is the backwards compatibility: one reader,
 * not two.
 *
 * Everything here is a pure string → string transform. No tldraw import, no
 * editor, no DOM — so the VS Code extension host can share this module with
 * the canvas and both ends agree on the format by construction.
 *
 * SEAM: the local-workspace lane owns the same envelope for files it saves
 * through the Python host. When both lanes are on one branch this module
 * should re-export that one rather than restate it.
 */

export const SYSTEMSKETCH_ENVELOPE_KEY = 'systemSketch'
export const SYSTEMSKETCH_FORMAT_VERSION = 1
export const SYSTEMSKETCH_APPLICATION = 'SystemSketch'
export const SYSTEMSKETCH_SUFFIX = '.systemsketch'
export const TLDRAW_SUFFIX = '.tldr'
export const DOCUMENT_SUFFIXES = [SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX] as const

export type DocumentSuffix = (typeof DOCUMENT_SUFFIXES)[number]

/**
 * A plain inventory of what a document holds, not a claim about which types
 * are "ours": a reader can see four Blocks and three cables without loading a
 * store, and a future `.tldr` exporter knows what it has to detach.
 */
export interface SystemSketchManifest {
  formatVersion: number
  application: string
  shapes: Record<string, number>
  bindings: Record<string, number>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The document suffix `path` uses, or `null` if it is not one SystemSketch owns. */
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

export function documentTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  const suffix = documentSuffix(name)
  return suffix ? name.slice(0, -suffix.length) : name
}

function tally(records: unknown): {
  shapes: Record<string, number>
  bindings: Record<string, number>
} {
  const shapes: Record<string, number> = {}
  const bindings: Record<string, number> = {}
  if (!Array.isArray(records)) return { shapes, bindings }
  for (const record of records) {
    if (!isPlainObject(record)) continue
    const bucket = record.typeName === 'shape'
      ? shapes
      : record.typeName === 'binding'
        ? bindings
        : null
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
 * Strip the envelope, if there is one, and return tldraw's own file text.
 *
 * A document without the key comes back byte-identical, so a `.tldr` is never
 * re-serialized on the way in and nothing can be lost in a round trip nobody
 * asked for. Malformed JSON passes straight through, so tldraw reports the
 * parse error in its own words instead of this module inventing one.
 */
export function decodeDocumentText(source: string): string {
  if (!source.includes(`"${SYSTEMSKETCH_ENVELOPE_KEY}"`)) return source
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return source
  }
  if (!isPlainObject(parsed) || !(SYSTEMSKETCH_ENVELOPE_KEY in parsed)) return source
  const { [SYSTEMSKETCH_ENVELOPE_KEY]: _envelope, ...core } = parsed
  return JSON.stringify(core)
}

/**
 * Wrap portable tldraw JSON for `path`, and only if `path` asks for it.
 *
 * The envelope is written first so the file's first bytes identify it, and
 * re-encoding an already-wrapped document replaces the envelope rather than
 * nesting a second one.
 */
export function encodeDocumentText(path: string, tldrawJson: string): string {
  if (documentEncoding(path) !== 'systemsketch') return tldrawJson
  const parsed: unknown = JSON.parse(tldrawJson)
  if (!isPlainObject(parsed)) throw new Error('a SystemSketch document must be a JSON object')
  const { [SYSTEMSKETCH_ENVELOPE_KEY]: _replaced, ...core } = parsed
  return JSON.stringify({
    [SYSTEMSKETCH_ENVELOPE_KEY]: systemSketchManifest(core.records),
    ...core,
  })
}

/**
 * Whether a host handed us a document with nothing in it yet.
 *
 * A brand-new golden target is a zero-byte file, and an empty file is not a
 * parse failure — it is a blank board waiting to be drawn on. Treating it as
 * an error is the difference between "click the target and start drawing" and
 * a quarantine screen on every new case.
 */
export function isBlankDocument(source: string): boolean {
  return source.trim().length === 0
}
