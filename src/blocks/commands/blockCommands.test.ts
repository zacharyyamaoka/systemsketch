import type { Editor, TLAssetId, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
  BLOCK_SHAPE_TYPE,
  BLOCK_TOOL_ID,
  blockIconRef,
  type BlockShape,
  getDefaultBlockProps,
} from '../blockModel'
import { encodeBlockIcon } from '../ui/iconPicker/iconRef'
import {
  appendBundleMember,
  appendBlockPort,
  appendBlockPortForInlineEditing,
  getBlockInspectorContext,
  getOnlySelectedBlock,
  linkBlockPortRangeProps,
  moveBlockPort,
  moveBlockPortProps,
  moveBlockPortToSectionProps,
  removeBlockPort,
  removeBlockPortProps,
  setBlockView,
  toggleBlockPortLinkSeamProps,
  updateBlockDetails,
  updateBlockPort,
} from './blockCommands'
import { fakeBlock, styleTestEditor } from './styleTestEditor'
import { createBundleProps } from '../stockBlocks'

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
  let readonly = false
  const history: string[] = []
  const editor = {
    getShape: (id: TLShapeId) => (id === current.id ? current : undefined),
    getSelectedShapes: () => selected,
    getCurrentToolId: () => tool,
    getIsReadonly: () => readonly,
    isShapeOrAncestorLocked: (id: TLShapeId) => (id === current.id ? current.isLocked : false),
    markHistoryStoppingPoint: (label: string) => {
      history.push(label)
      return `mark:${history.length}`
    },
    // WHY this deliberately does NOT delete an omitted key: it stands in for
    // tldraw's own updateShape, which merges `props` key-by-key onto the
    // stored record (applyPartialToRecordWithProps in @tldraw/editor) and
    // leaves a key the caller's object doesn't mention at its OLD value —
    // never clears it. A fake that "helpfully" deleted omitted keys would
    // hide exactly the bug updateBlockProps's removed-keys branch exists to
    // work around; see the WHY at that branch in blockCommands.ts.
    updateShape: (partial: { props?: Partial<BlockShape['props']> }) => {
      current = { ...current, props: { ...current.props, ...partial.props } }
      selected = selected.length ? [current] : []
      return editor
    },
    run: (fn: () => void) => fn(),
    store: {
      update: (id: TLShapeId, updater: (record: BlockShape) => BlockShape) => {
        if (id !== current.id) return
        current = updater(current)
        selected = selected.length ? [current] : []
      },
    },
  }
  return {
    editor: editor as unknown as Editor,
    current: () => current,
    history,
    select: (next: BlockShape[]) => (selected = next),
    tool: (next: string) => (tool = next),
    setReadonly: (next: boolean) => (readonly = next),
    setLocked: (next: boolean) => (current = { ...current, isLocked: next }),
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

  it('deletes a stored assetId once an upload no longer applies, not just leaves it undefined', () => {
    // The bug this proves fixed: tldraw's real updateShape merges `props`
    // key-by-key onto the stored record and only ever adds or overwrites a
    // key present in the object it's given — a key the caller omits is left
    // at its OLD value, never cleared. `mockEditor`'s `updateShape` fake
    // deliberately reproduces that exact merge (see its own WHY above), so
    // this test only passes because `updateBlockProps`'s removed-keys branch
    // follows it with a direct `editor.store.update` deleting the key —
    // exactly what a plain object-spread merge, real or fake, cannot do.
    const ASSET_ID = 'asset:icon1' as TLAssetId
    const fixture = mockEditor(blockShape())
    expect(fixture.current().props).not.toHaveProperty('assetId')

    // "uploads": a real command call, same shape as BlockInspector.tsx's own.
    expect(updateBlockDetails(
      fixture.editor,
      fixture.current().id,
      encodeBlockIcon({ kind: 'asset', assetId: ASSET_ID }),
    ).ok).toBe(true)
    expect(blockIconRef(fixture.current().props)).toEqual({ kind: 'asset', assetId: ASSET_ID })

    // "picks a Lucide icon": the key must be gone, not merely undefined.
    expect(updateBlockDetails(
      fixture.editor,
      fixture.current().id,
      encodeBlockIcon({ kind: 'lucide', name: 'Boxes' }),
    ).ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(fixture.current().props, 'assetId')).toBe(false)
    expect(blockIconRef(fixture.current().props)).toEqual({ kind: 'lucide', name: 'Boxes' })

    // "Remove": still gone, kind:'none'.
    expect(updateBlockDetails(
      fixture.editor,
      fixture.current().id,
      encodeBlockIcon({ kind: 'none' }),
    ).ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(fixture.current().props, 'assetId')).toBe(false)
    expect(blockIconRef(fixture.current().props)).toEqual({ kind: 'none' })

    // A single real editor.undo() proving the pair of writes (updateShape +
    // the store.update that deletes assetId) coalesce into one history step
    // needs a real tldraw Editor/store — this vitest suite runs without a
    // DOM, so that's proven against the real app instead: the assetId-fix
    // check beside shuffle1 (step 7) and the restored Remove check (step 9)
    // in tests/icon_picker_smoke.mjs, run via `npm run test:icon-picker`.
  })

  it('does not delete a removed key on a locked or readonly Block, matching updateShape', () => {
    const ASSET_ID = 'asset:icon2' as TLAssetId
    const fixture = mockEditor(blockShape({ icon: 'asset', assetId: ASSET_ID }))
    fixture.setLocked(true)
    expect(updateBlockDetails(
      fixture.editor,
      fixture.current().id,
      encodeBlockIcon({ kind: 'lucide', name: 'Boxes' }),
    ).ok).toBe(true)
    // updateShape's own merge still runs (icon changes); only the direct
    // deletion is withheld, the same guard updateShape enforces itself.
    expect(fixture.current().props.icon).toBe('Boxes')
    expect(fixture.current().props.assetId).toBe(ASSET_ID)
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

  it('adds a semantic Bundle member with stable identity in one command', () => {
    const fixture = mockEditor(blockShape(createBundleProps()))
    const result = appendBundleMember(fixture.editor, fixture.current().id)
    expect(result.ok).toBe(true)
    expect(result.ok ? result.port.id : null).toBe('member_2')
    expect(fixture.current().props.inputs.map((port) => [port.id, port.name])).toEqual([
      ['record', 'record'],
      ['member_1', '.field'],
      ['member_2', '.field'],
    ])
    expect(fixture.history).toEqual(['add Bundle member update'])
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
      { id: 'out_1', name: '', type: '', visible: true },
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

  it('links only consecutive ports, without special-casing their written names', () => {
    const props = getDefaultBlockProps()
    const seeded = {
      ...props,
      inputs: [
        { id: 'a', name: '*overlays', type: '', visible: true },
        { id: 'b', name: 'layer', type: '', visible: true },
        { id: 'c', name: '**options', type: '', visible: true },
      ],
    }
    const linked = linkBlockPortRangeProps(seeded, 'inputs', ['a', 'b'])
    expect(linked.inputs.map((port) => port.link?.groupId)).toEqual(['link:a', 'link:a', undefined])
    expect(linked.inputs.map((port) => port.name)).toEqual(['*overlays', 'layer', '**options'])
    expect(linkBlockPortRangeProps(seeded, 'inputs', ['a', 'c'])).toBe(seeded)
  })

  it('joins and splits links at an exact adjacent seam', () => {
    const seeded = {
      ...getDefaultBlockProps(),
      inputs: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, type: '', visible: true })),
    }
    const first = toggleBlockPortLinkSeamProps(seeded, 'inputs', 'a', 'b')
    const joined = toggleBlockPortLinkSeamProps(first, 'inputs', 'b', 'c')
    expect(joined.inputs.map((port) => port.link?.groupId)).toEqual(['link:a', 'link:a', 'link:a', undefined])
    const split = toggleBlockPortLinkSeamProps(joined, 'inputs', 'b', 'c')
    expect(split.inputs.map((port) => port.link?.groupId)).toEqual(['link:a', 'link:a', undefined, undefined])
    expect(toggleBlockPortLinkSeamProps(split, 'inputs', 'a', 'c')).toBe(split)
  })

  it('keeps linked input runs canonical through deletion and reordering', () => {
    const seeded = {
      ...getDefaultBlockProps(),
      inputs: ['a', 'b', 'c', 'd'].map((id) => ({
        id,
        name: id,
        type: '',
        visible: true,
        ...(id === 'd' ? {} : { link: { groupId: 'old-run' } }),
      })),
    }

    const withoutFirst = removeBlockPortProps(seeded, 'inputs', 'a')
    expect(withoutFirst.inputs.map((port) => port.link?.groupId)).toEqual([
      'link:b', 'link:b', undefined,
    ])

    const reordered = moveBlockPortProps(seeded, 'inputs', 'd', -1)
    expect(reordered.inputs.map((port) => port.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(reordered.inputs.map((port) => port.link?.groupId)).toEqual([
      'link:a', 'link:a', undefined, undefined,
    ])
  })

  it('keeps header and output ports outside the linked body-input lane', () => {
    const seeded = {
      ...getDefaultBlockProps(),
      inputs: ['a', 'b', 'c'].map((id) => ({
        id,
        name: id,
        type: '',
        visible: true,
        link: { groupId: 'old-run' },
      })),
      outputs: ['x', 'y'].map((id) => ({ id, name: id, type: '', visible: true })),
    }

    const moved = moveBlockPortToSectionProps(
      seeded,
      'inputs',
      'b',
      { row: 0, branch: 0, before: null },
    )
    expect(moved.inputs.map((port) => [port.id, port.row, port.link?.groupId])).toEqual([
      ['b', 0, undefined],
      ['a', undefined, 'link:a'],
      ['c', undefined, 'link:a'],
    ])
    expect(linkBlockPortRangeProps(seeded, 'outputs', ['x', 'y'])).toBe(seeded)
    expect(toggleBlockPortLinkSeamProps(seeded, 'outputs', 'x', 'y')).toBe(seeded)
  })
})
