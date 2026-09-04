import { describe, expect, it } from 'vitest'
import { RECENT_DOCUMENTS_KEY } from './workspace/workspaceModel'
import {
  PROMOTED_WORKSPACE_RECEIPT_KEY,
  applyPromotedWorkspaceRecord,
  capturePromotedWorkspaceState,
  parsePromotedWorkspaceRecord,
} from './promotedWorkspaceState'

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries))
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe('promoted workspace state', () => {
  it('captures only the active board, capped recents, and reviewed preferences', () => {
    const storage = memoryStorage({
      'systemsketch.interface-scale.v1': JSON.stringify({ version: 1, percent: 125 }),
      'systemsketch.unrelated-token': JSON.stringify({ value: 'do not copy' }),
    })
    const captured = capturePromotedWorkspaceState(
      '/shared/Active.systemsketch',
      Array.from({ length: 13 }, (_, index) => `/shared/Recent-${index}.systemsketch`),
      storage,
    )

    expect(captured).toEqual({
      version: 1,
      activePath: '/shared/Active.systemsketch',
      recents: [
        '/shared/Active.systemsketch',
        ...Array.from({ length: 11 }, (_, index) => `/shared/Recent-${index}.systemsketch`),
      ],
      preferences: {
        'systemsketch.interface-scale.v1': JSON.stringify({ version: 1, percent: 125 }),
      },
    })
  })

  it('restores a matching record once while retaining existing recents', () => {
    const storage = memoryStorage({
      [RECENT_DOCUMENTS_KEY]: JSON.stringify(['/shared/Older.tldr']),
    })
    const record = {
      build: 'release-42',
      workspace: {
        version: 1,
        activePath: '/shared/Active.systemsketch',
        recents: ['/shared/Recent.tldr'],
        preferences: {
          'systemsketch.interface-scale.v1': JSON.stringify({ version: 1, percent: 110 }),
        },
      },
    }

    expect(applyPromotedWorkspaceRecord(record, { storage, search: '' })).toBe(true)
    expect(JSON.parse(storage.getItem(RECENT_DOCUMENTS_KEY)!)).toEqual([
      '/shared/Active.systemsketch',
      '/shared/Recent.tldr',
      '/shared/Older.tldr',
    ])
    expect(storage.getItem('systemsketch.interface-scale.v1')).toBe(JSON.stringify({ version: 1, percent: 110 }))
    expect(storage.getItem(PROMOTED_WORKSPACE_RECEIPT_KEY)).toBe('release-42')
    expect(applyPromotedWorkspaceRecord(record, { storage, search: '' })).toBe(false)
  })

  it('never overrides an explicit board URL and rejects malformed API records', () => {
    const storage = memoryStorage()
    const record = {
      build: 'release-42',
      workspace: {
        version: 1,
        activePath: '/shared/Active.systemsketch',
        recents: [],
        preferences: {},
      },
    }

    expect(applyPromotedWorkspaceRecord(record, { storage, search: '?board=%2Fchosen.tldr' })).toBe(false)
    expect(storage.getItem(PROMOTED_WORKSPACE_RECEIPT_KEY)).toBe(null)
    expect(parsePromotedWorkspaceRecord({ build: 'release-42', workspace: { version: 1 } })).toBe(null)
  })
})
