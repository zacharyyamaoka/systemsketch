import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArrangeControls, ArrangeTrigger, type ArrangeAction, type ArrangeActionGroup } from './ArrangeControls'

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
const Z_ORDER_GROUP: ArrangeActionGroup = { id: 'z-order', actions: Z_ORDER }

const ALIGN_HORIZONTAL: ArrangeAction[] = [
  { id: 'alignLeft', label: 'Align left', icon: icon('align-left') },
  { id: 'alignCenterH', label: 'Align center', icon: icon('align-center-h') },
  { id: 'alignRight', label: 'Align right', icon: icon('align-right') },
]
const ALIGN_VERTICAL: ArrangeAction[] = [
  { id: 'alignTop', label: 'Align top', icon: icon('align-top') },
  { id: 'alignCenterV', label: 'Align middle', icon: icon('align-center-v') },
  { id: 'alignBottom', label: 'Align bottom', icon: icon('align-bottom') },
]
const DISTRIBUTE: ArrangeAction[] = [
  { id: 'distributeHorizontal', label: 'Distribute horizontally', icon: icon('distribute-h') },
  { id: 'distributeVertical', label: 'Distribute vertically', icon: icon('distribute-v') },
]

describe('ArrangeControls', () => {
  it('renders exactly the given z-order actions in order, no divider for a single group', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls groups={[Z_ORDER_GROUP]} onAction={vi.fn()} />,
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

  it('divides every additional group from its neighbour — the segmenting idea applied to align and distribute too', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        groups={[
          Z_ORDER_GROUP,
          { id: 'align-horizontal', actions: ALIGN_HORIZONTAL },
          { id: 'align-vertical', actions: ALIGN_VERTICAL },
          { id: 'distribute', actions: DISTRIBUTE },
        ]}
        onAction={vi.fn()}
      />,
    )
    // Three dividers for four groups — one between each pair, never a
    // leading or trailing one.
    expect(html.split('data-testid="systemsketch-arrange-divider"').length - 1).toBe(3)
    for (const action of [...ALIGN_HORIZONTAL, ...ALIGN_VERTICAL, ...DISTRIBUTE]) {
      expect(html).toContain(`data-testid="systemsketch-arrange-${action.id}"`)
    }
    expect(html).toContain('data-testid="systemsketch-arrange-group-z-order"')
    expect(html).toContain('data-testid="systemsketch-arrange-group-align-horizontal"')
    expect(html).toContain('data-testid="systemsketch-arrange-group-align-vertical"')
    expect(html).toContain('data-testid="systemsketch-arrange-group-distribute"')
  })

  it('drops an empty group silently, along with the divider it would have cost', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        groups={[Z_ORDER_GROUP, { id: 'align-horizontal', actions: [] }, { id: 'distribute', actions: DISTRIBUTE }]}
        onAction={vi.fn()}
      />,
    )
    expect(html).not.toContain('systemsketch-arrange-group-align-horizontal')
    // Exactly one divider — between z-order and distribute — not two.
    expect(html.split('data-testid="systemsketch-arrange-divider"').length - 1).toBe(1)
  })

  it('honors the disabled set and leaves everything else enabled', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        groups={[Z_ORDER_GROUP]}
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
      <ArrangeControls groups={[{ id: 'z-order', actions: [Z_ORDER[0]] }]} onAction={vi.fn()} />,
    )
    expect(html).toContain('type="button"')
    expect(html).toContain('title="Send to back"')
    expect(html).toContain('aria-label="Send to back"')
    expect(html).toContain('systemsketch-arrange__button')
  })

  it('defaults to the row layout with vertical dividers', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        groups={[Z_ORDER_GROUP, { id: 'distribute', actions: DISTRIBUTE }]}
        onAction={vi.fn()}
      />,
    )
    expect(html).toContain('data-layout="row"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).not.toContain('aria-orientation="horizontal"')
  })

  it('stacks for the popover panel, turning every divider horizontal', () => {
    const html = renderToStaticMarkup(
      <ArrangeControls
        layout="stack"
        groups={[
          Z_ORDER_GROUP,
          { id: 'align-horizontal', actions: ALIGN_HORIZONTAL },
          { id: 'distribute', actions: DISTRIBUTE },
        ]}
        onAction={vi.fn()}
      />,
    )
    expect(html).toContain('data-layout="stack"')
    // Two rules for three stacked groups, and every one of them announced the
    // way it is actually drawn — a stacked panel has no vertical rules.
    expect(html.split('aria-orientation="horizontal"').length - 1).toBe(2)
    expect(html).not.toContain('aria-orientation="vertical"')
    // The disclosure changes the layout and nothing else: the same twelve
    // actions still render, still grouped, still in order.
    for (const action of [...Z_ORDER, ...ALIGN_HORIZONTAL, ...DISTRIBUTE]) {
      expect(html).toContain(`data-testid="systemsketch-arrange-${action.id}"`)
    }
  })
})

describe('ArrangeTrigger', () => {
  it('renders one labelled button carrying the supplied glyph and the pill chevron', () => {
    const html = renderToStaticMarkup(
      <ArrangeTrigger icon={icon('align-left')} label="Arrange" />,
    )
    expect(html).toContain('data-testid="systemsketch-arrange-trigger"')
    expect(html).toContain('type="button"')
    expect(html).toContain('title="Arrange"')
    expect(html).toContain('aria-label="Arrange"')
    expect(html).toContain('data-icon="align-left"')
    expect(html).toContain('systemsketch-arrange__chevron')
    // The whole point of the change: the cluster's own buttons are NOT in the
    // pill's row beside the trigger.
    expect(html).not.toContain('systemsketch-arrange__button')
  })

  it('spreads the props Radix injects through TldrawUiPopoverTrigger asChild', () => {
    // Not decoration: `TldrawUiPopoverTrigger` is `Popover.Trigger asChild`, so
    // the trigger opens nothing at all if this component swallows what Radix
    // hands it. Static markup can see the ARIA half of that contract.
    const html = renderToStaticMarkup(
      <ArrangeTrigger
        icon={icon('align-left')}
        label="Arrange"
        aria-expanded={false}
        aria-haspopup="dialog"
        data-state="closed"
        className="extra-class"
      />,
    )
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('data-state="closed"')
    expect(html).toContain('systemsketch-arrange__trigger extra-class')
  })
})
