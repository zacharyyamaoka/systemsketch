import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOLBAR_PREFERENCES,
  arrowPresetForActivation,
  nextArrowPreset,
  parseToolbarPreferences,
  shapeToolForArrowPreset,
} from './toolbarModel'

describe('toolbar arrow recall', () => {
  it('cycles straight, curve, elbow, then back to straight', () => {
    expect(nextArrowPreset('straight')).toBe('curve')
    expect(nextArrowPreset('curve')).toBe('elbow')
    expect(nextArrowPreset('elbow')).toBe('straight')
  })

  it('recalls the last preset when entering Arrow and cycles only while Arrow is active', () => {
    expect(arrowPresetForActivation('select', 'curve')).toBe('curve')
    expect(arrowPresetForActivation('geo', 'elbow')).toBe('elbow')
    expect(arrowPresetForActivation('arrow', 'curve')).toBe('elbow')
  })

  it('maps arrow presets to the remembered Shape-family slot', () => {
    expect(shapeToolForArrowPreset('straight')).toBe('arrow-straight')
    expect(shapeToolForArrowPreset('curve')).toBe('arrow-curve')
    expect(shapeToolForArrowPreset('elbow')).toBe('arrow-elbow')
  })
})

describe('toolbar preference parsing', () => {
  it('keeps valid values and resets invalid fields independently', () => {
    expect(parseToolbarPreferences({
      version: 99,
      lastShapeTool: 'arrow-curve',
      lastArrowPreset: 'sideways',
      lastDrawTool: 'highlight',
    })).toEqual({
      version: 1,
      lastShapeTool: 'arrow-curve',
      lastArrowPreset: DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset,
      lastDrawTool: 'highlight',
    })
  })

  it('falls back safely for corrupt storage values', () => {
    expect(parseToolbarPreferences(null)).toBe(DEFAULT_TOOLBAR_PREFERENCES)
    expect(parseToolbarPreferences('not an object')).toBe(DEFAULT_TOOLBAR_PREFERENCES)
  })
})

