import { describe, expect, it } from 'vitest'
import {
  documentEncoding,
  documentPathFor,
  documentSuffix,
  documentTitle,
  encodeDocumentForPath,
  nextSyncAction,
  nextUntitledDocumentPath,
  readRecentDocumentPaths,
  rememberDocumentPath,
  renamedDocumentPath,
} from './workspaceModel'

describe('local workspace model', () => {
  it('makes new documents .systemsketch and honours a typed .tldr', () => {
    expect(documentPathFor('/home/zach/SystemSketch', 'API map')).toBe(
      '/home/zach/SystemSketch/API map.systemsketch',
    )
    expect(documentPathFor('/home/zach/SystemSketch', 'API map.systemsketch')).toBe(
      '/home/zach/SystemSketch/API map.systemsketch',
    )
    expect(documentPathFor('/home/zach/SystemSketch', 'Export.tldr')).toBe(
      '/home/zach/SystemSketch/Export.tldr',
    )
    expect(documentPathFor('/home/zach/SystemSketch', '../bad/name')).toBe(
      '/home/zach/SystemSketch/-bad-name.systemsketch',
    )
  })

  it('reads a title out of either extension, and renaming never changes the type', () => {
    expect(documentTitle('/home/zach/SystemSketch/New.systemsketch')).toBe('New')
    expect(documentTitle('/home/zach/SystemSketch/Legacy.tldr')).toBe('Legacy')
    expect(documentSuffix('/home/zach/SystemSketch/Legacy.TLDR')).toBe('.tldr')
    expect(documentSuffix('/home/zach/SystemSketch/notes.json')).toBe(null)
    expect(renamedDocumentPath('/home/zach/SystemSketch/Old.tldr', 'New')).toBe(
      '/home/zach/SystemSketch/New.tldr',
    )
    expect(renamedDocumentPath('/home/zach/SystemSketch/Old.systemsketch', 'New')).toBe(
      '/home/zach/SystemSketch/New.systemsketch',
    )
  })

  it('wraps the envelope for .systemsketch and leaves .tldr byte-identical', () => {
    const tldrawJson = JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: { schemaVersion: 2, sequences: {} },
      records: [
        { id: 'shape:a', typeName: 'shape', type: 'block' },
        { id: 'shape:b', typeName: 'shape', type: 'block' },
        { id: 'binding:c', typeName: 'binding', type: 'connection' },
      ],
    })

    expect(documentEncoding('/boards/Map.systemsketch')).toBe('systemsketch')
    expect(documentEncoding('/boards/Map.tldr')).toBe('tldraw')
    expect(encodeDocumentForPath('/boards/Map.tldr', tldrawJson)).toBe(tldrawJson)

    const wrapped = JSON.parse(encodeDocumentForPath('/boards/Map.systemsketch', tldrawJson))
    expect(Object.keys(wrapped)[0]).toBe('systemSketch')
    expect(wrapped.systemSketch.shapes).toEqual({ block: 2 })
    expect(wrapped.systemSketch.bindings).toEqual({ connection: 1 })
    expect(wrapped.records).toHaveLength(3)
  })

  it('allocates the next untitled document by title, across both extensions', () => {
    expect(nextUntitledDocumentPath('/boards', ['/boards/Untitled.tldr'])).toBe(
      '/boards/Untitled 2.systemsketch',
    )
    expect(nextUntitledDocumentPath('/boards', [])).toBe('/boards/Untitled.systemsketch')
    expect(
      nextUntitledDocumentPath('/boards', [
        '/boards/Untitled.systemsketch',
        '/boards/Untitled 2.tldr',
      ]),
    ).toBe('/boards/Untitled 3.systemsketch')
  })

  it('reloads clean external edits and protects dirty ones', () => {
    const base = { mtime: 1, size: 20 }
    expect(nextSyncAction({ disk: base, base, hasUnsavedEdits: false }).kind).toBe('idle')
    expect(nextSyncAction({ disk: { mtime: 2, size: 20 }, base, hasUnsavedEdits: false }).kind).toBe('reload')
    expect(nextSyncAction({ disk: { mtime: 2, size: 20 }, base, hasUnsavedEdits: true }).kind).toBe('conflict')
    expect(nextSyncAction({ disk: null, base, hasUnsavedEdits: false }).kind).toBe('missing')
  })

  it('keeps a bounded, de-duplicated MRU list', () => {
    let stored = '[]'
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value },
    }
    rememberDocumentPath('/a.tldr', storage)
    rememberDocumentPath('/b.tldr', storage)
    rememberDocumentPath('/a.tldr', storage)
    expect(readRecentDocumentPaths(storage)).toEqual(['/a.tldr', '/b.tldr'])
  })
})
