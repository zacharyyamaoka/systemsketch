import { describe, expect, it } from 'vitest'
import {
  breadcrumbTrail,
  browserRows,
  claimUntitledPath,
  documentEncoding,
  documentPathFor,
  documentSuffix,
  documentTitle,
  encodeDocumentForPath,
  exportedTldrawPath,
  autosaveSchedule,
  autosaveRetryDelay,
  canApplyExternalReload,
  nextSyncAction,
  moveBrowserSelection,
  nextUntitledDocumentPath,
  readRecentDocumentPaths,
  readUntitledClaims,
  resolveBrowserSelection,
  rememberDocumentPath,
  renamedDocumentPath,
  workspaceBrowserDirectory,
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

  it('forces export destinations to the stock .tldr contract', () => {
    expect(exportedTldrawPath('/boards/Map')).toBe('/boards/Map.tldr')
    expect(exportedTldrawPath('/boards/Map.systemsketch')).toBe('/boards/Map.tldr')
    expect(exportedTldrawPath('/boards/Map.TLDR')).toBe('/boards/Map.TLDR')
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

  it('browses beside primary documents but falls back from a direct worktree board', () => {
    expect(workspaceBrowserDirectory(
      '/home/z/SystemSketch/Projects/Map.systemsketch',
      '/home/z',
      '/home/z/SystemSketch',
    )).toBe('/home/z/SystemSketch/Projects')
    expect(workspaceBrowserDirectory(
      '/worktrees/review/Map.systemsketch',
      '/home/z',
      '/home/z/SystemSketch',
    )).toBe('/home/z/SystemSketch')
    // A textual prefix is not a filesystem boundary.
    expect(workspaceBrowserDirectory(
      '/home/z-other/Map.systemsketch',
      '/home/z',
      '/home/z/SystemSketch',
    )).toBe('/home/z/SystemSketch')
    expect(workspaceBrowserDirectory(
      'C:\\worktree\\Map.systemsketch',
      'C:\\Users\\Zach',
      'C:\\Users\\Zach\\SystemSketch',
    )).toBe('C:\\Users\\Zach\\SystemSketch')
  })

  it('reloads clean external edits and protects dirty ones', () => {
    const base = { mtime: 1, size: 20, digest: 'base' }
    expect(nextSyncAction({ disk: base, base, hasUnsavedEdits: false }).kind).toBe('idle')
    expect(nextSyncAction({ disk: { mtime: 2, size: 20, digest: 'changed' }, base, hasUnsavedEdits: false }).kind).toBe('reload')
    expect(nextSyncAction({ disk: { mtime: 2, size: 20, digest: 'changed' }, base, hasUnsavedEdits: true }).kind).toBe('conflict')
    expect(nextSyncAction({ disk: null, base, hasUnsavedEdits: false }).kind).toBe('missing')
  })

  it('uses the digest to catch same-size, same-mtime rewrites', () => {
    const base = { mtime: 10, size: 100, digest: 'before' }
    expect(nextSyncAction({
      disk: { mtime: 10, size: 100, digest: 'after' },
      base,
      hasUnsavedEdits: false,
    }).kind).toBe('reload')
    // A metadata-only touch does not reload bytes that are already current.
    expect(nextSyncAction({
      disk: { mtime: 11, size: 100, digest: 'before' },
      base,
      hasUnsavedEdits: false,
    }).kind).toBe('idle')
  })

  it('fences a clean reload against edits and revision changes while read is in flight', () => {
    const request = {
      requestedChangeEpoch: 4,
      currentChangeEpoch: 4,
      requestedBaseDigest: 'base',
      currentBaseDigest: 'base',
      expectedDiskDigest: 'external',
      loadedDiskDigest: 'external',
      hasUnsavedEdits: false,
      discardRequestedEdits: false,
    }
    expect(canApplyExternalReload(request)).toBe(true)
    expect(canApplyExternalReload({
      ...request,
      currentChangeEpoch: 5,
      hasUnsavedEdits: true,
    })).toBe(false)
    expect(canApplyExternalReload({
      ...request,
      currentBaseDigest: 'saved-while-reading',
    })).toBe(false)
    expect(canApplyExternalReload({
      ...request,
      loadedDiskDigest: 'newer-external-revision',
    })).toBe(false)
    expect(canApplyExternalReload({
      ...request,
      hasUnsavedEdits: true,
      discardRequestedEdits: true,
    })).toBe(true)
  })

  it('bounds transient autosave retries', () => {
    expect([0, 1, 2, 3].map((attempt) => autosaveRetryDelay(attempt)))
      .toEqual([1_000, 3_000, 8_000, null])
    expect(autosaveRetryDelay(0, { conflict: true })).toBeNull()
    expect(autosaveRetryDelay(0, { force: true })).toBeNull()
  })

  it('debounces ordinary edits but never pushes a save past the burst deadline', () => {
    expect(autosaveSchedule(1_000, null, 600, 30_000)).toEqual({
      pendingSince: 1_000,
      delayMs: 600,
    })
    expect(autosaveSchedule(30_500, 1_000, 600, 30_000)).toEqual({
      pendingSince: 1_000,
      delayMs: 500,
    })
    expect(autosaveSchedule(31_100, 1_000, 600, 30_000)).toEqual({
      pendingSince: 1_000,
      delayMs: 0,
    })
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

describe('in-app file browser', () => {
  const listing = {
    directories: [{ name: 'Robotics', path: '/home/z/SystemSketch/Robotics' }],
    documents: [
      { name: 'Arm.tldr', title: 'Arm', path: '/home/z/SystemSketch/Arm.tldr', mtime: 10 },
      { name: 'Gripper.tldr', title: 'Gripper', path: '/home/z/SystemSketch/Gripper.tldr', mtime: 20 },
    ],
  }

  it('reports each document type, from the host or from the suffix', () => {
    const rows = browserRows(
      {
        directories: [{ name: 'Robotics', path: '/home/z/SystemSketch/Robotics' }],
        documents: [
          { name: 'New.systemsketch', title: 'New', path: '/home/z/SystemSketch/New.systemsketch', mtime: 1, kind: 'systemsketch' as const },
          { name: 'Legacy.tldr', title: 'Legacy', path: '/home/z/SystemSketch/Legacy.tldr', mtime: 2 },
        ],
      },
      '',
    )
    expect(rows.map((row) => row.encoding)).toEqual([null, 'systemsketch', 'tldraw'])
  })

  it('lists folders before documents and filters both', () => {
    expect(browserRows(listing, '').map((row) => row.title)).toEqual(['Robotics', 'Arm', 'Gripper'])
    expect(browserRows(listing, 'rob').map((row) => row.kind)).toEqual(['folder'])
    expect(browserRows(listing, 'grip').map((row) => row.title)).toEqual(['Gripper'])
    expect(browserRows(listing, 'zzz')).toEqual([])
    expect(browserRows(null, '')).toEqual([])
  })

  it('moves the arrow-key selection and clamps at both ends', () => {
    const rows = browserRows(listing, '')
    expect(moveBrowserSelection(rows, null, 1)).toBe(rows[0].path)
    expect(moveBrowserSelection(rows, null, -1)).toBe(rows[2].path)
    expect(moveBrowserSelection(rows, rows[0].path, 1)).toBe(rows[1].path)
    expect(moveBrowserSelection(rows, rows[0].path, -1)).toBe(rows[0].path)
    expect(moveBrowserSelection(rows, rows[2].path, 1)).toBe(rows[2].path)
    expect(moveBrowserSelection([], null, 1)).toBeNull()
  })

  it('re-aims a hidden selection at the first visible row', () => {
    const all = browserRows(listing, '')
    const filtered = browserRows(listing, 'grip')
    expect(resolveBrowserSelection(all, null)).toBe('/home/z/SystemSketch/Arm.tldr')
    expect(resolveBrowserSelection(all, '/home/z/SystemSketch/Gripper.tldr')).toBe(
      '/home/z/SystemSketch/Gripper.tldr',
    )
    expect(resolveBrowserSelection(filtered, '/home/z/SystemSketch/Arm.tldr')).toBe(
      '/home/z/SystemSketch/Gripper.tldr',
    )
    expect(resolveBrowserSelection(browserRows(listing, 'rob'), null)).toBe(
      '/home/z/SystemSketch/Robotics',
    )
    expect(resolveBrowserSelection([], '/gone.tldr')).toBeNull()
  })

  it('walks the breadcrumb from the workspace root down to the open folder', () => {
    expect(breadcrumbTrail('/home/z', '/home/z')).toEqual([{ label: 'z', path: '/home/z' }])
    expect(breadcrumbTrail('/home/z/SystemSketch/Robotics', '/home/z')).toEqual([
      { label: 'z', path: '/home/z' },
      { label: 'SystemSketch', path: '/home/z/SystemSketch' },
      { label: 'Robotics', path: '/home/z/SystemSketch/Robotics' },
    ])
    expect(breadcrumbTrail('/elsewhere/Boards', '/home/z')).toEqual([
      { label: 'Boards', path: '/elsewhere/Boards' },
    ])
  })
})

describe('untitled reservations across windows', () => {
  function fakeStorage() {
    let stored = '[]'
    return {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value },
    }
  }

  it('stops a second window from claiming the same untitled name', () => {
    const storage = fakeStorage()
    const first = nextUntitledDocumentPath('/boards', [])
    claimUntitledPath(first, 1000, storage)
    const second = nextUntitledDocumentPath('/boards', readUntitledClaims(1000, storage))
    expect(first).toBe('/boards/Untitled.systemsketch')
    expect(second).toBe('/boards/Untitled 2.systemsketch')
  })

  it('reserves the title, so a claim blocks that name in either extension', () => {
    const storage = fakeStorage()
    claimUntitledPath('/boards/Untitled.tldr', 1000, storage)
    expect(nextUntitledDocumentPath('/boards', readUntitledClaims(1000, storage))).toBe(
      '/boards/Untitled 2.systemsketch',
    )
  })

  it('lets a stale reservation expire so names are never lost for good', () => {
    const storage = fakeStorage()
    claimUntitledPath('/boards/Untitled.tldr', 1000, storage)
    expect(readUntitledClaims(1000, storage)).toEqual(['/boards/Untitled.tldr'])
    expect(readUntitledClaims(1000 + 13 * 60 * 60 * 1000, storage)).toEqual([])
  })
})
