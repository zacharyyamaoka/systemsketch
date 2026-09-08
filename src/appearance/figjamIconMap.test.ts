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

  it('never resolves geo through this map — it always draws its own vendored icon', () => {
    // The shape picker used to fall through to FigJam's traced 'shape/*'
    // icons (and, for `oval`, a special-cased original glyph ahead of them —
    // FigJam has no icon distinct from its own Ellipse). Zach: "switch to
    // the actual [tldraw] ones" — `geo` is now `ownDrawing` in
    // AppearanceGlyph.tsx's GLYPH_FAMILIES, so this map is never even
    // consulted for it; keeping a 'shape/*' entry here would be dead data a
    // reader could mistake for the live path.
    expect(FIGJAM_ICON_FOR.geo).toBeUndefined()
    expect(figjamIconName('geo', 'triangle')).toBeUndefined()
  })

  it('keeps each control in its own namespace', () => {
    // FigJam calls two different icons `Triangle`; keying on the bare name is
    // what let an arrowhead leak into the shape library. `align`'s "Text
    // align left" and `arrowheadEnd`'s own triangle are unrelated controls
    // that still must not share a drawn face.
    expect(figjamIconName('align', 'start')).toBe('align/Text align left')
    expect(figjamIconName('arrowheadEnd', 'inverted')).toBe('arrowhead/Triangle')
    expect(FIGJAM_ICONS['align/Text align left']).not.toEqual(FIGJAM_ICONS['arrowhead/Triangle'])
  })

  it('gives the ONE Line shape control FigJam\'s three icons, one per canonical value', () => {
    // Three StyleProps (arrow kind, line spline, cable routing) reach the menu
    // as one control in one vocabulary; only that vocabulary is mapped, so a
    // raw style value leaking through would fall back to the drawn glyph and
    // be visible rather than silently passing for FigJam's icon.
    const names = Object.values(FIGJAM_ICON_FOR.lineShape ?? {})
    expect(names.every((name) => name.startsWith('line-shape/'))).toBe(true)
    expect(figjamIconName('lineShape', 'elbow')).toBe('line-shape/Elbowed')
    expect(figjamIconName('lineShape', 'curve')).toBe('line-shape/Curved')
    expect(figjamIconName('lineShape', 'straight')).toBe('line-shape/Straight')
    expect(figjamIconName('lineShape', 'cubic')).toBeUndefined()
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
