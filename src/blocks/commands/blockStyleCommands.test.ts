import { describe, expect, it } from 'vitest'

import { BlockViewStyle } from '../blockModel'
import { getBlockInspectorContext } from './blockCommands'
import {
  getBlockSelectionStyles,
  getSelectedBlocks,
  getSelectedConnectionCount,
  getSelectedShapesFlat,
  isMixedStyle,
  isSharedStyleValue,
  selectionHasBlockStyles,
  selectionHasConnectionStyles,
  setBlockPortLayoutForSelection,
  setBlockShowDescriptionForSelection,
  setBlockViewForSelection,
  setConnectionRoutingForSelection,
} from './blockStyleCommands'
import {
  fakeBlock,
  fakeConnection,
  fakeGeo,
  fakeGroup,
  styleTestEditor,
} from './styleTestEditor'

describe('Block batch style commands', () => {
  it('reports a shared value when every selected Block agrees', () => {
    const fixture = styleTestEditor([
      fakeBlock('a', { view: 'port' }),
      fakeBlock('b', { view: 'port' }),
      fakeBlock('c', { view: 'port' }),
    ])
    const styles = getBlockSelectionStyles(fixture.editor)

    expect(styles.blockCount).toBe(3)
    expect(styles.view).toEqual({ type: 'shared', value: 'port' })
    expect(isSharedStyleValue(styles.view, 'port')).toBe(true)
    expect(isMixedStyle(styles.view)).toBe(false)
  })

  it('reports mixed when the selection disagrees, and no choice reads as pressed', () => {
    const fixture = styleTestEditor([
      fakeBlock('a', { view: 'port' }),
      fakeBlock('b', { view: 'simple' }),
    ])
    const styles = getBlockSelectionStyles(fixture.editor)

    expect(styles.view).toEqual({ type: 'mixed' })
    expect(isMixedStyle(styles.view)).toBe(true)
    for (const view of ['simple', 'port', 'expanded'] as const) {
      expect(isSharedStyleValue(styles.view, view)).toBe(false)
    }
  })

  it('sees Blocks through a group and ignores shapes that carry no Block style', () => {
    const fixture = styleTestEditor(
      [
        fakeGroup('g'),
        fakeBlock('a', { view: 'simple' }, 'shape:g'),
        fakeBlock('b', { view: 'simple' }, 'shape:g'),
        fakeGeo('rect'),
      ],
      ['shape:g', 'shape:rect'],
    )

    expect(getSelectedShapesFlat(fixture.editor).map((shape) => shape.type))
      .toEqual(['block', 'block', 'geo'])
    expect(getSelectedBlocks(fixture.editor)).toHaveLength(2)
    expect(getBlockSelectionStyles(fixture.editor).view).toEqual({ type: 'shared', value: 'simple' })

    expect(setBlockViewForSelection(fixture.editor, 'expanded').ok).toBe(true)
    expect(fixture.shape('a')?.props.view).toBe('expanded')
    expect(fixture.shape('b')?.props.view).toBe('expanded')
    expect(fixture.shape('rect')?.props.view).toBeUndefined()
  })

  it('delegates the write to tldraw and marks history exactly once per gesture', () => {
    const fixture = styleTestEditor([
      fakeBlock('a', { view: 'simple' }),
      fakeBlock('b', { view: 'port' }),
      fakeBlock('c', { view: 'expanded' }),
    ])

    const result = setBlockViewForSelection(fixture.editor, 'expanded')

    expect(result).toEqual({ ok: true, style: 'systemsketch:blockView', count: 3 })
    expect(fixture.styleWrites).toEqual([
      { style: 'systemsketch:blockView', value: 'expanded' },
    ])
    expect(fixture.historyLabels).toEqual(['show blocks as expanded'])
    expect(getBlockSelectionStyles(fixture.editor).view)
      .toEqual({ type: 'shared', value: 'expanded' })
  })

  it('refuses a no-op and a selection with nothing to write', () => {
    const shared = styleTestEditor([fakeBlock('a', { view: 'port' }), fakeBlock('b', { view: 'port' })])
    expect(setBlockViewForSelection(shared.editor, 'port'))
      .toEqual({ ok: false, reason: 'unchanged' })
    expect(shared.historyLabels).toEqual([])

    const noBlocks = styleTestEditor([fakeGeo('rect')])
    expect(setBlockViewForSelection(noBlocks.editor, 'expanded'))
      .toEqual({ ok: false, reason: 'no-target' })
    expect(noBlocks.styleWrites).toEqual([])
  })

  it('batches port layout and description visibility on the same seam', () => {
    const fixture = styleTestEditor([
      fakeBlock('a', { portLayout: 'inline', showDescription: true }),
      fakeBlock('b', { portLayout: 'offset', showDescription: true }),
    ])

    expect(getBlockSelectionStyles(fixture.editor).portLayout).toEqual({ type: 'mixed' })
    expect(setBlockPortLayoutForSelection(fixture.editor, 'offset').ok).toBe(true)
    expect(getBlockSelectionStyles(fixture.editor).portLayout)
      .toEqual({ type: 'shared', value: 'offset' })

    expect(setBlockShowDescriptionForSelection(fixture.editor, false).ok).toBe(true)
    expect(fixture.shape('a')?.props.showDescription).toBe(false)
    expect(fixture.shape('b')?.props.showDescription).toBe(false)
    expect(fixture.historyLabels)
      .toEqual(['use offset block ports', 'hide block descriptions'])
  })

  it('batches connection routing through the same style path', () => {
    const fixture = styleTestEditor([
      fakeConnection('one', 'curved'),
      fakeConnection('two', 'straight'),
    ])

    expect(getSelectedConnectionCount(fixture.editor)).toBe(2)
    expect(selectionHasConnectionStyles(fixture.editor)).toBe(true)
    expect(selectionHasBlockStyles(fixture.editor)).toBe(false)

    expect(setConnectionRoutingForSelection(fixture.editor, 'straight').ok).toBe(true)
    expect(fixture.shape('one')?.props.routing).toBe('straight')
    expect(fixture.styleWrites)
      .toEqual([{ style: 'systemsketch:connectionRouting', value: 'straight' }])
  })

  it('keeps the Block style ids stable so saved boards and next-shape memory match', () => {
    expect(BlockViewStyle.id).toBe('systemsketch:blockView')
    expect(BlockViewStyle.defaultValue).toBe('simple')
  })
})

