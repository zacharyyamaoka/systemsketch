import { useSyncExternalStore } from 'react'

export type ArrowPreset = 'straight' | 'curve' | 'elbow'

export type ShapeFamilyTool =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'line'
  | 'arrow-straight'
  | 'arrow-curve'
  | 'arrow-elbow'

export type DrawFamilyTool = 'draw' | 'highlight'

export interface ToolbarPreferences {
  version: 1
  lastShapeTool: ShapeFamilyTool
  lastArrowPreset: ArrowPreset
  lastDrawTool: DrawFamilyTool
}

export const DEFAULT_TOOLBAR_PREFERENCES: ToolbarPreferences = {
  version: 1,
  lastShapeTool: 'rectangle',
  lastArrowPreset: 'straight',
  lastDrawTool: 'draw',
}

const STORAGE_KEY = 'systemsketch.toolbar-preferences.v1'
const ARROW_PRESETS: readonly ArrowPreset[] = ['straight', 'curve', 'elbow']
const SHAPE_TOOLS: readonly ShapeFamilyTool[] = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'line',
  'arrow-straight',
  'arrow-curve',
  'arrow-elbow',
]
const DRAW_TOOLS: readonly DrawFamilyTool[] = ['draw', 'highlight']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

export function parseToolbarPreferences(value: unknown): ToolbarPreferences {
  if (!isRecord(value)) return DEFAULT_TOOLBAR_PREFERENCES
  return {
    version: 1,
    lastShapeTool: includes(SHAPE_TOOLS, value.lastShapeTool)
      ? value.lastShapeTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastShapeTool,
    lastArrowPreset: includes(ARROW_PRESETS, value.lastArrowPreset)
      ? value.lastArrowPreset
      : DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset,
    lastDrawTool: includes(DRAW_TOOLS, value.lastDrawTool)
      ? value.lastDrawTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastDrawTool,
  }
}

export function nextArrowPreset(preset: ArrowPreset): ArrowPreset {
  return ARROW_PRESETS[(ARROW_PRESETS.indexOf(preset) + 1) % ARROW_PRESETS.length]
}

export function arrowPresetForActivation(
  currentToolId: string,
  lastArrowPreset: ArrowPreset,
): ArrowPreset {
  return currentToolId === 'arrow' ? nextArrowPreset(lastArrowPreset) : lastArrowPreset
}

export function shapeToolForArrowPreset(preset: ArrowPreset): ShapeFamilyTool {
  return `arrow-${preset}`
}

let snapshot = DEFAULT_TOOLBAR_PREFERENCES
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window === 'undefined') return
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) snapshot = parseToolbarPreferences(JSON.parse(saved))
  } catch {
    snapshot = DEFAULT_TOOLBAR_PREFERENCES
  }
}

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Preferences are helpful feedback, never a reason to block drawing.
  }
}

export function getToolbarPreferences(): ToolbarPreferences {
  hydrate()
  return snapshot
}

export function updateToolbarPreferences(
  update: Partial<Omit<ToolbarPreferences, 'version'>>,
): ToolbarPreferences {
  hydrate()
  const next = { ...snapshot, ...update, version: 1 as const }
  if (
    next.lastShapeTool === snapshot.lastShapeTool
    && next.lastArrowPreset === snapshot.lastArrowPreset
    && next.lastDrawTool === snapshot.lastDrawTool
  ) {
    return snapshot
  }
  snapshot = next
  persist()
  listeners.forEach((listener) => listener())
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToolbarPreferences(): ToolbarPreferences {
  return useSyncExternalStore(subscribe, getToolbarPreferences, () => DEFAULT_TOOLBAR_PREFERENCES)
}

