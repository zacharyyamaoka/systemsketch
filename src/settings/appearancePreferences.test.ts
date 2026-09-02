import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseStoredAppearancePreferences,
  readAppearancePreferences,
  writeAppearancePreferences,
} from './appearancePreferences'

describe('appearance preferences', () => {
  it('hides the zoom step buttons by default', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons).toBe(false)
    expect(parseStoredAppearancePreferences(null)).toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('accepts only the current version with a boolean zoom preference', () => {
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true }))
      .toEqual({ showZoomButtons: true })
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: 'yes' }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 2, showZoomButtons: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('persists under the app-level appearance key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    writeAppearancePreferences({ showZoomButtons: true }, storage)
    expect(values.get(APPEARANCE_PREFERENCES_STORAGE_KEY))
      .toBe('{"version":1,"showZoomButtons":true}')
    expect(readAppearancePreferences(storage)).toEqual({ showZoomButtons: true })
  })

  it('falls back safely when storage is unavailable or malformed', () => {
    expect(readAppearancePreferences({ getItem: () => '{bad json' }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(readAppearancePreferences({ getItem: () => { throw new Error('blocked') } }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })
})
