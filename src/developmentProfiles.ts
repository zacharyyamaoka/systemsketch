export const DEVELOPMENT_PRESET_PARAM = 'preset'
export const DEVELOPMENT_RECENTS_KEY = 'systemsketch.development-presets.recent.v1'

export type DevelopmentPresetId = 'block-dev' | 'stock'
export type DevelopmentProfileId = 'product' | DevelopmentPresetId

export interface DevelopmentPreset {
  id: DevelopmentPresetId
  label: string
  glyph: string
  description: string
  detail: string
}

/**
 * The active development compositions. This manifest is deliberately small:
 * a menu entry exists only when App.tsx can resolve it before tldraw mounts.
 */
export const DEVELOPMENT_PRESETS: readonly DevelopmentPreset[] = [
  {
    id: 'block-dev',
    label: 'Block Dev',
    glyph: 'B',
    description: 'Stock tldraw + Block',
    detail: 'Independent browser-local board',
  },
  {
    id: 'stock',
    label: 'Stock tldraw',
    glyph: 'T',
    description: 'Pinned stock baseline',
    detail: 'Independent browser-local board',
  },
] as const

const PRESET_IDS = new Set<DevelopmentPresetId>(DEVELOPMENT_PRESETS.map((preset) => preset.id))

export function isDevelopmentPresetId(value: unknown): value is DevelopmentPresetId {
  return typeof value === 'string' && PRESET_IDS.has(value as DevelopmentPresetId)
}

export function resolveDevelopmentProfile(search: string): DevelopmentProfileId {
  const preset = new URLSearchParams(search).get(DEVELOPMENT_PRESET_PARAM)
  return isDevelopmentPresetId(preset) ? preset : 'product'
}

export function developmentProfileLabel(profile: DevelopmentProfileId): string {
  if (profile === 'product') return 'Latest Preview'
  return DEVELOPMENT_PRESETS.find((preset) => preset.id === profile)?.label ?? 'Latest Preview'
}

/** A development composition owns browser-local stock-tldraw persistence. */
export function developmentPersistenceKey(profile: DevelopmentPresetId): string {
  return `systemsketch-development-${profile}-v1`
}

export function orderDevelopmentPresets(recentIds: readonly string[]): DevelopmentPreset[] {
  const recentOrder = new Map(recentIds.map((id, index) => [id, index]))
  return [...DEVELOPMENT_PRESETS].sort((left, right) => {
    const leftIndex = recentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = recentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

export function readRecentDevelopmentPresets(): DevelopmentPresetId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEVELOPMENT_RECENTS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isDevelopmentPresetId)
  } catch {
    return []
  }
}

export function rememberDevelopmentPreset(id: DevelopmentPresetId): DevelopmentPresetId[] {
  const next = [id, ...readRecentDevelopmentPresets().filter((candidate) => candidate !== id)]
    .slice(0, DEVELOPMENT_PRESETS.length)
  try {
    window.localStorage.setItem(DEVELOPMENT_RECENTS_KEY, JSON.stringify(next))
  } catch {
    // Recents are a convenience; private browsing must not block a launch.
  }
  return next
}
