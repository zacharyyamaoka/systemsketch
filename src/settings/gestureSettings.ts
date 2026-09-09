import { useSyncExternalStore } from 'react'

export const GESTURE_SETTINGS_STORAGE_KEY = 'systemsketch.gestures.v1'

/**
 * What a wheel gesture can be bound to. Deliberately small — every entry has
 * to be implementable with tldraw's own public editor API, no engine forks.
 *
 * WHY no `next-page`/`prev-page`, unlike the tldraw_styling_lab this shipped
 * from: SystemSketch pins `maxPages: 1` (see `canvasCamera.ts`) — structural
 * depth replaces pages here, so a page-turn command would be a permanent,
 * confusing no-op in this product.
 */
export type WheelCommand =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-up'
  | 'pan-down'
  | 'pan-left'
  | 'pan-right'
  | 'undo'
  | 'redo'

export const WHEEL_COMMAND_LABELS: Record<WheelCommand, string> = {
  'none': 'Nothing',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  'pan-up': 'Pan up',
  'pan-down': 'Pan down',
  'pan-left': 'Pan left',
  'pan-right': 'Pan right',
  'undo': 'Undo',
  'redo': 'Redo',
}

/** The four wheel gestures Settings → Canvas can rebind. */
export type WheelGesture = 'wheelDown' | 'wheelUp' | 'ctrlWheelDown' | 'ctrlWheelUp'

export const WHEEL_GESTURE_LABELS: Record<WheelGesture, string> = {
  wheelDown: 'Scroll wheel down',
  wheelUp: 'Scroll wheel up',
  ctrlWheelDown: 'Ctrl + scroll wheel down',
  ctrlWheelUp: 'Ctrl + scroll wheel up',
}

export interface GestureSettings {
  /** Paste (and duplicate) at the pointer rather than at the viewport centre.
   *  Applied through tldraw's own `isPasteAtCursorMode` user preference —
   *  see `canvasGestures.ts` — never a hand-rolled paste listener. */
  pasteUnderCursor: boolean
  bindings: Record<WheelGesture, WheelCommand>
  /**
   * Pan and zoom speed as a PERCENTAGE of tldraw's own, applied through
   * `editor.setCameraOptions({ panSpeed, zoomSpeed })` — see
   * `canvasGestures.ts` (pan) and `canvasCamera.ts` (zoom, shared with the
   * Direct wheel zoom mode's own sensitivity). A percentage of the stock
   * value, not a raw multiplier, keeps 100 the obvious reset point and
   * matches `appearancePreferences.ts`'s existing `wheelZoomSensitivityPercent`
   * convention.
   */
  panSpeedPercent: number
  zoomSpeedPercent: number
}

/** The range an exact value may take. Clamped rather than free: 0 would
 *  freeze the canvas with no obvious way back, and past ~400% a single wheel
 *  notch crosses the whole board. */
export const MIN_SPEED_PERCENT = 5
export const MAX_SPEED_PERCENT = 400
export const SPEED_PERCENT_STEP = 5

export function clampSpeedPercent(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(MAX_SPEED_PERCENT, Math.max(MIN_SPEED_PERCENT, Math.round(value)))
}

/**
 * WHY these particular defaults: they are what tldraw — and SystemSketch's
 * existing stock navigation contract (`canvasCamera.ts`) — already does, so a
 * fresh load behaves exactly like today and the feature only ever shows up
 * once someone opts into a change. Plain wheel pans the canvas vertically,
 * Ctrl/Cmd + wheel zooms: the same convention `wheel_zoom_smoke.mjs` already
 * pins as the product's first-run contract. `pasteUnderCursor` is on because
 * that is what `pasteAtCursor.ts` already, unconditionally, does today.
 */
export const DEFAULT_GESTURE_SETTINGS: GestureSettings = Object.freeze({
  pasteUnderCursor: true,
  bindings: Object.freeze({
    wheelDown: 'pan-down',
    wheelUp: 'pan-up',
    ctrlWheelDown: 'zoom-out',
    ctrlWheelUp: 'zoom-in',
  }),
  panSpeedPercent: 100,
  zoomSpeedPercent: 100,
})

interface StoredGestureSettings extends GestureSettings {
  version: 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCommand(value: unknown): value is WheelCommand {
  return typeof value === 'string' && value in WHEEL_COMMAND_LABELS
}

function isSpeedPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_SPEED_PERCENT && value <= MAX_SPEED_PERCENT
}

/**
 * Read persisted settings, repairing anything unrecognised back to the
 * default — one field at a time, the same contract `appearancePreferences.ts`
 * uses. A binding added in a later version, or one hand-edited to nonsense,
 * should cost the user that one binding, not silently reset the whole record.
 */
export function parseStoredGestureSettings(value: unknown): GestureSettings {
  if (!isRecord(value) || value.version !== 1) return DEFAULT_GESTURE_SETTINGS
  const { pasteUnderCursor, bindings, panSpeedPercent, zoomSpeedPercent } = value

  if (
    (pasteUnderCursor !== undefined && typeof pasteUnderCursor !== 'boolean')
    || (bindings !== undefined && !isRecord(bindings))
    || (panSpeedPercent !== undefined && !isSpeedPercent(panSpeedPercent))
    || (zoomSpeedPercent !== undefined && !isSpeedPercent(zoomSpeedPercent))
  ) {
    return DEFAULT_GESTURE_SETTINGS
  }

  const repairedBindings = { ...DEFAULT_GESTURE_SETTINGS.bindings }
  if (isRecord(bindings)) {
    for (const gesture of Object.keys(repairedBindings) as WheelGesture[]) {
      const candidate = bindings[gesture]
      if (isCommand(candidate)) repairedBindings[gesture] = candidate
    }
  }

  return {
    pasteUnderCursor: typeof pasteUnderCursor === 'boolean'
      ? pasteUnderCursor
      : DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
    bindings: repairedBindings,
    panSpeedPercent: isSpeedPercent(panSpeedPercent)
      ? clampSpeedPercent(panSpeedPercent)
      : DEFAULT_GESTURE_SETTINGS.panSpeedPercent,
    zoomSpeedPercent: isSpeedPercent(zoomSpeedPercent)
      ? clampSpeedPercent(zoomSpeedPercent)
      : DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
  }
}

export function readGestureSettings(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): GestureSettings {
  try {
    const stored = storage.getItem(GESTURE_SETTINGS_STORAGE_KEY)
    return stored === null ? DEFAULT_GESTURE_SETTINGS : parseStoredGestureSettings(JSON.parse(stored))
  } catch {
    return DEFAULT_GESTURE_SETTINGS
  }
}

export function writeGestureSettings(
  settings: GestureSettings,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): GestureSettings {
  const stored: StoredGestureSettings = { version: 1, ...settings }
  try {
    storage.setItem(GESTURE_SETTINGS_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Private mode, quota, a blocked origin — none of which should stop the
    // setting working for THIS session.
  }
  return settings
}

let snapshot = DEFAULT_GESTURE_SETTINGS
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readGestureSettings()
}

export function getGestureSettings(): GestureSettings {
  hydrate()
  return snapshot
}

export function updateGestureSettings(patch: Partial<GestureSettings>): GestureSettings {
  hydrate()
  const next: GestureSettings = { ...snapshot, ...patch }
  snapshot = typeof window === 'undefined' ? next : writeGestureSettings(next)
  listeners.forEach((listener) => listener())
  return snapshot
}

export function subscribeGestureSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGestureSettings(): GestureSettings {
  return useSyncExternalStore(subscribeGestureSettings, getGestureSettings, () => DEFAULT_GESTURE_SETTINGS)
}
