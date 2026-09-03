import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BlockBatchInspectorContent } from './BlockBatchInspector'
import { BlockSelectionMiniMenu } from './BlockSelectionMiniMenu'

describe('Block batch inspector', () => {
  it('keeps the panel open for a multi-selection and shows the shared controls', () => {
    const html = renderToStaticMarkup(
      <BlockBatchInspectorContent
        blockCount={9}
        view={{ type: 'shared', value: 'port' }}
        portLayout={{ type: 'shared', value: 'inline' }}
        showDescription={{ type: 'shared', value: true }}
        actions={{ setView: () => {}, setPortLayout: () => {}, setShowDescription: () => {} }}
      />,
    )

    expect(html).toContain('aria-label="Block inspector"')
    expect(html).toContain('Batch edit')
    expect(html).not.toContain('9 Blocks selected')
    expect(html).toContain('data-block-count="9"')
    expect(html).not.toContain('Select a Block to inspect it')

    const sections = ['View', 'Ports', 'Display', 'Per-Block']
    let previous = -1
    for (const section of sections) {
      const position = html.indexOf(`data-inspector-section="${section}"`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    }
    expect(html).not.toContain('Mixed')
  })

  it('marks a disagreeing selection as Mixed with no choice pressed', () => {
    const html = renderToStaticMarkup(
      <BlockBatchInspectorContent
        blockCount={3}
        view={{ type: 'mixed' }}
        portLayout={{ type: 'mixed' }}
        showDescription={{ type: 'mixed' }}
        actions={{ setView: () => {}, setPortLayout: () => {}, setShowDescription: () => {} }}
      />,
    )

    expect(html).toContain('Batch edit')
    expect(html).not.toContain('3 Blocks selected')
    expect(html.match(/Mixed/g)).toHaveLength(3)
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('never offers the identity-bearing fields as a batch write', () => {
    const html = renderToStaticMarkup(
      <BlockBatchInspectorContent
        blockCount={4}
        view={{ type: 'shared', value: 'expanded' }}
        portLayout={{ type: 'shared', value: 'offset' }}
        showDescription={{ type: 'shared', value: false }}
      />,
    )

    expect(html).not.toContain('Block title')
    expect(html).not.toContain('Block type')
    expect(html).not.toContain('Detailed block notes')
    expect(html).not.toContain('Add input port')
    expect(html).toContain('Select a single Block to edit them.')
    // No actions supplied: every control is inert rather than silently no-op.
    expect(html).toContain('disabled=""')
  })
})

describe('Block selection mini menu under multi-selection', () => {
  it('keeps the shared view pressed without a selected-count summary', () => {
    const html = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'port' }}
        onSetView={() => {}}
      />,
    )

    expect(html).toContain('aria-label="Selected Block actions"')
    expect(html).not.toContain('9 Blocks')
    expect(html).toContain('data-view="port"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('Inspect')
    expect(html).not.toContain('Step in')
    // FigJam and Excalidraw both keep Delete out of the floating pill; the key
    // and the right-click menu are the delete paths.
    expect(html).not.toContain('Delete')
  })

  it('presses nothing while the batch disagrees', () => {
    const html = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'mixed' }}
        onSetView={() => {}}
      />,
    )

    expect(html).toContain('data-view="mixed"')
    expect(html).not.toContain('aria-pressed="true"')
  })
})
