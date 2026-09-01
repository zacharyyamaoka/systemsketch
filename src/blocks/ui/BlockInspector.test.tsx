import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from '../blockModel'
import { BlockInspectorContent } from './BlockInspector'
import { BlockSelectionMiniMenu } from './BlockSelectionMiniMenu'

describe('Block inspector content', () => {
  it('renders the donor information architecture without the old selected header or Connections tab', () => {
    const html = renderToStaticMarkup(
      <BlockInspectorContent
        props={{
          ...getDefaultBlockProps(),
          title: 'decode',
          blockType: 'call',
          icon: 'SquareFunction',
          description: 'Decode one packet',
          inputs: [{ id: 'in_1', name: 'packet', type: 'bytes', visible: true, defaultValue: 'raw' }],
          outputs: [{ id: 'out_1', name: 'message', type: 'str', visible: true }],
        }}
        status="selected"
      />,
    )
    expect(html).toContain('aria-label="Block inspector"')
    expect(html).toContain('decode')
    expect(html).toContain('>Details<')
    expect(html).toContain('Notes')
    expect(html).not.toContain('Connections')
    expect(html).not.toContain('block-inspector__header')
    expect(html).not.toContain('block-inspector__eyebrow')
    expect(html).not.toContain('>Selected<')
    expect(html).not.toContain('right-popout')
    expect(html).toContain('Add tags')
    expect(html).toContain('Icon: SquareFunction. Change icon')
    expect(html).toContain('value="raw"')
    expect(html).toContain('aria-label="Port layout"')
    expect(html).toContain('Aligned shares rows between inputs and outputs; offset stacks the outputs below the inputs.')

    const offset = html.indexOf('>offset<')
    const aligned = html.indexOf('>aligned<')
    expect(offset).toBeGreaterThan(-1)
    expect(aligned).toBeGreaterThan(offset)

    const sections = ['Block', 'Tags', 'View', 'Inputs', 'Outputs', 'Ports']
    let previous = -1
    for (const section of sections) {
      const position = html.indexOf(`data-inspector-section="${section}"`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    }
  })

  it('keeps an unplaced tool state honest and read-only without adding a New block header', () => {
    const html = renderToStaticMarkup(
      <BlockInspectorContent props={getDefaultBlockProps()} status="new" />,
    )
    expect(html).toContain('Place a Block to edit these defaults.')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('New block')
  })

  it('renders the donor Notes editing surface from Block data', () => {
    const html = renderToStaticMarkup(
      <BlockInspectorContent
        props={{ ...getDefaultBlockProps(), notes: 'Implementation context' }}
        initialTab="notes"
      />,
    )
    expect(html).toContain('aria-label="Detailed notes"')
    expect(html).toContain('aria-label="Detailed block notes"')
    expect(html).toContain('Implementation context')
    expect(html).not.toContain('not stored by the current SystemSketch Block model')
    expect(html).not.toContain('data-inspector-section="Block"')
  })

  it('renders mini-menu content for a public contextual-toolbar host', () => {
    const html = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'expanded' }}
        onSetView={() => {}}
        onOpenInspector={() => {}}
        onStepInto={() => {}}
      />,
    )
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('Selected Block actions')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Step in')
    expect(html).toContain('Inspect')
  })

  it('offers Step in only when the selected Block is Expanded', () => {
    const port = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'port' }}
        onSetView={() => {}}
        onOpenInspector={() => {}}
      />,
    )
    const expanded = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'expanded' }}
        onSetView={() => {}}
        onOpenInspector={() => {}}
        onStepInto={() => {}}
      />,
    )

    expect(port).not.toContain('Step in')
    expect(expanded).toContain('Step in')
  })
})
