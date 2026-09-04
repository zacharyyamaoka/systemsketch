import { parseTldrawJsonFile, type Editor } from 'tldraw'
import {
  decodeSystemSketchDocument,
  SYSTEMSKETCH_FORMAT_VERSION,
} from './systemSketchFile'
import { parseLegacyPyblocksSystemSketch } from '../import/legacyPyblocksSystemSketch'
import { normalizeStockBlockSnapshot } from '../blocks/stockBlocks'

/**
 * Inspect workspace bytes before they are allowed anywhere near persistence.
 *
 * A zero-byte file is the intentional blank-document representation used by
 * the IDE hosts. Every non-blank file still goes through tldraw's own parser;
 * a refusal is a quarantine decision, never permission to replace the bytes
 * with the editor's fallback canvas.
 */
export function inspectWorkspaceDocumentSource(
  source: string,
  schema: Editor['store']['schema'],
) {
  if (source.trim().length === 0) return { kind: 'blank' } as const

  const { core, manifest } = decodeSystemSketchDocument(source)
  const legacy = parseLegacyPyblocksSystemSketch(core)
  if (legacy) return { kind: 'legacy-pyblocks', document: legacy } as const
  const parsed = parseTldrawJsonFile({ json: core, schema })
  if (!parsed.ok) {
    return {
      kind: 'quarantined',
      message: `tldraw could not read this document (${parsed.error.type})`,
    } as const
  }

  if (manifest && manifest.formatVersion > SYSTEMSKETCH_FORMAT_VERSION) {
    return {
      kind: 'future',
      formatVersion: manifest.formatVersion,
      supportedVersion: SYSTEMSKETCH_FORMAT_VERSION,
      message: `This file uses SystemSketch format version ${manifest.formatVersion}, but this build supports version ${SYSTEMSKETCH_FORMAT_VERSION}.`,
      snapshot: parsed.value.getStoreSnapshot(),
    } as const
  }

  return { kind: 'ready', snapshot: normalizeStockBlockSnapshot(parsed.value.getStoreSnapshot()) } as const
}
