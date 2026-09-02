import { describe, expect, it } from 'vitest'
import {
  ARROW_PRESET_ROUTING,
  DEFAULT_TOOLBAR_PREFERENCES,
  arrowPresetForActivation,
  arrowPresetPressCount,
  arrowPresetsInPressOrder,
  connectionRoutingForArrowPreset,
  nextArrowPreset,
  parseToolbarPreferences,
  shapeToolForArrowPreset,
  type ArrowPreset,
} from './toolbarModel'
import { CONNECTION_ROUTING_KINDS } from '../blocks/connections/connectionModel'

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

describe('elbow is the datum', () => {
  it('starts a fresh app on the elbow arrow', () => {
    expect(DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset).toBe('elbow')
  })

  it('lands the first press of A on elbow, then walks straight and curve', () => {
    let preset = arrowPresetForActivation('select', DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset)
    const walked: ArrowPreset[] = [preset]
    for (let press = 2; press <= 4; press += 1) {
      preset = arrowPresetForActivation('arrow', preset)
      walked.push(preset)
    }
    expect(walked).toEqual(['elbow', 'straight', 'curve', 'elbow'])
  })

  it('numbers each preset by the press that reaches it, in that order', () => {
    expect(arrowPresetsInPressOrder()).toEqual(['elbow', 'straight', 'curve'])
    expect(arrowPresetsInPressOrder().map(arrowPresetPressCount)).toEqual([1, 2, 3])
  })
})

describe('an arrow preset is an edge routing', () => {
  it('maps every preset onto the routing of the same shape', () => {
    expect(connectionRoutingForArrowPreset('elbow')).toBe('elbow')
    expect(connectionRoutingForArrowPreset('curve')).toBe('curved')
    expect(connectionRoutingForArrowPreset('straight')).toBe('straight')
  })

  it('covers every routing the cable layer knows, one preset each', () => {
    const routings = Object.values(ARROW_PRESET_ROUTING)
    expect(new Set(routings)).toEqual(new Set(CONNECTION_ROUTING_KINDS))
    expect(routings).toHaveLength(CONNECTION_ROUTING_KINDS.length)
  })
})

describe('toolbar preference parsing', () => {
  it('keeps valid values and resets invalid fields independently', () => {
    expect(parseToolbarPreferences({
      version: 99,
      lastShapeTool: 'arrow-curve',
      lastArrowPreset: 'sideways',
      lastDrawTool: 'highlight',
      lastSystemTool: 'loop',
    })).toEqual({
      version: 1,
      lastShapeTool: 'arrow-curve',
      lastArrowPreset: DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset,
      lastDrawTool: 'highlight',
      lastSystemTool: DEFAULT_TOOLBAR_PREFERENCES.lastSystemTool,
    })
    expect(parseToolbarPreferences({ lastSystemTool: 'branch' }).lastSystemTool).toBe('branch')
  })

  it('falls back safely for corrupt storage values', () => {
    expect(parseToolbarPreferences(null)).toBe(DEFAULT_TOOLBAR_PREFERENCES)
    expect(parseToolbarPreferences('not an object')).toBe(DEFAULT_TOOLBAR_PREFERENCES)
  })
})

