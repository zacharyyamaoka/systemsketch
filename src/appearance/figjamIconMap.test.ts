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
    // There is now literally one entry to share: a shape's chips and a
    // connector's bare row are the same control at two layouts, so the icons
    // cannot drift the way they had (the connector's Dotted option was being
    // drawn by the arrowhead renderer).
    expect(FIGJAM_TRIGGER_ICON.lineStyle).toBe('trigger/Line style')
    expect(FIGJAM_TRIGGER_ICON.strokeColor).toBe('trigger/Line style')
    expect(Object.keys(FIGJAM_ICON_FOR)).not.toContain('dash')
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
    // tldraw has nine arrowheads to FigJam's six, and a `dotted` dash and an
    // `async` cadence FigJam draws neither of.
    expect(figjamIconName('arrowheadEnd', 'pipe')).toBeUndefined()
    expect(figjamIconName('size', 'l')).toBeUndefined()
    expect(figjamIconName('lineStyle', 'dotted')).toBeUndefined()
    expect(figjamIconName('lineStyle', 'async')).toBeUndefined()
  })

  it('gives the two weights SystemSketch offers FigJam\'s two weight icons', () => {
    // The weight row is the one place these are read: `m` is what everything
    // is created at, `xl` is the thick rung beside it.
    expect(figjamIconName('size', 'm')).toBe('line-style/Thin')
    expect(figjamIconName('size', 'xl')).toBe('line-style/Thick')
  })
})
