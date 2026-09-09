import { describe, expect, it } from 'vitest'
import {
  clampSpeedPercent,
  DEFAULT_GESTURE_SETTINGS,
  GESTURE_SETTINGS_STORAGE_KEY,
  MAX_SPEED_PERCENT,
  MIN_SPEED_PERCENT,
  parseStoredGestureSettings,
  readGestureSettings,
  writeGestureSettings,
} from './gestureSettings'

describe('gesture settings', () => {
  it('defaults to the stock wheel contract, unmodified speed, and paste under cursor on', () => {
    expect(DEFAULT_GESTURE_SETTINGS.bindings).toEqual({
      wheelDown: 'pan-down',
      wheelUp: 'pan-up',
      ctrlWheelDown: 'zoom-out',
      ctrlWheelUp: 'zoom-in',
    })
    expect(DEFAULT_GESTURE_SETTINGS.panSpeedPercent).toBe(100)
    expect(DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent).toBe(100)
    expect(DEFAULT_GESTURE_SETTINGS.pasteUnderCursor).toBe(true)
    expect(parseStoredGestureSettings(null)).toBe(DEFAULT_GESTURE_SETTINGS)
  })

  it('clamps to the supported range and rounds to a whole percent', () => {
    expect(clampSpeedPercent(0)).toBe(MIN_SPEED_PERCENT)
    expect(clampSpeedPercent(1000)).toBe(MAX_SPEED_PERCENT)
    expect(clampSpeedPercent(137.6)).toBe(138)
    expect(clampSpeedPercent(Number.NaN)).toBe(100)
  })

  it('accepts a fully custom record from the current version', () => {
    expect(parseStoredGestureSettings({
      version: 1,
      pasteUnderCursor: false,
      bindings: { wheelDown: 'zoom-in', wheelUp: 'zoom-out', ctrlWheelDown: 'undo', ctrlWheelUp: 'redo' },
      panSpeedPercent: 25,
      zoomSpeedPercent: 300,
    })).toEqual({
      pasteUnderCursor: false,
      bindings: { wheelDown: 'zoom-in', wheelUp: 'zoom-out', ctrlWheelDown: 'undo', ctrlWheelUp: 'redo' },
      panSpeedPercent: 25,
      zoomSpeedPercent: 300,
    })
  })

  it('repairs one bad binding without discarding the other three', () => {
    expect(parseStoredGestureSettings({
      version: 1,
      bindings: { wheelDown: 'teleport', wheelUp: 'zoom-out', ctrlWheelDown: 'undo', ctrlWheelUp: 'redo' },
    })).toEqual({
      pasteUnderCursor: DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
      bindings: { wheelDown: 'pan-down', wheelUp: 'zoom-out', ctrlWheelDown: 'undo', ctrlWheelUp: 'redo' },
      panSpeedPercent: DEFAULT_GESTURE_SETTINGS.panSpeedPercent,
      zoomSpeedPercent: DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
    })
  })

  it('discards a dropped command this product no longer offers, like a page turn', () => {
    expect(parseStoredGestureSettings({
      version: 1,
      bindings: { wheelDown: 'next-page', wheelUp: 'pan-up', ctrlWheelDown: 'zoom-out', ctrlWheelUp: 'zoom-in' },
    })).toEqual(DEFAULT_GESTURE_SETTINGS)
  })

  it('resets the whole record when a field is present with the wrong type', () => {
    expect(parseStoredGestureSettings({ version: 1, pasteUnderCursor: 'yes' })).toBe(DEFAULT_GESTURE_SETTINGS)
    expect(parseStoredGestureSettings({ version: 1, panSpeedPercent: 1000 })).toBe(DEFAULT_GESTURE_SETTINGS)
    expect(parseStoredGestureSettings({ version: 2, panSpeedPercent: 150 })).toBe(DEFAULT_GESTURE_SETTINGS)
  })

  it('defaults a field a stored record predates, rather than discarding the whole record', () => {
    expect(parseStoredGestureSettings({ version: 1, panSpeedPercent: 200 })).toEqual({
      pasteUnderCursor: DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
      bindings: DEFAULT_GESTURE_SETTINGS.bindings,
      panSpeedPercent: 200,
      zoomSpeedPercent: DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
    })
  })

  it('persists under its own storage key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    writeGestureSettings({
      pasteUnderCursor: false,
      bindings: { wheelDown: 'zoom-in', wheelUp: 'zoom-out', ctrlWheelDown: 'pan-down', ctrlWheelUp: 'pan-up' },
      panSpeedPercent: 60,
      zoomSpeedPercent: 140,
    }, storage)
    expect(values.has(GESTURE_SETTINGS_STORAGE_KEY)).toBe(true)
    expect(readGestureSettings(storage)).toEqual({
      pasteUnderCursor: false,
      bindings: { wheelDown: 'zoom-in', wheelUp: 'zoom-out', ctrlWheelDown: 'pan-down', ctrlWheelUp: 'pan-up' },
      panSpeedPercent: 60,
      zoomSpeedPercent: 140,
    })
  })

  it('falls back safely when storage is unavailable or malformed', () => {
    expect(readGestureSettings({ getItem: () => '{bad json' })).toBe(DEFAULT_GESTURE_SETTINGS)
    expect(readGestureSettings({ getItem: () => { throw new Error('blocked') } })).toBe(DEFAULT_GESTURE_SETTINGS)
  })
})
