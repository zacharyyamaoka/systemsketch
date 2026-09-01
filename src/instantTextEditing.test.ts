import {
  createShapeId,
  toRichText,
  type Editor,
  type TLEventInfo,
  type TLShape,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { getDefaultBlockProps, type BlockShape } from './blocks/blockModel'
import { getBlockInlineField, rememberBlockInlineField } from './blocks/inlineBlockEditing'
import {
  installInstantTextEditing,
  isPrimaryTextDrawing,
  primaryTextEditorKind,
} from './instantTextEditing'

function shape(type: string, props: Record<string, unknown> = {}): TLShape {
  return {
    id: createShapeId(type),
    typeName: 'shape',
    type,
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as TLShape['index'],
    parentId: 'page:page' as TLShape['parentId'],
    isLocked: false,
    opacity: 1,
    meta: {},
    props,
  } as TLShape
}

function blockShape(): BlockShape {
  return {
    ...shape('block', getDefaultBlockProps()),
    type: 'block',
    props: getDefaultBlockProps(),
  } as BlockShape
}

const pointer = (name: 'pointer_down' | 'pointer_up'): TLEventInfo => ({
  type: 'pointer',
  name,
  point: { x: 0, y: 0 },
  pointerId: 1,
  button: 0,
  isPen: false,
  target: 'canvas',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  accelKey: false,
})

function editorHarness() {
  let currentToolId = 'select'
  let selectedShapeId: TLShape['id'] | null = null
  let editingShapeId: TLShape['id'] | null = null
  let toolLocked = false
  const shapes = new Map<TLShape['id'], TLShape>()
  const eventHandlers = new Map<string, (info: TLEventInfo) => void>()
  let afterCreate: ((shape: TLShape, source: 'remote' | 'user') => void) | null = null
  const stopAfterCreate = vi.fn()

  const editor = {
    sideEffects: {
      registerAfterCreateHandler: vi.fn((_typeName, handler) => {
        afterCreate = handler
        return stopAfterCreate
      }),
    },
    on: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
      eventHandlers.set(name, handler)
    }),
    off: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
      if (eventHandlers.get(name) === handler) eventHandlers.delete(name)
    }),
    getCurrentToolId: () => currentToolId,
    getEditingShapeId: () => editingShapeId,
    getInstanceState: () => ({ isToolLocked: toolLocked }),
    getOnlySelectedShapeId: () => selectedShapeId,
    getShape: (id: TLShape['id']) => shapes.get(id),
    canEditShape: (candidate: TLShape) => candidate.id !== editingShapeId,
    setEditingShape: vi.fn((candidate: TLShape) => {
      editingShapeId = candidate.id
      selectedShapeId = candidate.id
    }),
  } as unknown as Editor

  return {
    editor,
    addShape(candidate: TLShape, source: 'remote' | 'user' = 'user') {
      shapes.set(candidate.id, candidate)
      afterCreate?.(candidate, source)
    },
    emitBefore(info: TLEventInfo) {
      eventHandlers.get('before-event')?.(info)
    },
    emit(info: TLEventInfo) {
      eventHandlers.get('event')?.(info)
    },
    select(id: TLShape['id'] | null) {
      selectedShapeId = id
    },
    setCurrentTool(id: string) {
      currentToolId = id
    },
    setEditing(id: TLShape['id'] | null) {
      editingShapeId = id
    },
    setToolLocked(value: boolean) {
      toolLocked = value
    },
    stopAfterCreate,
  }
}

function beginGesture(harness: ReturnType<typeof editorHarness>, toolId: string) {
  harness.setCurrentTool(toolId)
  harness.emitBefore(pointer('pointer_down'))
}

