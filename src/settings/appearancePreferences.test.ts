import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseStoredAppearancePreferences,
  readAppearancePreferences,
  writeAppearancePreferences,
} from './appearancePreferences'

describe('appearance preferences', () => {
  it('uses compact controls, standard down-to-zoom-in, and punctuated Inputs by default', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons).toBe(false)
    expect(DEFAULT_APPEARANCE_PREFERENCES.scrollDownZoomsIn).toBe(true)
    expect(DEFAULT_APPEARANCE_PREFERENCES.wheelZoomSensitivityPercent).toBe(100)
    expect(DEFAULT_APPEARANCE_PREFERENCES.punctuatedPortRow).toBe(true)
    expect(parseStoredAppearancePreferences(null)).toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('accepts only the current version with boolean appearance preferences', () => {
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, scrollDownZoomsIn: false, wheelZoomSensitivityPercent: 125, punctuatedPortRow: false }))
      .toEqual({ showZoomButtons: true, scrollDownZoomsIn: false, wheelZoomSensitivityPercent: 125, punctuatedPortRow: false })
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: 'yes', scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 100, punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, scrollDownZoomsIn: 'yes', wheelZoomSensitivityPercent: 100, punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 153, punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 2, showZoomButtons: true, scrollDownZoomsIn: true, wheelZoomSensitivityPercent: 100, punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('defaults a field a stored record predates, rather than discarding the whole record', () => {
    // Simulates an older localStorage record: its saved value must survive
    // while newly introduced fields receive their own defaults.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true }))
      .toEqual({
        showZoomButtons: true,
        scrollDownZoomsIn: true,
        wheelZoomSensitivityPercent: 100,
        punctuatedPortRow: true,
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
      scrollDownZoomsIn: false,
      wheelZoomSensitivityPercent: 75,
      punctuatedPortRow: false,
    }, storage)
    expect(values.get(APPEARANCE_PREFERENCES_STORAGE_KEY))
      .toBe('{"version":1,"showZoomButtons":true,"scrollDownZoomsIn":false,"wheelZoomSensitivityPercent":75,"punctuatedPortRow":false}')
    expect(readAppearancePreferences(storage))
      .toEqual({ showZoomButtons: true, scrollDownZoomsIn: false, wheelZoomSensitivityPercent: 75, punctuatedPortRow: false })
  })

  it('falls back safely when storage is unavailable or malformed', () => {
    expect(readAppearancePreferences({ getItem: () => '{bad json' }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(readAppearancePreferences({ getItem: () => { throw new Error('blocked') } }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })
})
