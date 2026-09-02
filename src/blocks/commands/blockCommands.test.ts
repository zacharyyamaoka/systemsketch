import type { Editor, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
  BLOCK_SHAPE_TYPE,
  BLOCK_TOOL_ID,
  type BlockShape,
  getDefaultBlockProps,
} from '../blockModel'
import {
  appendBlockPort,
  appendBlockPortForInlineEditing,
  getBlockInspectorContext,
  getOnlySelectedBlock,
  moveBlockPort,
  removeBlockPort,
  setBlockView,
  updateBlockDetails,
  updateBlockPort,
} from './blockCommands'
import { fakeBlock, styleTestEditor } from './styleTestEditor'

function blockShape(overrides: Partial<BlockShape['props']> = {}): BlockShape {
  return {
    id: 'shape:block' as TLShapeId,
    typeName: 'shape',
    type: BLOCK_SHAPE_TYPE,
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as BlockShape['index'],
    parentId: 'page:page' as BlockShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { ...getDefaultBlockProps(), ...overrides },
  }
}

function mockEditor(shape = blockShape()) {
  let current = shape
  let selected: BlockShape[] = [shape]
  let tool = 'select'
  const history: string[] = []
  const editor = {
    getShape: (id: TLShapeId) => (id === current.id ? current : undefined),
    getSelectedShapes: () => selected,
    getCurrentToolId: () => tool,
    markHistoryStoppingPoint: (label: string) => {
      history.push(label)
      return `mark:${history.length}`
    },
    updateShape: (partial: { props?: Partial<BlockShape['props']> }) => {
      current = { ...current, props: { ...current.props, ...partial.props } }
      selected = selected.length ? [current] : []
      return editor
    },
  }
  return {
    editor: editor as unknown as Editor,
    current: () => current,
    history,
    select: (next: BlockShape[]) => (selected = next),
    tool: (next: string) => (tool = next),
  }
}

describe('block command integration surface', () => {
  it('only exposes one exactly selected Block', () => {
    const fixture = mockEditor()
    expect(getOnlySelectedBlock(fixture.editor)?.id).toBe(fixture.current().id)
    fixture.select([])
    expect(getOnlySelectedBlock(fixture.editor)).toBeNull()
  })

  it('resolves selected, tool draft, and empty inspector contexts', () => {
    // Resolving the context now reads tldraw's shared styles, so this uses the
    // style-aware fixture. Multi-selection contexts live in
    // `blockStyleCommands.test.ts`.
    const fixture = styleTestEditor([fakeBlock('only')], ['shape:only'])
    expect(getBlockInspectorContext(fixture.editor).kind).toBe('selected')
    fixture.select([])
    fixture.setTool(BLOCK_TOOL_ID)
    expect(getBlockInspectorContext(fixture.editor).kind).toBe('tool')
    fixture.setTool('select')
    expect(getBlockInspectorContext(fixture.editor)).toEqual({ kind: 'empty' })
  })

  it('edits details through one public updateShape call and restores saved view size', () => {
    const fixture = mockEditor(blockShape(
      { views: {
        simple: { w: 210, h: 130 },
        port: { w: 330, h: 240 },
        expanded: { w: 500, h: 410 },
        value: { w: 168, h: 56 },
      } },
    ))
    expect(updateBlockDetails(fixture.editor, fixture.current().id, { title: 'decode' }).ok).toBe(true)
    expect(fixture.current().props.title).toBe('decode')
    expect(updateBlockDetails(fixture.editor, fixture.current().id, {
      icon: 'SquareFunction',
      notes: 'Implementation context',
      portLayout: 'offset',
    }).ok).toBe(true)
    expect(fixture.current().props).toMatchObject({
      icon: 'SquareFunction',
      notes: 'Implementation context',
      portLayout: 'offset',
    })
    expect(setBlockView(fixture.editor, fixture.current().id, 'expanded').ok).toBe(true)
    expect(fixture.current().props).toMatchObject({ view: 'expanded', w: 500, h: 410 })
    expect(fixture.history).toEqual(['edit block', 'edit block', 'show block as expanded'])
  })

  it('keeps stable port ids across edits, visibility, and reorder', () => {
    const fixture = mockEditor(blockShape({ inputs: [], outputs: [] }))
    appendBlockPort(fixture.editor, fixture.current().id, 'inputs', { name: 'packet', type: 'bytes' })
    appendBlockPort(fixture.editor, fixture.current().id, 'inputs', { name: 'encoding' })
    expect(fixture.current().props.inputs.map((port) => port.id)).toEqual(['in_1', 'in_2'])

    updateBlockPort(fixture.editor, fixture.current().id, 'inputs', 'in_1', {
      name: 'payload',
      visible: false,
      defaultValue: 'raw',
    })
    expect(fixture.current().props.inputs[0]).toEqual({
      id: 'in_1',
      name: 'payload',
      type: 'bytes',
      visible: false,
      defaultValue: 'raw',
    })

    moveBlockPort(fixture.editor, fixture.current().id, 'inputs', 'in_2', -1)
    expect(fixture.current().props.inputs.map((port) => port.id)).toEqual(['in_2', 'in_1'])
  })

  it('adds a menu-authored port and reveals the remembered Port view in one undo step', () => {
    const fixture = mockEditor(blockShape({
      inputs: [],
      outputs: [],
      views: {
        simple: { w: 210, h: 130 },
        port: { w: 360, h: 250 },
        expanded: { w: 520, h: 420 },
        value: { w: 168, h: 56 },
      },
    }))

    const result = appendBlockPortForInlineEditing(
      fixture.editor,
      fixture.current().id,
      'outputs',
    )

    expect(result).toMatchObject({ ok: true, port: { id: 'out_1' } })
    expect(fixture.current().props).toMatchObject({ view: 'port', w: 360, h: 250 })
    expect(fixture.current().props.outputs).toEqual([
      { id: 'out_1', name: 'out_1', type: '', visible: true },
    ])
    expect(fixture.history).toEqual(['add block output'])
  })

  it('makes destructive deletion explicit and reports missing ports', () => {
    const fixture = mockEditor(blockShape({ inputs: [], outputs: [] }))
    appendBlockPort(fixture.editor, fixture.current().id, 'outputs')
    expect(removeBlockPort(fixture.editor, fixture.current().id, 'outputs', 'out_1').ok).toBe(true)
    expect(fixture.current().props.outputs).toEqual([])
    expect(removeBlockPort(fixture.editor, fixture.current().id, 'outputs', 'out_1')).toEqual({
      ok: false,
      reason: 'missing-port',
    })
  })
})
