import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from '../blockModel'
import { createValueBlockProps } from '../valueBlock'
import { createClockTriggerProps, createSelectProps, createSetAttributesProps } from '../stockBlocks'
import { BlockInspectorContent, type BlockInspectorActions } from './BlockInspector'
import { BlockSelectionMiniMenu } from './BlockSelectionMiniMenu'

describe('Block inspector content', () => {
	it('gives stock Blocks their honest configuration and batched member controls', () => {
		const setAttributes = renderToStaticMarkup(
			<BlockInspectorContent props={createSetAttributesProps()} status="selected" actions={noopActions} />,
		)
		expect(setAttributes).toContain('data-inspector-section="Set attributes"')
		expect(setAttributes).toContain('data-testid="set-attributes-add-member"')
		expect(setAttributes).toContain('preserve every member not listed')
		expect(setAttributes).toContain('Source update semantics unresolved')

		const select = renderToStaticMarkup(
			<BlockInspectorContent props={createSelectProps()} status="selected" actions={noopActions} />,
		)
		expect(select).toContain('true_value if condition else false_value')

		const clock = renderToStaticMarkup(
			<BlockInspectorContent props={createClockTriggerProps()} status="selected" actions={noopActions} />,
		)
		expect(clock).toContain('data-inspector-section="Clock trigger"')
		expect(clock).toContain('aria-label="Clock trigger rate in hertz"')
		expect(clock).toContain('Clock · 10 Hz. This prototype declares intent and does not schedule.')
		expect(clock).toContain('Clock annotation')
		expect(clock).toContain('derived Clock source/rate declaration stays visible')
		expect(clock).not.toContain('Shown at a glance')
	})

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
    expect(html).not.toContain('Semantic roles belong to individual port rows')
		expect(html).not.toContain('aria-label="Semantic role for inputs packet"')
		expect(html).not.toContain('aria-label="Semantic role for outputs message"')
		expect((html.match(/>Tags<\/button>/g) ?? [])).toHaveLength(2)
		expect(html.indexOf('>Tags</button>')).toBeLessThan(html.indexOf('>1 visible</button>'))
		expect(html).toContain('aria-label="Show Inputs semantic tags"')
		expect(html).toContain('aria-label="Show Outputs semantic tags"')
		expect(html).toContain('aria-controls="inspector-semantic-tags-inputs"')
		expect(html).toContain('aria-controls="inspector-semantic-tags-outputs"')
		expect(html).toMatch(/aria-expanded="false" aria-controls="inspector-semantic-tags-inputs" aria-label="Show Inputs semantic tags"/)
		expect(html).toMatch(/aria-expanded="false" aria-controls="inspector-semantic-tags-outputs" aria-label="Show Outputs semantic tags"/)
    expect(html).toContain('Icon: SquareFunction. Change icon')
    expect(html).toContain('value="raw"')
    expect(html).toContain('aria-label="Port layout"')
    expect(html).toContain('Aligned shares rows between inputs and outputs; offset stacks the outputs below the inputs.')

    const offset = html.indexOf('>offset<')
    const aligned = html.indexOf('>aligned<')
    expect(offset).toBeGreaterThan(-1)
    expect(aligned).toBeGreaterThan(offset)

    const sections = ['Block', 'View', 'Inputs', 'Outputs', 'Ports']
    let previous = -1
    for (const section of sections) {
      const position = html.indexOf(`data-inspector-section="${section}"`)
      expect(position).toBeGreaterThan(previous)
      previous = position
    }
  })

  it('keeps rare variadic-slot authoring in an inspector disclosure', () => {
    const html = renderToStaticMarkup(
      <BlockInspectorContent
        props={{
          ...getDefaultBlockProps(),
          inputs: [{
            id: 'overlay-boxes', name: 'overlay_box', type: 'Layer', visible: true,
            variadic: { groupId: 'positional:overlays', label: '*overlays', kind: 'positional', bundled: false },
          }],
        }}
        status="selected"
        actions={noopActions}
      />,
    )
    expect(html).toContain('data-testid="inspector-variadic-overlay-boxes"')
    expect(html).toContain('Variadic · *overlays')
    expect(html).toContain('aria-label="Variadic role for overlay_box"')
    expect(html).toContain('<option value="positional" selected="">*args</option>')
    expect(html).toContain('aria-label="Variadic group label for overlay_box"')
    expect(html).toContain('title="A bundled spread is one unknown-cardinality *iterable or **mapping expression"')
  })

  it('keeps an unplaced tool state honest and read-only without adding a New block header', () => {
    const html = renderToStaticMarkup(
      <BlockInspectorContent props={getDefaultBlockProps()} status="new" />,
    )
    expect(html).toContain('Place a Block to edit these defaults.')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('New block')
  })

  it('names blank inspector fields by role instead of supplying legacy sample content', () => {
    const block = renderToStaticMarkup(
      <BlockInspectorContent
        props={{
          ...getDefaultBlockProps(),
          inputs: [{ id: 'in_1', name: '', type: '', visible: true }],
        }}
        status="selected"
        actions={noopActions}
      />,
    )
    const pill = renderToStaticMarkup(
      <BlockInspectorContent
        props={createValueBlockProps(getDefaultBlockProps(), '')}
        status="selected"
        actions={noopActions}
        pill={{ fedBy: null, fedType: null, feeds: [] }}
      />,
    )
    const notes = renderToStaticMarkup(
      <BlockInspectorContent
        props={getDefaultBlockProps()}
        status="selected"
        actions={noopActions}
        initialTab="notes"
      />,
    )

    for (const role of ['Display description', 'Title', 'Type', 'Name', 'Default']) {
      expect(block).toContain(`placeholder="${role}"`)
    }
    expect(notes).toContain('placeholder="Notes"')
    for (const role of ['Name', 'Value', 'Type']) {
      expect(pill).toContain(`placeholder="${role}"`)
    }
    for (const legacyExample of ['build_report', 'call', 'gain', '2.0', 'float']) {
      expect(block).not.toContain(`placeholder="${legacyExample}"`)
      expect(pill).not.toContain(`placeholder="${legacyExample}"`)
      expect(notes).not.toContain(`placeholder="${legacyExample}"`)
    }
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
        depthAction={{ direction: 'in', onSelect() {} }}
      />,
    )
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('Selected Block actions')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Step in')
    expect(html).not.toContain('Inspect')
    expect(html).toContain('data-testid="block-pill-view-expanded"')
    expect(html).toContain('aria-label="Show expanded view"')
    expect(html).not.toContain('block-pill-view-value')
    expect(html).not.toContain('Show value view')
  })

  it('offers Step in only when the selected Block is Expanded', () => {
    const port = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'port' }}
        onSetView={() => {}}
      />,
    )
    const expanded = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'expanded' }}
        onSetView={() => {}}
        depthAction={{ direction: 'in', onSelect() {} }}
      />,
    )

    expect(port).not.toContain('Step in')
    expect(expanded).toContain('Step in')
  })

  it('does not render Block presentation controls for a Value capsule', () => {
    const html = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'value' }}
        onSetView={() => {}}
      />,
    )
    expect(html).toBe('')
  })

  it('turns the active scope action into Step out', () => {
    const html = renderToStaticMarkup(
      <BlockSelectionMiniMenu
        view={{ type: 'shared', value: 'expanded' }}
        onSetView={() => {}}
        depthAction={{ direction: 'out', onSelect() {} }}
      />,
    )

    expect(html).toContain('data-depth-action="out"')
    expect(html).toContain('Step out')
    expect(html).not.toContain('Step in')
  })
})

