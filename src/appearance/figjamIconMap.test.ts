import { describe, expect, it } from 'vitest'

import { FIGJAM_ICON_FOR, figjamIconName } from './figjamIconMap'
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
    expect(missing).toEqual([])
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