describe('Block inspector context under multi-selection', () => {
  it('keeps the single-Block face for exactly one Block', () => {
    const fixture = styleTestEditor([fakeBlock('a')], ['shape:a'])
    expect(getBlockInspectorContext(fixture.editor).kind).toBe('selected')
  })

  it('shows the batch face for several Blocks instead of falling back to empty', () => {
    const fixture = styleTestEditor([
      fakeBlock('a', { view: 'port' }),
      fakeBlock('b', { view: 'expanded' }),
    ])
    const context = getBlockInspectorContext(fixture.editor)

    expect(context.kind).toBe('multi')
    if (context.kind !== 'multi') throw new Error('expected the batch context')
    expect(context.styles.blockCount).toBe(2)
    expect(context.styles.view).toEqual({ type: 'mixed' })
  })

  it('shows the batch face when a Block is selected beside a plain tldraw shape', () => {
    const fixture = styleTestEditor([fakeBlock('a'), fakeGeo('rect')])
    expect(getBlockInspectorContext(fixture.editor).kind).toBe('multi')
  })

  it('stays empty when the selection carries no Block at all', () => {
    const fixture = styleTestEditor([fakeGeo('rect')])
    expect(getBlockInspectorContext(fixture.editor)).toEqual({ kind: 'empty' })
  })
})
