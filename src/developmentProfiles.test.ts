import { describe, expect, it } from 'vitest'
import {
  developmentPersistenceKey,
  developmentProfileLabel,
  orderDevelopmentPresets,
  resolveDevelopmentProfile,
} from './developmentProfiles'

describe('development composition profiles', () => {
  it('resolves only named profiles and otherwise keeps the product entry point', () => {
    expect(resolveDevelopmentProfile('')).toBe('product')
    expect(resolveDevelopmentProfile('?preset=block-dev')).toBe('block-dev')
    expect(resolveDevelopmentProfile('?preset=stock&previewClone=abc')).toBe('stock')
    expect(resolveDevelopmentProfile('?preset=unregistered')).toBe('product')
  })

  it('labels the mounted profile after launch', () => {
    expect(developmentProfileLabel('product')).toBe('Latest Preview')
    expect(developmentProfileLabel('block-dev')).toBe('Block Dev')
    expect(developmentProfileLabel('stock')).toBe('Stock tldraw')
  })

  it('keeps every development composition on an independent stock-tldraw store', () => {
    expect(developmentPersistenceKey('block-dev')).toBe('systemsketch-development-block-dev-v1')
    expect(developmentPersistenceKey('stock')).toBe('systemsketch-development-stock-v1')
    expect(developmentPersistenceKey('block-dev')).not.toBe(developmentPersistenceKey('stock'))
  })

  it('moves recent presets first without inventing unavailable entries', () => {
    expect(orderDevelopmentPresets(['stock']).map((preset) => preset.id)).toEqual(['stock', 'block-dev'])
    expect(orderDevelopmentPresets(['retired', 'block-dev']).map((preset) => preset.id)).toEqual([
      'block-dev',
      'stock',
    ])
  })
})