const noopActions: BlockInspectorActions = {
  updateDetails() {},
  setView() {},
  addPort() {},
  updatePort() {},
  removePort() {},
  movePort() {},
  movePortToSection() {},
}

describe('the Pill section', () => {
  it('replaces the Block sections for a value-view Block and says what feeds it', () => {
    const pill = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
    const html = renderToStaticMarkup(
      <BlockInspectorContent
        props={pill}
        status="selected"
        pill={{ fedBy: 'estimate() · pose', fedType: 'Pose', feeds: ['encode() · pose'] }}
      />,
    )
    expect(html).toContain('data-inspector-section="Pill"')
    expect(html).toContain('aria-label="Variable name"')
    expect(html).toContain('aria-label="Literal value"')
    expect(html).toContain('aria-label="Variable type"')
    expect(html).toContain('Connected from estimate() · pose')
    expect(html).toContain('Feeds encode() · pose')
    for (const section of ['Block', 'Tags', 'View', 'Inputs', 'Outputs', 'Ports']) {
      expect(html).not.toContain(`data-inspector-section="${section}"`)
    }
  })

  it('keeps the literal editable when a cable feeds the inlet and exposes explicit adoption', () => {
    const pill = createValueBlockProps(getDefaultBlockProps(), '2.0', 'gain')
    const unfed = renderToStaticMarkup(
      <BlockInspectorContent props={pill} status="selected" actions={noopActions} pill={{ fedBy: null, fedType: null, feeds: [] }} />,
    )
    expect(unfed).toContain('Inlet unwired')
    expect(unfed).toContain('aria-label="Literal value" value="2.0"')
    expect(unfed).not.toContain('disabled="" aria-label="Literal value"')
    const fed = renderToStaticMarkup(
      <BlockInspectorContent props={pill} status="selected" actions={noopActions} pill={{ fedBy: 'decode() · frame', fedType: 'Frame', feeds: [] }} />,
    )
    expect(fed).not.toContain('disabled="" aria-label="Literal value"')
    expect(fed).toContain('Connected from decode() · frame')
    expect(fed).toContain('Adopt cable type')
  })
})
