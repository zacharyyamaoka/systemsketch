import { describe, expect, it } from 'vitest'
import {
  breadcrumbTrail,
  browserRows,
  claimUntitledPath,
  documentPathFor,
  documentTitle,
  nextSyncAction,
  moveBrowserSelection,
  nextUntitledDocumentPath,
  readRecentDocumentPaths,
  readUntitledClaims,
  resolveBrowserSelection,
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

describe('in-app file browser', () => {
  const listing = {
    directories: [{ name: 'Robotics', path: '/home/z/SystemSketch/Robotics' }],
    documents: [
      { name: 'Arm.tldr', title: 'Arm', path: '/home/z/SystemSketch/Arm.tldr', mtime: 10 },
      { name: 'Gripper.tldr', title: 'Gripper', path: '/home/z/SystemSketch/Gripper.tldr', mtime: 20 },
    ],
  }

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
    expect(first).toBe('/boards/Untitled.tldr')
    expect(second).toBe('/boards/Untitled 2.tldr')
  })

  it('lets a stale reservation expire so names are never lost for good', () => {
    const storage = fakeStorage()
    claimUntitledPath('/boards/Untitled.tldr', 1000, storage)
    expect(readUntitledClaims(1000, storage)).toEqual(['/boards/Untitled.tldr'])
    expect(readUntitledClaims(1000 + 13 * 60 * 60 * 1000, storage)).toEqual([])
  })
})
