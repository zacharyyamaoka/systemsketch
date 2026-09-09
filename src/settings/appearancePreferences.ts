import { useSyncExternalStore } from 'react'

export const APPEARANCE_PREFERENCES_STORAGE_KEY = 'systemsketch.appearance.v1'
export const DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT = 100
export const MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT = 50
export const MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT = 150
export const WHEEL_ZOOM_SENSITIVITY_STEP = 5

export interface AppearancePreferences {
  showZoomButtons: boolean
  /** Start from tldraw's ordinary whiteboard contract: wheel pans, while
   * Ctrl/Cmd + wheel zooms. Direct wheel zoom is an explicit opt-in for the
   * spatial convention SystemSketch briefly made universal. */
  directWheelZoom: boolean
  /** When direct wheel zoom is enabled, moving the wheel down moves closer to
   * the board. Keep the opposite convention reachable without changing the
   * board or replacing tldraw's camera behavior. */
  scrollDownZoomsIn: boolean
  /** In direct mode, keep Ctrl/Cmd + wheel available as an intentionally
   * opposite zoom gesture instead of tldraw's usual temporary pan. This lets
   * CAD and stock-whiteboard muscle memory coexist without changing the
   * unmodified wheel's chosen direction. */
  modifierWheelZoomsOppositely: boolean
  /** A percentage of tldraw's stock `zoomSpeed: 1`. Keeping the persisted
   * value in product language makes 100 the obvious, durable reset point. */
  wheelZoomSensitivityPercent: number
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = Object.freeze({
  showZoomButtons: false,
  directWheelZoom: false,
  scrollDownZoomsIn: true,
  modifierWheelZoomsOppositely: false,
  wheelZoomSensitivityPercent: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
})

interface StoredAppearancePreferences extends AppearancePreferences {
  version: 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWheelZoomSensitivityPercent(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT
    && value <= MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT
    && value % WHEEL_ZOOM_SENSITIVITY_STEP === 0
}

export function parseStoredAppearancePreferences(value: unknown): AppearancePreferences {
  if (!isRecord(value) || value.version !== 1) {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
  const {
    showZoomButtons,
    directWheelZoom,
    scrollDownZoomsIn,
    modifierWheelZoomsOppositely,
    wheelZoomSensitivityPercent,
  } = value
  // A field the stored record predates is `undefined`, not wrong — that
  // should fall back to its own default, not discard a real value the user
  // already set for every other field. A field that's present with the
  // wrong type means the record is corrupt, and the whole thing resets.
  if (
    (showZoomButtons !== undefined && typeof showZoomButtons !== 'boolean')
    || (directWheelZoom !== undefined && typeof directWheelZoom !== 'boolean')
    || (scrollDownZoomsIn !== undefined && typeof scrollDownZoomsIn !== 'boolean')
    || (modifierWheelZoomsOppositely !== undefined && typeof modifierWheelZoomsOppositely !== 'boolean')
    || (wheelZoomSensitivityPercent !== undefined && !isWheelZoomSensitivityPercent(wheelZoomSensitivityPercent))
  ) {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
  return {
    showZoomButtons: typeof showZoomButtons === 'boolean'
      ? showZoomButtons
      : DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons,
    directWheelZoom: typeof directWheelZoom === 'boolean'
      ? directWheelZoom
      : DEFAULT_APPEARANCE_PREFERENCES.directWheelZoom,
    scrollDownZoomsIn: typeof scrollDownZoomsIn === 'boolean'
      ? scrollDownZoomsIn
      : DEFAULT_APPEARANCE_PREFERENCES.scrollDownZoomsIn,
    modifierWheelZoomsOppositely: typeof modifierWheelZoomsOppositely === 'boolean'
      ? modifierWheelZoomsOppositely
      : DEFAULT_APPEARANCE_PREFERENCES.modifierWheelZoomsOppositely,
    wheelZoomSensitivityPercent: isWheelZoomSensitivityPercent(wheelZoomSensitivityPercent)
      ? wheelZoomSensitivityPercent
      : DEFAULT_APPEARANCE_PREFERENCES.wheelZoomSensitivityPercent,
  }
}

export function readAppearancePreferences(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): AppearancePreferences {
  try {
    const stored = storage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY)
    return stored === null
      ? DEFAULT_APPEARANCE_PREFERENCES
      : parseStoredAppearancePreferences(JSON.parse(stored))
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
}

export function writeAppearancePreferences(
  preferences: AppearancePreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): AppearancePreferences {
  const stored: StoredAppearancePreferences = { version: 1, ...preferences }
  try {
    storage.setItem(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Chrome preferences are conveniences; the board must keep working.
  }
  return preferences
}

let snapshot = DEFAULT_APPEARANCE_PREFERENCES
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readAppearancePreferences()
}

export function getAppearancePreferences(): AppearancePreferences {
  hydrate()
  return snapshot
}

export function updateAppearancePreferences(
  patch: Partial<AppearancePreferences>,
): AppearancePreferences {
  hydrate()
  const next = { ...snapshot, ...patch }
  if (
    next.showZoomButtons === snapshot.showZoomButtons
    && next.directWheelZoom === snapshot.directWheelZoom
    && next.scrollDownZoomsIn === snapshot.scrollDownZoomsIn
    && next.modifierWheelZoomsOppositely === snapshot.modifierWheelZoomsOppositely
    && next.wheelZoomSensitivityPercent === snapshot.wheelZoomSensitivityPercent
  ) {
    return snapshot
  }
  snapshot = typeof window === 'undefined' ? next : writeAppearancePreferences(next)
  listeners.forEach((listener) => listener())
  return snapshot
}

export function subscribeAppearancePreferences(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearancePreferences(): AppearancePreferences {
  return useSyncExternalStore(
    subscribeAppearancePreferences,
    getAppearancePreferences,
    () => DEFAULT_APPEARANCE_PREFERENCES,
  )
}
