import { useSyncExternalStore } from 'react'

/** A local vocabulary layer for the Asset search, never board content. */
export const TOOL_ALIASES_STORAGE_KEY = 'systemsketch.tool-aliases.v1'
export const MAX_TOOL_ALIAS_LENGTH = 64

export type ToolAliases = Readonly<Record<string, readonly string[]>>

interface StoredToolAliases {
  version: 1
  aliases: ToolAliases
}

const EMPTY_TOOL_ALIASES: ToolAliases = Object.freeze({})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Keep a readable handle intact (`@datatype` is meaningful to its author). */
export function normalizeToolAlias(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 && normalized.length <= MAX_TOOL_ALIAS_LENGTH ? normalized : null
}

export function normalizeToolAliases(value: unknown): ToolAliases {
  if (!isRecord(value)) return EMPTY_TOOL_ALIASES
  const aliases: Record<string, string[]> = {}
  for (const [toolId, rawAliases] of Object.entries(value)) {
    if (!Array.isArray(rawAliases) || toolId.length === 0) continue
    const next: string[] = []
    for (const rawAlias of rawAliases) {
      const alias = normalizeToolAlias(rawAlias)
      if (!alias || next.some((candidate) => candidate.localeCompare(alias, undefined, { sensitivity: 'accent' }) === 0)) continue
      next.push(alias)
    }
    if (next.length > 0) aliases[toolId] = next
  }
  return aliases
}

export function parseStoredToolAliases(value: unknown): ToolAliases {
  if (!isRecord(value) || value.version !== 1) return EMPTY_TOOL_ALIASES
  return normalizeToolAliases(value.aliases)
}

export function readToolAliases(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): ToolAliases {
  try {
    const raw = storage.getItem(TOOL_ALIASES_STORAGE_KEY)
    return raw === null ? EMPTY_TOOL_ALIASES : parseStoredToolAliases(JSON.parse(raw))
  } catch {
    return EMPTY_TOOL_ALIASES
  }
}

export function writeToolAliases(
  aliases: ToolAliases,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): ToolAliases {
  const normalized = normalizeToolAliases(aliases)
  const stored: StoredToolAliases = { version: 1, aliases: normalized }
  try {
    storage.setItem(TOOL_ALIASES_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Search vocabulary is a convenience; a full or disabled store must not block drawing.
  }
  return normalized
}

function aliasesEqual(left: ToolAliases, right: ToolAliases): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([id, aliases]) => aliases.length === right[id]?.length
      && aliases.every((alias, index) => alias === right[id]?.[index]))
}

let snapshot: ToolAliases = EMPTY_TOOL_ALIASES
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readToolAliases()
}

export function getToolAliases(): ToolAliases {
  hydrate()
  return snapshot
}

export function updateToolAliases(next: ToolAliases): ToolAliases {
  hydrate()
  const normalized = typeof window === 'undefined' ? normalizeToolAliases(next) : writeToolAliases(next)
  if (aliasesEqual(snapshot, normalized)) return snapshot
  snapshot = normalized
  listeners.forEach((listener) => listener())
  return snapshot
}

/** Add one distinct alias to one stable tool id. Returns false when it is not new. */
export function addToolAlias(toolId: string, value: unknown): boolean {
  const alias = normalizeToolAlias(value)
  if (!alias || toolId.length === 0) return false
  const current = getToolAliases()[toolId] ?? []
  if (current.some((candidate) => candidate.localeCompare(alias, undefined, { sensitivity: 'accent' }) === 0)) return false
  updateToolAliases({ ...getToolAliases(), [toolId]: [...current, alias] })
  return true
}

export function removeToolAlias(toolId: string, value: string): void {
  const current = getToolAliases()[toolId] ?? []
  const next = current.filter((alias) => alias !== value)
  if (next.length === current.length) return
  const aliases = { ...getToolAliases() }
  if (next.length > 0) aliases[toolId] = next
  else delete aliases[toolId]
  updateToolAliases(aliases)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToolAliases(): ToolAliases {
  return useSyncExternalStore(subscribe, getToolAliases, () => EMPTY_TOOL_ALIASES)
}
