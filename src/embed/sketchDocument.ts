/**
 * Reading and writing a document a host handed over, by its suffix alone.
 *
 * The rules themselves live in the workspace lane — `systemSketchFile.ts` owns
 * the envelope, `workspaceModel.ts` owns what each suffix means. This module
 * exists to say, in one place, exactly which of those an embedded editor uses,
 * and to add the things a host needs that a workspace does not:
 *
 * - `decodeDocumentText`, because a host hands over *text* rather than the
 *   `{core, manifest}` pair the workspace lane wants;
 * - `isBlankDocument`, because a freshly seeded golden target is a zero-byte
 *   file, and an empty file is a blank board rather than a parse failure.
 *   Getting that wrong is the difference between "click the target and start
 *   drawing" and a quarantine screen on every new case.
 * - `newerDocumentVersion`, because an older embedded build must never
 *   downgrade a newer envelope just because its tldraw core still parses.
 *
 * Everything reachable from here stays pure — no tldraw, no React, no DOM — so
 * the VS Code extension host can share it with the canvas and both ends agree
 * on the format by construction rather than by two implementations agreeing.
 */

import {
  decodeSystemSketchDocument,
  SYSTEMSKETCH_FORMAT_VERSION,
} from '../workspace/systemSketchFile'
import {
  documentSuffix,
  encodeDocumentForPath,
  SYSTEMSKETCH_SUFFIX,
} from '../workspace/workspaceModel'

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

/**
 * Explicitly downgrade only the wrapper of a readable future document.
 *
 * The source is never mutated. Unknown future envelope metadata is omitted
 * from the new current-format copy, while the stock tldraw core is retained.
 */
export function createCompatibilityCopyText(destinationPath: string, source: string): string {
  return encodeDocumentText(destinationPath, decodeDocumentText(source))
}

export interface NewerDocumentVersion {
  readOnly: true
  formatVersion: number
  supportedVersion: number
  message: string
}

/**
 * Refuse write access when a `.systemsketch` envelope came from a newer app.
 *
 * The core may still be useful enough to display, but re-serializing it with
 * this build would replace its newer envelope with version 1 and could erase
 * metadata this build does not understand. The suffix remains authoritative:
 * a `.tldr` is not reclassified by arbitrary JSON inside it.
 */
export function newerDocumentVersion(
  path: string,
  source: string,
): NewerDocumentVersion | null {
  if (documentSuffix(path) !== SYSTEMSKETCH_SUFFIX) return null
  const manifest = decodeSystemSketchDocument(source).manifest
  if (manifest === null || manifest.formatVersion <= SYSTEMSKETCH_FORMAT_VERSION) return null
  return {
    readOnly: true,
    formatVersion: manifest.formatVersion,
    supportedVersion: SYSTEMSKETCH_FORMAT_VERSION,
    message: `This file uses SystemSketch format version ${manifest.formatVersion}, but this build supports version ${SYSTEMSKETCH_FORMAT_VERSION}. It is open read-only to prevent data loss.`,
  }
}

/** Whether a host handed us a document with nothing in it yet. */
export function isBlankDocument(source: string): boolean {
  return source.trim().length === 0
}
