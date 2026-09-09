import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseStoredAppearancePreferences,
  readAppearancePreferences,
  writeAppearancePreferences,
} from './appearancePreferences'

describe('appearance preferences', () => {
  it('uses stock wheel navigation and compact controls by default', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons).toBe(false)
    expect(DEFAULT_APPEARANCE_PREFERENCES.directWheelZoom).toBe(false)
    expect(DEFAULT_APPEARANCE_PREFERENCES.scrollDownZoomsIn).toBe(true)
    expect(DEFAULT_APPEARANCE_PREFERENCES.modifierWheelZoomsOppositely).toBe(false)
    expect(DEFAULT_APPEARANCE_PREFERENCES.wheelZoomSensitivityPercent).toBe(100)
    expect(parseStoredAppearancePreferences(null)).toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('accepts only the current version with boolean appearance preferences', () => {
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, directWheelZoom: true, scrollDownZoomsIn: false, modifierWheelZoomsOppositely: true, wheelZoomSensitivityPercent: 125 }))
      .toEqual({ showZoomButtons: true, directWheelZoom: true, scrollDownZoomsIn: false, modifierWheelZoomsOppositely: true, wheelZoomSensitivityPercent: 125 })
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: 'yes', directWheelZoom: false, scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 100 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, directWheelZoom: false, scrollDownZoomsIn: 'yes', wheelZoomSensitivityPercent: 100 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, directWheelZoom: false, scrollDownZoomsIn: true, modifierWheelZoomsOppositely: 'yes', wheelZoomSensitivityPercent: 100 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, directWheelZoom: 'yes', scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 100 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, directWheelZoom: false, scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 153 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 2, showZoomButtons: true, directWheelZoom: false, scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 100 }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('defaults a field a stored record predates, rather than discarding the whole record', () => {
    // Simulates an older localStorage record: its saved value must survive
    // while newly introduced fields receive their own defaults.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true }))
      .toEqual({
        showZoomButtons: true,
        directWheelZoom: false,
        scrollDownZoomsIn: true,
        modifierWheelZoomsOppositely: false,
        wheelZoomSensitivityPercent: 100,
      })
  })

  it('ignores a stored key the current schema no longer defines', () => {
    // Simulates a record written before a preference was retired: the extra
    // key must not corrupt or reset the rest of the record.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, punctuatedPortRow: false }))
      .toEqual({
        showZoomButtons: true,
        directWheelZoom: false,
        scrollDownZoomsIn: true,
        modifierWheelZoomsOppositely: false,
        wheelZoomSensitivityPercent: 100,
      })
  })

  it('persists under the app-level appearance key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    writeAppearancePreferences({
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 75,
    }, storage)
    expect(values.get(APPEARANCE_PREFERENCES_STORAGE_KEY))
      .toBe('{"version":1,"showZoomButtons":true,"directWheelZoom":true,"scrollDownZoomsIn":false,"modifierWheelZoomsOppositely":true,"wheelZoomSensitivityPercent":75}')
    expect(readAppearancePreferences(storage))
      .toEqual({ showZoomButtons: true, directWheelZoom: true, scrollDownZoomsIn: false, modifierWheelZoomsOppositely: true, wheelZoomSensitivityPercent: 75 })
  })

  it('falls back safely when storage is unavailable or malformed', () => {
    expect(readAppearancePreferences({ getItem: () => '{bad json' }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(readAppearancePreferences({ getItem: () => { throw new Error('blocked') } }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })
})
