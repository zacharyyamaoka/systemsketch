import { describe, expect, it } from 'vitest'
import { createTLSchema, parseTldrawJsonFile } from 'tldraw'
import {
  SYSTEMSKETCH_FORMAT_VERSION,
  decodeSystemSketchDocument,
  encodeSystemSketchDocument,
  hasSystemSketchEnvelope,
} from './systemSketchFile'

const TLDRAW_FILE = JSON.stringify({
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: { com: 1 } },
  records: [
    { id: 'document:document', typeName: 'document' },
    { id: 'shape:one', typeName: 'shape', type: 'block' },
    { id: 'shape:two', typeName: 'shape', type: 'geo' },
    { id: 'binding:one', typeName: 'binding', type: 'connection' },
  ],
})

describe('the .systemsketch envelope', () => {
  it('round-trips a document back to the exact tldraw file it wrapped', () => {
    const encoded = encodeSystemSketchDocument(TLDRAW_FILE)
    const { core, manifest } = decodeSystemSketchDocument(encoded)

    expect(JSON.parse(core)).toEqual(JSON.parse(TLDRAW_FILE))
    expect(manifest).toEqual({
      formatVersion: SYSTEMSKETCH_FORMAT_VERSION,
      application: 'SystemSketch',
      shapes: { block: 1, geo: 1 },
      bindings: { connection: 1 },
    })
  })

  it('identifies itself in the first bytes of the file', () => {
    expect(encodeSystemSketchDocument(TLDRAW_FILE).startsWith('{"systemSketch":')).toBe(true)
  })

  it('leaves a plain .tldr byte-identical, so opening one loses nothing', () => {
    const decoded = decodeSystemSketchDocument(TLDRAW_FILE)
    expect(decoded.core).toBe(TLDRAW_FILE)
    expect(decoded.manifest).toBe(null)
    expect(hasSystemSketchEnvelope(TLDRAW_FILE)).toBe(false)
  })

  it('does not mistake the envelope name inside a shape for the envelope', () => {
    const withText = JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: { schemaVersion: 2, sequences: {} },
      records: [{ id: 'shape:t', typeName: 'shape', type: 'text', props: { text: '"systemSketch"' } }],
    })
    const decoded = decodeSystemSketchDocument(withText)
    expect(decoded.core).toBe(withText)
    expect(decoded.manifest).toBe(null)
  })

  it('replaces an existing envelope rather than nesting a second one', () => {
    const twice = encodeSystemSketchDocument(encodeSystemSketchDocument(TLDRAW_FILE))
    expect(twice).toBe(encodeSystemSketchDocument(TLDRAW_FILE))
    expect(JSON.parse(twice).systemSketch.systemSketch).toBeUndefined()
  })

  it('hands malformed JSON on unchanged, so tldraw reports the parse error', () => {
    const broken = '{"systemSketch":{"formatVersion":1},"records":['
    expect(decodeSystemSketchDocument(broken).core).toBe(broken)
  })
})

/**
 * The compatibility claim, judged by tldraw itself rather than by reasoning
 * about it: the same records are accepted as a `.tldr`, refused once the
 * envelope is in front of them, and accepted again after the envelope comes
 * off. `parseTldrawJsonFile` here is the real SDK function the tldraw.com
 * editor uses to open a file.
 */
describe('what stock tldraw makes of each document type', () => {
  const STOCK_FILE = JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [],
  })

  it('accepts a .tldr, refuses the .systemsketch envelope, and accepts the decoded core', () => {
    const schema = createTLSchema()

    expect(parseTldrawJsonFile({ json: STOCK_FILE, schema }).ok).toBe(true)

    const wrapped = encodeSystemSketchDocument(STOCK_FILE)
    const refusal = parseTldrawJsonFile({ json: wrapped, schema })
    expect(refusal.ok).toBe(false)
    expect(refusal.ok === false && refusal.error.type).toBe('notATldrawFile')

    const { core } = decodeSystemSketchDocument(wrapped)
    expect(parseTldrawJsonFile({ json: core, schema }).ok).toBe(true)
  })
})
