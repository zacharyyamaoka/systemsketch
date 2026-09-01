import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_STORAGE_KEY,
  interfaceScaleCssValues,
  normalizeInterfaceScale,
  parseStoredInterfaceScale,
  readInterfaceScale,
  writeInterfaceScale,
} from './interfaceScale'

describe('interface scale preference', () => {
  it('clamps and snaps scale values to safe five-percent increments', () => {
    expect(normalizeInterfaceScale(77)).toBe(80)
    expect(normalizeInterfaceScale(113)).toBe(115)
    expect(normalizeInterfaceScale(999)).toBe(160)
    expect(normalizeInterfaceScale(Number.NaN)).toBe(DEFAULT_INTERFACE_SCALE)
  })

  it('rejects malformed or unknown stored preference versions', () => {
    expect(parseStoredInterfaceScale({ version: 1, percent: 125 })).toBe(125)
    expect(parseStoredInterfaceScale({ version: 2, percent: 125 })).toBe(DEFAULT_INTERFACE_SCALE)
    expect(parseStoredInterfaceScale('125')).toBe(DEFAULT_INTERFACE_SCALE)
  })

  it('persists independently under the app-level preference key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    expect(writeInterfaceScale(127, storage)).toBe(125)
    expect(values.get(INTERFACE_SCALE_STORAGE_KEY)).toBe('{"version":1,"percent":125}')
    expect(readInterfaceScale(storage)).toBe(125)
  })

  it('provides matching scale and inverse CSS values', () => {
    expect(interfaceScaleCssValues(125)).toEqual({ scale: '1.25', inverse: '0.8' })
  })
})
