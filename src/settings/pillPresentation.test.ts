import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PILL_PRESENTATION,
  PILL_PRESENTATION_STORAGE_KEY,
  normalizePillLayout,
  normalizePillSkin,
  parseStoredPillPresentation,
  readPillPresentation,
  writePillPresentation,
} from './pillPresentation'

describe('pill presentation preference', () => {
  it('normalizes unknown layout and skin values back to default', () => {
    expect(normalizePillLayout('v1')).toBe('v1')
    expect(normalizePillLayout('v3')).toBe('v3')
    expect(normalizePillLayout('bogus')).toBe('default')
    expect(normalizePillLayout(undefined)).toBe('default')

    expect(normalizePillSkin('3')).toBe('3')
    expect(normalizePillSkin('9')).toBe('default')
    expect(normalizePillSkin(null)).toBe('default')
  })

  it('rejects malformed or unknown stored preference versions', () => {
    expect(parseStoredPillPresentation({ version: 1, layout: 'v1', skin: '2', compare: true }))
      .toEqual({ layout: 'v1', skin: '2', compare: true })
    expect(parseStoredPillPresentation({ version: 2, layout: 'v1', skin: '2', compare: true }))
      .toEqual(DEFAULT_PILL_PRESENTATION)
    expect(parseStoredPillPresentation('nonsense')).toEqual(DEFAULT_PILL_PRESENTATION)
  })

  it('persists independently under the app-level preference key', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    expect(writePillPresentation({ layout: 'v3', skin: '5', compare: true }, storage))
      .toEqual({ layout: 'v3', skin: '5', compare: true })
    expect(values.get(PILL_PRESENTATION_STORAGE_KEY))
      .toBe('{"version":1,"layout":"v3","skin":"5","compare":true}')
    expect(readPillPresentation(storage)).toEqual({ layout: 'v3', skin: '5', compare: true })
  })

  it('defaults to the shipped pill — off, no layout, no skin', () => {
    expect(DEFAULT_PILL_PRESENTATION).toEqual({ layout: 'default', skin: 'default', compare: false })
  })
})
