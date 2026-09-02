import { useSyncExternalStore } from 'react'

import type { ConnectionRoutingKind } from '../blocks/connections/connectionModel'

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

/** The system-design family under the Block slot: Block, Branch, Pill, and room for Loop. */
export type SystemFamilyTool = 'block' | 'branch' | 'pill'

export interface ToolbarPreferences {
  version: 1
  lastShapeTool: ShapeFamilyTool
  lastArrowPreset: ArrowPreset
  lastDrawTool: DrawFamilyTool
  lastSystemTool: SystemFamilyTool
}

/**
 * Elbow is the datum, for arrows and for data edges alike.
 *
 * "That is the most common one we use" — so a fresh install draws an elbow
 * before anyone has touched a control, and `lastArrowPreset` is the single
 * value both the arrow tool and the edge layer read to know what that means.
 */
export const DEFAULT_TOOLBAR_PREFERENCES: ToolbarPreferences = {
  version: 1,
  lastShapeTool: 'rectangle',
  lastArrowPreset: 'elbow',
  lastDrawTool: 'draw',
  lastSystemTool: 'block',
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
const SYSTEM_TOOLS: readonly SystemFamilyTool[] = ['block', 'branch', 'pill']

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
    lastSystemTool: includes(SYSTEM_TOOLS, value.lastSystemTool)
      ? value.lastSystemTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastSystemTool,
  }
}

export function nextArrowPreset(preset: ArrowPreset): ArrowPreset {
  return ARROW_PRESETS[(ARROW_PRESETS.indexOf(preset) + 1) % ARROW_PRESETS.length]
}

/**
 * The one table that makes an arrow and a data edge the same choice.
 *
 * Both vocabularies name the same three shapes; only the words differ, because
 * tldraw's arrow calls its bezier `arc` while the cable calls it `curved`. A
 * preset therefore *is* a routing, and every surface that sets one sets both.
 */
export const ARROW_PRESET_ROUTING: Record<ArrowPreset, ConnectionRoutingKind> = {
  straight: 'straight',
  curve: 'curved',
  elbow: 'elbow',
}

export function connectionRoutingForArrowPreset(preset: ArrowPreset): ConnectionRoutingKind {
  return ARROW_PRESET_ROUTING[preset]
}

/**
 * How many presses of A, from a freshly started app, land on this preset.
 *
 * The toolbar prints this beside each arrow, and it has to be derived rather
 * than typed: the cycle is a rotation, so moving the starting preset silently
 * renumbers every rung. Deriving it means the hint cannot drift from the key.
 */
export function arrowPresetPressCount(preset: ArrowPreset): number {
  const start = ARROW_PRESETS.indexOf(DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset)
  const target = ARROW_PRESETS.indexOf(preset)
  return ((target - start + ARROW_PRESETS.length) % ARROW_PRESETS.length) + 1
}

/** Every arrow preset in the order A walks them from a fresh start. */
export function arrowPresetsInPressOrder(): ArrowPreset[] {
  return [...ARROW_PRESETS].sort((a, b) => arrowPresetPressCount(a) - arrowPresetPressCount(b))
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
    && next.lastSystemTool === snapshot.lastSystemTool
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

