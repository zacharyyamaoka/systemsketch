import { describe, expect, it } from 'vitest'
import {
  decodeDocumentText,
  documentEncoding,
  documentSuffix,
  documentTitle,
  encodeDocumentText,
  isBlankDocument,
  systemSketchManifest,
  SYSTEMSKETCH_ENVELOPE_KEY,
} from './sketchDocument'

const TLDRAW_FILE = JSON.stringify({
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2 },
  records: [
    { typeName: 'shape', type: 'block', id: 'shape:a' },
    { typeName: 'shape', type: 'block', id: 'shape:b' },
    { typeName: 'shape', type: 'geo', id: 'shape:c' },
    { typeName: 'binding', type: 'connection', id: 'binding:a' },
    { typeName: 'document', id: 'document:document' },
  ],
})

describe('the suffix, and only the suffix, decides the encoding', () => {
  it('recognises both document types by name', () => {
    expect(documentSuffix('/tmp/board.systemsketch')).toBe('.systemsketch')
    expect(documentSuffix('/tmp/board.tldr')).toBe('.tldr')
    expect(documentSuffix('/tmp/board.json')).toBeNull()
    expect(documentSuffix('/tmp/.systemsketch')).toBeNull()
  })

  it('reads a Windows path the same way', () => {
    expect(documentSuffix('C:\\goldens\\01\\target.systemsketch')).toBe('.systemsketch')
    expect(documentTitle('C:\\goldens\\01\\target.systemsketch')).toBe('target')
  })

  it('maps each suffix to its encoding', () => {
    expect(documentEncoding('/x/target.systemsketch')).toBe('systemsketch')
    expect(documentEncoding('/x/target.tldr')).toBe('tldraw')
  })

  it('strips only its own suffix from a title', () => {
    expect(documentTitle('/goldens/01_linear_chain/target.systemsketch')).toBe('target')
    expect(documentTitle('/goldens/01_linear_chain/target.tldr')).toBe('target')
    expect(documentTitle('/goldens/notes.md')).toBe('notes.md')
  })
})

describe('the envelope is one key, added and removed', () => {
  it('wraps a .systemsketch document with an inventory of what it holds', () => {
    const encoded = encodeDocumentText('/x/target.systemsketch', TLDRAW_FILE)
    const parsed = JSON.parse(encoded)
    expect(Object.keys(parsed)[0]).toBe(SYSTEMSKETCH_ENVELOPE_KEY)
    expect(parsed[SYSTEMSKETCH_ENVELOPE_KEY]).toEqual({
      formatVersion: 1,
      application: 'SystemSketch',
      shapes: { block: 2, geo: 1 },
      bindings: { connection: 1 },
    })
    expect(parsed.records).toHaveLength(5)
  })

  it('leaves a .tldr document exactly as tldraw wrote it', () => {
    expect(encodeDocumentText('/x/board.tldr', TLDRAW_FILE)).toBe(TLDRAW_FILE)
  })

  it('round-trips back to tldraw-readable JSON', () => {
    const encoded = encodeDocumentText('/x/target.systemsketch', TLDRAW_FILE)
    expect(JSON.parse(decodeDocumentText(encoded))).toEqual(JSON.parse(TLDRAW_FILE))
  })

  it('replaces an existing envelope instead of nesting a second one', () => {
    const once = encodeDocumentText('/x/target.systemsketch', TLDRAW_FILE)
    const twice = encodeDocumentText('/x/target.systemsketch', once)
    expect(JSON.parse(twice)[SYSTEMSKETCH_ENVELOPE_KEY].shapes).toEqual({ block: 2, geo: 1 })
    expect(JSON.parse(decodeDocumentText(twice))).toEqual(JSON.parse(TLDRAW_FILE))
  })

  it('returns a plain .tldr byte-identical, because there is nothing to strip', () => {
    expect(decodeDocumentText(TLDRAW_FILE)).toBe(TLDRAW_FILE)
  })

  it('passes malformed JSON through so tldraw reports the parse error', () => {
    expect(decodeDocumentText('{"systemSketch": broken')).toBe('{"systemSketch": broken')
  })

  it('does not mistake a nested key for the envelope', () => {
    const nested = JSON.stringify({ records: [{ meta: { systemSketch: 1 } }] })
    expect(decodeDocumentText(nested)).toBe(nested)
  })

  it('counts nothing when a document has no records yet', () => {
    expect(systemSketchManifest(undefined)).toEqual({
      formatVersion: 1,
      application: 'SystemSketch',
      shapes: {},
      bindings: {},
    })
  })
})

describe('a blank target is a blank board, not a broken file', () => {
  it('treats an empty or whitespace-only document as blank', () => {
    expect(isBlankDocument('')).toBe(true)
    expect(isBlankDocument('\n  \t')).toBe(true)
  })

  it('does not treat a real document as blank', () => {
    expect(isBlankDocument(TLDRAW_FILE)).toBe(false)
  })
})
