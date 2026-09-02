/**
 * Reading and writing a document a host handed over, by its suffix alone.
 *
 * The rules themselves live in the workspace lane — `systemSketchFile.ts` owns
 * the envelope, `workspaceModel.ts` owns what each suffix means. This module
 * exists to say, in one place, exactly which of those an embedded editor uses,
 * and to add the two things a host needs that a workspace does not:
 *
 * - `decodeDocumentText`, because a host hands over *text* rather than the
 *   `{core, manifest}` pair the workspace lane wants;
 * - `isBlankDocument`, because a freshly seeded golden target is a zero-byte
 *   file, and an empty file is a blank board rather than a parse failure.
 *   Getting that wrong is the difference between "click the target and start
 *   drawing" and a quarantine screen on every new case.
 *
 * Everything reachable from here stays pure — no tldraw, no React, no DOM — so
 * the VS Code extension host can share it with the canvas and both ends agree
 * on the format by construction rather than by two implementations agreeing.
 */

import { decodeSystemSketchDocument } from '../workspace/systemSketchFile'
import { encodeDocumentForPath } from '../workspace/workspaceModel'

export {
  SYSTEMSKETCH_APPLICATION,
  SYSTEMSKETCH_ENVELOPE_KEY,
  SYSTEMSKETCH_FORMAT_VERSION,
  systemSketchManifest,
  type SystemSketchManifest,
} from '../workspace/systemSketchFile'
export {
  DOCUMENT_SUFFIXES,
  SYSTEMSKETCH_SUFFIX,
  TLDRAW_SUFFIX,
  documentEncoding,
  documentSuffix,
  documentTitle,
  type DocumentSuffix,
} from '../workspace/workspaceModel'

/**
 * Strip the envelope, if there is one, and return tldraw's own file text.
 *
 * A document without the key comes back byte-identical, so a `.tldr` is never
 * re-serialized on the way in and nothing can be lost in a round trip nobody
 * asked for. Malformed JSON passes straight through, so tldraw reports the
 * parse error in its own words instead of this module inventing one.
 */
export function decodeDocumentText(source: string): string {
  return decodeSystemSketchDocument(source).core
}

/** Wrap serialized tldraw JSON for `path`, and only if `path` asks for it. */
export function encodeDocumentText(path: string, tldrawJson: string): string {
  return encodeDocumentForPath(path, tldrawJson)
}

/** Whether a host handed us a document with nothing in it yet. */
export function isBlankDocument(source: string): boolean {
  return source.trim().length === 0
}
