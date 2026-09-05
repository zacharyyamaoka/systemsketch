import { useSyncExternalStore } from 'react'

export const APPEARANCE_PREFERENCES_STORAGE_KEY = 'systemsketch.appearance.v1'

export interface AppearancePreferences {
  showZoomButtons: boolean
  /** The Inputs row reads as `name: type = default` — Name, Type and
   * Default all in monospace, the ':' / '=' muted rather than full-ink.
   * Chosen over a bolder full-ink treatment and over hiding '=' until a
   * default exists; defaults on, with the plain row kept reachable here. */
  punctuatedPortRow: boolean
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = Object.freeze({
  showZoomButtons: false,
  punctuatedPortRow: true,
})

interface StoredAppearancePreferences extends AppearancePreferences {
  version: 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseStoredAppearancePreferences(value: unknown): AppearancePreferences {
  if (!isRecord(value) || value.version !== 1) {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
  const { showZoomButtons, punctuatedPortRow } = value
  // A field the stored record predates is `undefined`, not wrong — that
  // should fall back to its own default, not discard a real value the user
  // already set for every other field. A field that's present with the
  // wrong type means the record is corrupt, and the whole thing resets.
  if (
    (showZoomButtons !== undefined && typeof showZoomButtons !== 'boolean')
    || (punctuatedPortRow !== undefined && typeof punctuatedPortRow !== 'boolean')
  ) {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
  return {
    showZoomButtons: typeof showZoomButtons === 'boolean'
      ? showZoomButtons
      : DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons,
    punctuatedPortRow: typeof punctuatedPortRow === 'boolean'
      ? punctuatedPortRow
      : DEFAULT_APPEARANCE_PREFERENCES.punctuatedPortRow,
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
    && next.punctuatedPortRow === snapshot.punctuatedPortRow
  ) {
    return snapshot
  }
  snapshot = typeof window === 'undefined' ? next : writeAppearancePreferences(next)
  listeners.forEach((listener) => listener())
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearancePreferences(): AppearancePreferences {
  return useSyncExternalStore(
    subscribe,
    getAppearancePreferences,
    () => DEFAULT_APPEARANCE_PREFERENCES,
  )
}
