import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArrangeControls, type ArrangeAction } from './ArrangeControls'

function icon(name: string) {
  function Icon({ className }: { className?: string }) {
    return <svg data-icon={name} className={className} />
  }
  Icon.displayName = `Icon(${name})`
  return Icon
}

const Z_ORDER: ArrangeAction[] = [
  { id: 'sendToBack', label: 'Send to back', icon: icon('send-to-back') },
  { id: 'sendBackward', label: 'Send backward', icon: icon('send-backward') },
  { id: 'bringForward', label: 'Bring forward', icon: icon('bring-forward') },
  { id: 'bringToFront', label: 'Bring to front', icon: icon('bring-to-front') },
]

const ALIGN: ArrangeAction[] = [
  { id: 'alignLeft', label: 'Align left', icon: icon('align-left') },
  { id: 'alignCenterH', label: 'Align center', icon: icon('align-center-h') },
  { id: 'alignRight', label: 'Align right', icon: icon('align-right') },
  { id: 'alignTop', label: 'Align top', icon: icon('align-top') },
  { id: 'alignCenterV', label: 'Align middle', icon: icon('align-center-v') },
  { id: 'alignBottom', label: 'Align bottom', icon: icon('align-bottom') },
  { id: 'distributeHorizontal', label: 'Distribute horizontally', icon: icon('distribute-h') },
  { id: 'distributeVertical', label: 'Distribute vertically', icon: icon('distribute-v') },
]

describe('ArrangeControls', () => {
  it('renders exactly the given z-order actions in order, no align group when align is omitted', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls zOrder={Z_ORDER} onAction={vi.fn()} />,
    )
    const order = Z_ORDER.map((a) => `data-testid="systemsketch-arrange-${a.id}"`)
    let searchFrom = 0
    for (const testid of order) {
      const at = html.indexOf(testid, searchFrom)
      expect(at).toBeGreaterThanOrEqual(0)
      searchFrom = at + testid.length
    }
    expect(html).not.toContain('systemsketch-arrange-divider')
    expect(html).not.toContain('systemsketch-arrange-alignLeft')
  })

  it('renders the align+distribute group and a divider when align is provided', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls zOrder={Z_ORDER} align={ALIGN} onAction={vi.fn()} />,
    )
    expect(html).toContain('data-testid="systemsketch-arrange-divider"')
    for (const action of ALIGN) {
      expect(html).toContain(`data-testid="systemsketch-arrange-${action.id}"`)
    }
    expect(html).toContain('data-testid="systemsketch-arrange-group-z-order"')
    expect(html).toContain('data-testid="systemsketch-arrange-group-align"')
  })

  it('honors the disabled set and leaves everything else enabled', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        zOrder={Z_ORDER}
        onAction={vi.fn()}
        disabled={new Set(['sendToBack', 'bringToFront'])}
      />,
    )
    const sendToBackAt = html.indexOf('systemsketch-arrange-sendToBack')
    const sendToBackButton = html.slice(sendToBackAt, html.indexOf('>', sendToBackAt))
    expect(sendToBackButton).toContain('disabled')
    const sendBackwardAt = html.indexOf('systemsketch-arrange-sendBackward')
    const sendBackwardButton = html.slice(sendBackwardAt, html.indexOf('>', sendBackwardAt))
    expect(sendBackwardButton).not.toContain('disabled')
  })

  it('uses plain type="button" elements with title and aria-label set from the action label', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls zOrder={[Z_ORDER[0]]} onAction={vi.fn()} />,
    )
    expect(html).toContain('type="button"')
    expect(html).toContain('title="Send to back"')
    expect(html).toContain('aria-label="Send to back"')
    expect(html).toContain('systemsketch-arrange__button')
  })
})
