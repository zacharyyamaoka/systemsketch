import { MAX_RECENT_DOCUMENTS, RECENT_DOCUMENTS_KEY, readRecentDocumentPaths } from './workspace/workspaceModel'

/**
 * These are intentionally a small, reviewed subset of app-owned preference
 * values. A promotion must never copy a browser profile, arbitrary
 * localStorage, session state, cookies, or recorder data into Stable.
 */
export const PROMOTED_PREFERENCE_KEYS = [
  'systemsketch.interface-scale.v1',
  'systemsketch.appearance.v1',
  'systemsketch.theme.v1',
  'systemsketch.imported-themes.v1',
  'systemsketch.toolbar-preferences.v1',
  'systemsketch.cable-presentation.v1',
  'systemsketch.diff-presentation.v1',
] as const

export const PROMOTED_WORKSPACE_VERSION = 1
export const PROMOTED_WORKSPACE_RECEIPT_KEY = 'systemsketch.promoted-workspace.receipt.v1'
const MAX_PATH_LENGTH = 4096
const MAX_PREFERENCE_BYTES = 16 * 1024

type PromotedPreferenceKey = (typeof PROMOTED_PREFERENCE_KEYS)[number]

export interface PromotionWorkspaceState {
  version: typeof PROMOTED_WORKSPACE_VERSION
  activePath: string
  recents: string[]
  preferences: Partial<Record<PromotedPreferenceKey, string>>
}

export interface PromotedWorkspaceRecord {
  build: string
  workspace: PromotionWorkspaceState
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): WriteStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function uniquePaths(paths: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of paths) {
    if (typeof value !== 'string') continue
    const path = value.trim()
    if (!path || path.length > MAX_PATH_LENGTH || result.includes(path)) continue
    result.push(path)
    if (result.length === MAX_RECENT_DOCUMENTS) break
  }
  return result
}

function isPromotedPreferenceKey(value: string): value is PromotedPreferenceKey {
  return (PROMOTED_PREFERENCE_KEYS as readonly string[]).includes(value)
}

function safePreferenceValues(storage: ReadStorage): PromotionWorkspaceState['preferences'] {
  const preferences: PromotionWorkspaceState['preferences'] = {}
  for (const key of PROMOTED_PREFERENCE_KEYS) {
    try {
      const value = storage.getItem(key)
      if (value === null || new TextEncoder().encode(value).byteLength > MAX_PREFERENCE_BYTES) continue
      JSON.parse(value)
      preferences[key] = value
    } catch {
      // A malformed or unavailable convenience preference cannot block a release.
    }
  }
  return preferences
}

/** Capture the transferable part of Preview without touching browser internals. */
export function capturePromotedWorkspaceState(
  activePath: string | null,
  recents: readonly string[],
  storage: ReadStorage | null = browserStorage(),
): PromotionWorkspaceState | undefined {
  const paths = uniquePaths([activePath, ...recents])
  const current = paths[0]
  if (!current) return undefined
  return {
    version: PROMOTED_WORKSPACE_VERSION,
    activePath: current,
    recents: paths,
    preferences: storage ? safePreferenceValues(storage) : {},
  }
}

/** Parse an API record defensively before any Stable storage is updated. */
export function parsePromotedWorkspaceRecord(value: unknown): PromotedWorkspaceRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as { build?: unknown; workspace?: unknown }
  if (typeof record.build !== 'string' || !record.build) return null
  if (typeof record.workspace !== 'object' || record.workspace === null) return null
  const workspace = record.workspace as {
    version?: unknown
    activePath?: unknown
    recents?: unknown
    preferences?: unknown
  }
  if (workspace.version !== PROMOTED_WORKSPACE_VERSION || typeof workspace.activePath !== 'string') return null
  const paths = uniquePaths([workspace.activePath, ...(Array.isArray(workspace.recents) ? workspace.recents : [])])
  if (paths[0] !== workspace.activePath.trim()) return null
  const preferences: PromotionWorkspaceState['preferences'] = {}
  if (typeof workspace.preferences === 'object' && workspace.preferences !== null) {
    for (const [key, value] of Object.entries(workspace.preferences)) {
      if (!isPromotedPreferenceKey(key) || typeof value !== 'string') continue
      try {
        if (new TextEncoder().encode(value).byteLength > MAX_PREFERENCE_BYTES) continue
        JSON.parse(value)
        preferences[key] = value
      } catch {
        // Stable starts normally if one old or malformed preference cannot transfer.
      }
    }
  }
  return {
    build: record.build,
    workspace: {
      version: PROMOTED_WORKSPACE_VERSION,
      activePath: paths[0],
      recents: paths,
      preferences,
    },
  }
}

/**
 * Apply a matching Stable handoff once per browser profile. An explicit board
 * URL is a higher-priority user choice and must never be replaced.
 */
export function applyPromotedWorkspaceRecord(
  candidate: unknown,
  {
    search = typeof window === 'undefined' ? '' : window.location.search,
    storage = browserStorage(),
  }: { search?: string; storage?: WriteStorage | null } = {},
): boolean {
  const record = parsePromotedWorkspaceRecord(candidate)
  if (!record || !storage || new URLSearchParams(search).has('board')) return false
  try {
    if (storage.getItem(PROMOTED_WORKSPACE_RECEIPT_KEY) === record.build) return false
    const recents = uniquePaths([
      record.workspace.activePath,
      ...record.workspace.recents,
      ...readRecentDocumentPaths(storage),
    ])
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(recents))
    for (const key of PROMOTED_PREFERENCE_KEYS) {
      const value = record.workspace.preferences[key]
      if (value !== undefined) storage.setItem(key, value)
    }
    storage.setItem(PROMOTED_WORKSPACE_RECEIPT_KEY, record.build)
    return true
  } catch {
    return false
  }
}

/** Fetch the matching Stable-only record before React imports preference stores. */
export async function restorePromotedWorkspaceState(): Promise<boolean> {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).has('board')) return false
  try {
    const response = await fetch('/api/promoted-workspace', { cache: 'no-store' })
    if (!response.ok) return false
    const payload = await response.json() as { promotedWorkspace?: unknown }
    return applyPromotedWorkspaceRecord(payload.promotedWorkspace)
  } catch {
    // A missing/older controller must not delay opening Stable.
    return false
  }
}
