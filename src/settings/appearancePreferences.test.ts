import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  parseStoredAppearancePreferences,
  readAppearancePreferences,
  writeAppearancePreferences,
} from './appearancePreferences'

describe('appearance preferences', () => {
  it('hides the zoom step buttons by default, and punctuates the Inputs row by default', () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons).toBe(false)
    expect(DEFAULT_APPEARANCE_PREFERENCES.punctuatedPortRow).toBe(true)
    expect(parseStoredAppearancePreferences(null)).toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('accepts only the current version with a boolean zoom preference', () => {
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, punctuatedPortRow: false }))
      .toEqual({ showZoomButtons: true, punctuatedPortRow: false })
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: 'yes', punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseStoredAppearancePreferences({ version: 2, showZoomButtons: true, punctuatedPortRow: true }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })

  it('defaults a field a stored record predates, rather than discarding the whole record', () => {
    // Simulates localStorage written before punctuatedPortRow existed: the
    // zoom preference a user already set must survive, not silently reset.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true }))
      .toEqual({ showZoomButtons: true, punctuatedPortRow: true })
  })

  it('persists under the app-level appearance key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    writeAppearancePreferences({ showZoomButtons: true, punctuatedPortRow: false }, storage)
    expect(values.get(APPEARANCE_PREFERENCES_STORAGE_KEY))
      .toBe('{"version":1,"showZoomButtons":true,"punctuatedPortRow":false}')
    expect(readAppearancePreferences(storage))
      .toEqual({ showZoomButtons: true, punctuatedPortRow: false })
  })

  it('falls back safely when storage is unavailable or malformed', () => {
    expect(readAppearancePreferences({ getItem: () => '{bad json' }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(readAppearancePreferences({ getItem: () => { throw new Error('blocked') } }))
      .toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })
})
