import { describe, expect, it } from 'vitest'
import { decideOutgoing, externalChangeMessage, type EmbeddedDocument } from './embedSession'

const OPEN: EmbeddedDocument = { path: '/goldens/01/target.systemsketch', version: 7, readOnly: false }

describe('an edit leaves only when it can land', () => {
  it('posts against the version the canvas is showing', () => {
    expect(decideOutgoing({ document: OPEN, text: 'a', settledText: null, inFlight: false }))
      .toEqual({ kind: 'post', text: 'a', baseVersion: 7 })
  })

  it('holds while an earlier edit is still in flight', () => {
    expect(decideOutgoing({ document: OPEN, text: 'b', settledText: 'a', inFlight: true }))
      .toEqual({ kind: 'hold', reason: 'in-flight' })
  })

  it('holds when the canvas serializes to what the host already has', () => {
    expect(decideOutgoing({ document: OPEN, text: 'a', settledText: 'a', inFlight: false }))
      .toEqual({ kind: 'hold', reason: 'unchanged' })
  })

  it('never writes to a read-only document', () => {
    expect(decideOutgoing({
      document: { ...OPEN, readOnly: true },
      text: 'a',
      settledText: null,
      inFlight: false,
    })).toEqual({ kind: 'hold', reason: 'read-only' })
  })

  it('holds before a host has opened anything', () => {
    expect(decideOutgoing({ document: null, text: 'a', settledText: null, inFlight: false }))
      .toEqual({ kind: 'hold', reason: 'no-document' })
  })

  it('posts again once the host answers with its new version', () => {
    const landed: EmbeddedDocument = { ...OPEN, version: 8 }
    expect(decideOutgoing({ document: landed, text: 'b', settledText: 'a', inFlight: false }))
      .toEqual({ kind: 'post', text: 'b', baseVersion: 8 })
  })
})

describe('replacing the canvas is explained, except when it is routine', () => {
  it('says so when an edit was overtaken', () => {
    expect(externalChangeMessage('stale-change')).toMatch(/did not land|before this edit landed/)
  })

  it('says so when the host could not write', () => {
    expect(externalChangeMessage('write-failed')).toMatch(/could not write/)
  })

  it('stays silent when the file simply changed elsewhere', () => {
    expect(externalChangeMessage('source-edit')).toBeNull()
  })
})
