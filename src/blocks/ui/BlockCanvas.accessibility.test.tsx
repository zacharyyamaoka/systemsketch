import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  BlockPortAddButton,
  expandedDividerKeyboardTarget,
  expandedDividerLimits,
  expandedDividerWeightsAt,
} from './BlockCanvas'

const ADJUST = {
  prevKey: 'row:1',
  nextKey: 'row:2',
  prevWeight: 1,
  nextWeight: 3,
  rangeTop: 0,
  rangeBottom: 100,
  prevMin: 20,
  nextMin: 30,
}

describe('Block canvas keyboard affordances', () => {
  it('renders Add Port as a named native button', () => {
    const html = renderToStaticMarkup(
      <BlockPortAddButton
        label="Add input port to Transform on canvas"
        title="Add input port"
        testId="block-port-add-inputs"
        style={{ left: 12, top: 34 }}
        onAdd={() => {}}
      />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="Add input port to Transform on canvas"')
    expect(html).not.toContain('tabindex="-1"')
  })

  it('maps fine, coarse, and boundary keys onto the legal divider travel', () => {
    expect(expandedDividerLimits(ADJUST)).toEqual({ min: 20, max: 70 })
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'ArrowUp')).toBe(41)
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'ArrowDown')).toBe(49)
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'ArrowDown', true)).toBe(61)
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'Home')).toBe(20)
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'End')).toBe(70)
    expect(expandedDividerKeyboardTarget(ADJUST, 69, 'ArrowDown')).toBe(70)
    expect(expandedDividerKeyboardTarget(ADJUST, 45, 'Enter')).toBeNull()
  })

  it('uses the pointer weight equation for keyboard positions too', () => {
    const result = expandedDividerWeightsAt(ADJUST, 45)

    expect(result).not.toBeNull()
    expect(result?.y).toBe(45)
    expect(result?.previous).toBeCloseTo(1.8)
    expect(result?.next).toBeCloseTo(2.2)
    expect((result?.previous ?? 0) + (result?.next ?? 0)).toBeCloseTo(4)

    expect(expandedDividerWeightsAt(ADJUST, -100)?.y).toBe(20)
    expect(expandedDividerWeightsAt(ADJUST, 1000)?.y).toBe(70)
  })
})
