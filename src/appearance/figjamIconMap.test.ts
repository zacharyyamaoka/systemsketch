import { describe, expect, it } from 'vitest'

import {
  FIGJAM_CHECK_ICON,
  FIGJAM_EYEDROPPER_ICON,
  FIGJAM_ICON_FOR,
  FIGJAM_TRIGGER_ICON,
  figjamIconName,
} from './figjamIconMap'
import { FIGJAM_ICONS } from './figjamIcons'

describe('FigJam icon map', () => {
  it('never names an icon that was not traced', () => {
    // A missing key does not throw — it silently falls back to a drawn glyph,
    // which is exactly how the shape picker came to draw arrowheads for
    // `triangle` and `diamond`. The mapping is only safe if it is checked.
    const missing: string[] = []
    for (const [control, values] of Object.entries(FIGJAM_ICON_FOR)) {
      for (const [value, icon] of Object.entries(values ?? {})) {
        if (!FIGJAM_ICONS[icon]) missing.push(`${control}.${value} -> ${icon}`)
      }
    }
    for (const [control, icon] of Object.entries(FIGJAM_TRIGGER_ICON)) {
      if (!FIGJAM_ICONS[icon]) missing.push(`trigger ${control} -> ${icon}`)
    }
    for (const icon of [FIGJAM_CHECK_ICON, FIGJAM_EYEDROPPER_ICON]) {
      if (!FIGJAM_ICONS[icon]) missing.push(icon)
    }
    expect(missing).toEqual([])
  })

  it('gives a shape and a connector the same Line style icons', () => {
    // One trigger icon and one set of dash icons, whichever pill they are on:
    // that is what FigJam does, and what the muscle memory is for.
    expect(FIGJAM_TRIGGER_ICON.dash).toBe('trigger/Line style')
    expect(FIGJAM_TRIGGER_ICON.lineStyle).toBe('trigger/Line style')
    expect(FIGJAM_ICON_FOR.lineStyle).toEqual(FIGJAM_ICON_FOR.dash)
    expect(figjamIconName('lineStyle', 'dashed')).toBe('line-style/Dashed')
  })

  it('keeps each control in its own namespace', () => {
    // FigJam calls two different icons `Triangle`; keying on the bare name is
    // what let an arrowhead leak into the shape library.
    expect(figjamIconName('geo', 'triangle')).toBe('shape/Triangle')
    expect(figjamIconName('arrowheadEnd', 'inverted')).toBe('arrowhead/Triangle')
    expect(FIGJAM_ICONS['shape/Triangle']).not.toEqual(FIGJAM_ICONS['arrowhead/Triangle'])
  })

  it('gives all three line-shape styles the same three icons', () => {
    for (const control of ['connectionRouting', 'arrowKind', 'spline'] as const) {
      const names = Object.values(FIGJAM_ICON_FOR[control] ?? {})
      expect(names.every((name) => name.startsWith('line-shape/'))).toBe(true)
    }
    expect(figjamIconName('connectionRouting', 'straight')).toBe('line-shape/Straight')
    expect(figjamIconName('spline', 'line')).toBe('line-shape/Straight')
  })

  it('says nothing for a value FigJam has no icon for', () => {
    // tldraw has nine arrowheads to FigJam's six, and four sizes to its two.
    expect(figjamIconName('arrowheadEnd', 'pipe')).toBeUndefined()
    expect(figjamIconName('size', 'm')).toBeUndefined()
    expect(figjamIconName('dash', 'draw')).toBeUndefined()
  })
})
