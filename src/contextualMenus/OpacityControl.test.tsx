import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MIXED_LABEL } from './contextualControlRegistry'
import { OpacityControl } from './OpacityControl'

function markup(value: number | 'mixed' | null) {
  return renderToStaticMarkup(
    <OpacityControl value={value} onChange={vi.fn()} label="Opacity" />,
  )
}

describe('OpacityControl', () => {
  it('renders the slider with Excalidraw-parity range/step and the current percent', () => {
    const html = markup(40)
    expect(html).toContain('data-testid="systemsketch-opacity-slider"')
    expect(html).toContain('min="0"')
    expect(html).toContain('max="100"')
    expect(html).toContain('step="10"')
    expect(html).toContain('value="40"')
    expect(html).toContain('40%')
    expect(html).not.toContain('data-mixed')
  })

  it('marks a mixed selection with data-mixed and the shared MIXED_LABEL, thumb pinned to full', () => {
    const html = markup('mixed')
    expect(html).toContain('data-mixed="true"')
    expect(html).toContain('value="100"')
    expect(html).toContain(MIXED_LABEL)
    expect(html).not.toContain('100%')
  })

  it('renders nothing when no participant in the target has an opacity to show', () => {
    expect(markup(null)).toBe('')
  })

  it('renders the given label', () => {
    expect(markup(75)).toContain('Opacity')
  })
})
