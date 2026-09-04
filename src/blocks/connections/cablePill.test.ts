import { describe, expect, it } from 'vitest'

import { PILL_POSITION_DEFAULT, clampPillPosition } from './connectionModel'
import { cablePillLabel, delayPillWidth } from './connectionPresentation'

describe('cable pill', () => {
  it('is one object that differs only in what it says', () => {
    expect(cablePillLabel({ temporal: 'delayed' })).toBe('z⁻¹')
    expect(cablePillLabel({ temporal: 'data', effect: true })).toBe('mut')
  })

  it('names the initial value a delayed cable carries', () => {
    expect(cablePillLabel({ temporal: 'delayed', delayValue: '1.0' })).toBe('z⁻¹ = 1.0')
    expect(cablePillLabel({ temporal: 'delayed', delayValue: '   ' })).toBe('z⁻¹')
  })

  it('says both when a cable is both — a mutation read next time round', () => {
    expect(cablePillLabel({ temporal: 'delayed', effect: true })).toBe('mut z⁻¹')
    expect(cablePillLabel({ temporal: 'delayed', delayValue: '0', effect: true }))
      .toBe('mut z⁻¹ = 0')
  })

  it('reads what it is before when it is', () => {
    // `mut z⁻¹`, never `z⁻¹ mut`: the kind of value first, then its timing.
    const both = cablePillLabel({ temporal: 'delayed', effect: true })!
    expect(both.indexOf('mut')).toBeLessThan(both.indexOf('z⁻¹'))
  })

  it('is absent from an ordinary cable, and from an async one', () => {
    expect(cablePillLabel({ temporal: 'data' })).toBeNull()
    expect(cablePillLabel({ temporal: 'async' })).toBeNull()
    expect(cablePillLabel({ temporal: 'data', effect: false })).toBeNull()
  })

  it('sizes itself from its own text, whatever that text is', () => {
    expect(delayPillWidth('mut')).toBeLessThan(delayPillWidth('mut z⁻¹ = 1.0'))
    expect(delayPillWidth('z⁻¹')).toBeGreaterThan(0)
  })

  it('shares one position rule, so both spawn and slide the same way', () => {
    expect(clampPillPosition(Number.NaN)).toBe(PILL_POSITION_DEFAULT)
    expect(clampPillPosition(-1)).toBeGreaterThan(0)
    expect(clampPillPosition(2)).toBeLessThan(1)
  })
})