describe('instant primary text editing', () => {
  it('recognizes every stock drawing shape with a primary text field plus Block', () => {
    for (const type of ['geo', 'arrow', 'note', 'text']) {
      const candidate = shape(type, { richText: toRichText('') })
      expect(primaryTextEditorKind(candidate)).toBe('rich-text')
      expect(isPrimaryTextDrawing(type, candidate)).toBe(true)
    }

    expect(primaryTextEditorKind(shape('frame', { name: '' }))).toBe('plain-text')
    expect(primaryTextEditorKind(blockShape())).toBe('block-title')
    expect(primaryTextEditorKind(shape('draw', { segments: [] }))).toBe(null)
    expect(primaryTextEditorKind(shape('connection', {}))).toBe(null)
  })

  it('uses tldraw rich-text editing after the stock draw gesture completes', () => {
    const harness = editorHarness()
    const startRichTextEditing = vi.fn()
    const deferred: Array<() => void> = []
    installInstantTextEditing(harness.editor, {
      defer: (callback) => deferred.push(callback),
      startRichTextEditing,
    })
    const rectangle = shape('geo', { richText: toRichText('') })

    beginGesture(harness, 'geo')
    harness.addShape(rectangle)
    harness.select(rectangle.id)
    expect(startRichTextEditing).not.toHaveBeenCalled()

    harness.emit(pointer('pointer_up'))
    expect(startRichTextEditing).not.toHaveBeenCalled()
    deferred.splice(0).forEach((callback) => callback())

    expect(startRichTextEditing).toHaveBeenCalledWith(
      harness.editor,
      rectangle,
      { selectAll: true },
    )
  })

  it('activates the Block title and tldraw Frame label through normal editing state', () => {
    const harness = editorHarness()
    const deferred: Array<() => void> = []
    installInstantTextEditing(harness.editor, { defer: (callback) => deferred.push(callback) })
    const block = blockShape()
    rememberBlockInlineField(harness.editor, block.id, { kind: 'description' })

    beginGesture(harness, 'block')
    harness.addShape(block)
    harness.select(block.id)
    harness.emit(pointer('pointer_up'))
    deferred.splice(0).forEach((callback) => callback())

    expect(harness.editor.setEditingShape).toHaveBeenLastCalledWith(block)
    expect(getBlockInlineField(harness.editor, block.id)).toEqual({ kind: 'title' })

    harness.setEditing(null)
    const frame = shape('frame', { name: '' })
    beginGesture(harness, 'frame')
    harness.addShape(frame)
    harness.select(frame.id)
    harness.emit(pointer('pointer_up'))
    deferred.splice(0).forEach((callback) => callback())

    expect(harness.editor.setEditingShape).toHaveBeenLastCalledWith(frame)
  })

  it('does not confuse paste, remote sync, non-text shapes, or another tool with drawing', () => {
    const harness = editorHarness()
    const startRichTextEditing = vi.fn()
    installInstantTextEditing(harness.editor, {
      defer: (callback) => callback(),
      startRichTextEditing,
    })
    const pasted = shape('geo', { richText: toRichText('') })

    harness.addShape(pasted)
    harness.select(pasted.id)
    harness.emit(pointer('pointer_up'))

    beginGesture(harness, 'geo')
    harness.addShape(shape('geo', { richText: toRichText('') }), 'remote')
    harness.emit(pointer('pointer_up'))

    const line = shape('line', { points: {} })
    beginGesture(harness, 'line')
    harness.addShape(line)
    harness.select(line.id)
    harness.emit(pointer('pointer_up'))

    const mismatched = shape('geo', { richText: toRichText('') })
    beginGesture(harness, 'frame')
    harness.addShape(mismatched)
    harness.select(mismatched.id)
    harness.emit(pointer('pointer_up'))

    expect(startRichTextEditing).not.toHaveBeenCalled()
    expect(harness.editor.setEditingShape).not.toHaveBeenCalled()
  })

  it('respects tldraw tool lock, cancellation, existing editing, and disposal', () => {
    const harness = editorHarness()
    const startRichTextEditing = vi.fn()
    const deferred: Array<() => void> = []
    const dispose = installInstantTextEditing(harness.editor, {
      defer: (callback) => deferred.push(callback),
      startRichTextEditing,
    })
    const locked = shape('geo', { richText: toRichText('') })

    harness.setToolLocked(true)
    beginGesture(harness, 'geo')
    harness.addShape(locked)
    harness.select(locked.id)
    harness.emit(pointer('pointer_up'))
    deferred.splice(0).forEach((callback) => callback())

    harness.setToolLocked(false)
    const cancelled = shape('geo', { richText: toRichText('') })
    beginGesture(harness, 'geo')
    harness.addShape(cancelled)
    harness.select(cancelled.id)
    harness.emit({ type: 'misc', name: 'cancel' })
    harness.emit(pointer('pointer_up'))
    deferred.splice(0).forEach((callback) => callback())

    const note = shape('note', { richText: toRichText('') })
    beginGesture(harness, 'note')
    harness.addShape(note)
    harness.select(note.id)
    harness.setEditing(note.id)
    harness.emit(pointer('pointer_up'))
    deferred.splice(0).forEach((callback) => callback())

    const disposed = shape('geo', { richText: toRichText('') })
    harness.setEditing(null)
    beginGesture(harness, 'geo')
    harness.addShape(disposed)
    harness.select(disposed.id)
    harness.emit(pointer('pointer_up'))
    dispose()
    deferred.splice(0).forEach((callback) => callback())

    expect(startRichTextEditing).not.toHaveBeenCalled()
    expect(harness.stopAfterCreate).toHaveBeenCalledOnce()
    expect(harness.editor.off).toHaveBeenCalledTimes(2)
  })
})
