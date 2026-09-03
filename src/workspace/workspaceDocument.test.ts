import { createTLSchema } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { inspectWorkspaceDocumentSource } from './workspaceDocument'

const EMPTY_TLDRAW_FILE = JSON.stringify({
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
})

describe('standalone workspace document inspection', () => {
  const schema = createTLSchema()

  it('opens zero-byte and whitespace-only files as intentional blank documents', () => {
    expect(inspectWorkspaceDocumentSource('', schema)).toEqual({ kind: 'blank' })
    expect(inspectWorkspaceDocumentSource('\n\t ', schema)).toEqual({ kind: 'blank' })
  })

  it('hands valid files to tldraw and returns a loadable snapshot', () => {
    const result = inspectWorkspaceDocumentSource(EMPTY_TLDRAW_FILE, schema)
    expect(result.kind).toBe('ready')
    expect(result.kind === 'ready' && result.snapshot.store).toBeDefined()
  })

  it('recognizes the retired PyBlocks golden envelope before tldraw rejects it', () => {
    const legacy = {
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      metadata: { 'pyblocks.golden': { version: 1 } },
    }
    const result = inspectWorkspaceDocumentSource(JSON.stringify(legacy), schema)
    expect(result).toEqual({ kind: 'legacy-pyblocks', document: legacy })
  })

  it('turns tldraw parser refusal into an explicit quarantine result', () => {
    // The standalone host accepts this portable envelope shape and deliberately
    // leaves detailed schema authority to tldraw, whose parser refuses it.
    const result = inspectWorkspaceDocumentSource(JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: {},
      records: [],
    }), schema)
    expect(result.kind).toBe('quarantined')
    expect(result.kind === 'quarantined' && result.message).toMatch(/tldraw could not read/i)
  })

  it('opens a parseable future envelope as an actionable protected document', () => {
    const result = inspectWorkspaceDocumentSource(JSON.stringify({
      systemSketch: {
        formatVersion: 42,
        application: 'SystemSketch',
        shapes: {},
        bindings: {},
        unknownFutureMetadata: { retainedOnlyInOriginal: true },
      },
      ...JSON.parse(EMPTY_TLDRAW_FILE),
    }), schema)

    expect(result.kind).toBe('future')
    expect(result.kind === 'future' && result.formatVersion).toBe(42)
    expect(result.kind === 'future' && result.snapshot.store).toBeDefined()
  })
})
