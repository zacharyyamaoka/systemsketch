import { describe, expect, it } from 'vitest'
import {
  documentPathFor,
  documentTitle,
  nextSyncAction,
  nextUntitledDocumentPath,
  readRecentDocumentPaths,
  rememberDocumentPath,
  renamedDocumentPath,
} from './workspaceModel'

describe('local workspace model', () => {
  it('normalizes safe names to portable .tldr paths', () => {
    expect(documentPathFor('/home/zach/SystemSketch', 'API map.tldr')).toBe(
      '/home/zach/SystemSketch/API map.tldr',
    )
    expect(documentPathFor('/home/zach/SystemSketch', '../bad/name')).toBe(
      '/home/zach/SystemSketch/-bad-name.tldr',
    )
    expect(renamedDocumentPath('/home/zach/SystemSketch/Old.tldr', 'New')).toBe(
      '/home/zach/SystemSketch/New.tldr',
    )
    expect(documentTitle('/home/zach/SystemSketch/New.tldr')).toBe('New')
  })

  it('allocates the first unused untitled document', () => {
    expect(nextUntitledDocumentPath('/boards', ['/boards/Untitled.tldr'])).toBe(
      '/boards/Untitled 2.tldr',
    )
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
