import {
  richTextValidator,
  startEditingShapeWithRichText,
  type Editor,
  type TLEventInfo,
  type TLShape,
  type TLShapeId,
} from 'tldraw'

import { BLOCK_SHAPE_TYPE, PILL_TOOL_ID, isBlockShape } from './blocks/blockModel'
import { rememberBlockInlineField } from './blocks/inlineBlockEditing'

export type PrimaryTextEditorKind = 'rich-text' | 'plain-text' | 'block-title'

/**
 * Return the normal tldraw editing surface for a shape's primary text field.
 *
 * Most stock text-bearing shapes expose `richText`. Frame is tldraw's one
 * drawing-tool exception: its primary label is the plain `name` field. Block
 * similarly uses tldraw's editing lifecycle around its semantic title input.
 */
export function primaryTextEditorKind(shape: TLShape): PrimaryTextEditorKind | null {
  if (isBlockShape(shape)) return 'block-title'
  if (shape.type === 'frame') return 'plain-text'

  const richText = Reflect.get(shape.props, 'richText')
  return richTextValidator.isValid(richText) ? 'rich-text' : null
}

/**
 * Connectors carry a label but are not named by it.
 *
 * Instant text editing exists because a new box is almost always about to be
 * titled — its label IS its content, so drawing one and naming it is a single
 * thought. A connector is the opposite: its meaning is which two things it
 * joins, and a label on it is a rare annotation, added deliberately and later.
 * Opening a caret on every arrow taxes the common case to serve the rare one.
 * Double-clicking an arrow still opens its label, exactly as in stock tldraw.
 */
export const TEXT_ON_DEMAND_SHAPE_TYPES: readonly string[] = ['arrow', 'line']

/**
 * A drawn shape is owned by the tool whose public id matches its shape type.
 * Keeping this check separate from editability prevents paste, duplicate,
 * imports, workspace restore, and other programmatic creation from opening an
 * editor merely because a drawing tool happens to be selected.
 */
export function isPrimaryTextDrawing(toolId: string | null, shape: TLShape): boolean {
  if (TEXT_ON_DEMAND_SHAPE_TYPES.includes(shape.type)) return false
  // The Pill tool is the one tool whose id is not its shape type: it draws a
  // Block already in its `value` view, and the literal is that Block's title.
  const drawsShape = toolId === shape.type
    || (toolId === PILL_TOOL_ID && shape.type === BLOCK_SHAPE_TYPE)
  return drawsShape && primaryTextEditorKind(shape) !== null
}

interface InstantTextEditingOptions {
  defer?: (callback: () => void) => void
  startRichTextEditing?: typeof startEditingShapeWithRichText
}

function beginPrimaryTextEditing(
  editor: Editor,
  shape: TLShape,
  startRichTextEditing: typeof startEditingShapeWithRichText,
): void {
  const kind = primaryTextEditorKind(shape)
  if (!kind || !editor.canEditShape(shape)) return

  if (kind === 'rich-text') {
    startRichTextEditing(editor, shape, { selectAll: true })
    return
  }

  if (kind === 'block-title') {
    // A Block has several semantic inline fields; creation always starts with
    // its primary field, regardless of what field was edited on another Block.
    rememberBlockInlineField(editor, shape.id, { kind: 'title' })
  }

  // tldraw's default side effect observes editingShapeId and enters
  // select.editing_shape. Frame and Block then render/focus their native input.
  editor.setEditingShape(shape)
}

/**
 * Enter the primary text editor after a pointer gesture draws a text-bearing
 * shape. This deliberately listens at tldraw's public creation/event seams:
 * shape creation identifies the candidate, while pointer-up waits until the
 * stock tool has finished resizing, binding, parenting, and selection.
 */
export function installInstantTextEditing(
  editor: Editor,
  options: InstantTextEditingOptions = {},
): () => void {
  const defer = options.defer ?? queueMicrotask
  const startRichTextEditing = options.startRichTextEditing ?? startEditingShapeWithRichText

  let gestureToolId: string | null = null
  let pendingShapeId: TLShapeId | null = null
  let generation = 0
  let disposed = false

  const clearGesture = () => {
    gestureToolId = null
    pendingShapeId = null
    generation += 1
  }

  const onBeforeEvent = (info: TLEventInfo) => {
    if (info.name !== 'pointer_down') return
    clearGesture()
    if (info.button !== 0) return
    gestureToolId = editor.getCurrentToolId()
  }

  const stopAfterCreate = editor.sideEffects.registerAfterCreateHandler(
    'shape',
    (shape, source) => {
      if (source !== 'user' || !gestureToolId) return
      if (!isPrimaryTextDrawing(gestureToolId, shape)) return
      pendingShapeId = shape.id
    },
  )

  const finishGesture = () => {
    const shapeId = pendingShapeId
    const scheduledGeneration = generation
    gestureToolId = null
    pendingShapeId = null
    if (!shapeId) return

    defer(() => {
      if (disposed || generation !== scheduledGeneration) return
      if (editor.getEditingShapeId() === shapeId) return
      if (editor.getInstanceState().isToolLocked) return
      if (editor.getOnlySelectedShapeId() !== shapeId) return

      const shape = editor.getShape(shapeId)
      if (!shape) return
      beginPrimaryTextEditing(editor, shape, startRichTextEditing)
    })
  }

  const onEvent = (info: TLEventInfo) => {
    if (info.name === 'pointer_up' || info.name === 'complete') {
      finishGesture()
      return
    }

    if (
      info.name === 'cancel'
      || info.name === 'interrupt'
      || info.name === 'long_press'
      || info.name === 'right_click'
    ) {
      clearGesture()
    }
  }

  editor.on('before-event', onBeforeEvent)
  editor.on('event', onEvent)

  return () => {
    disposed = true
    clearGesture()
    stopAfterCreate()
    editor.off('before-event', onBeforeEvent)
    editor.off('event', onEvent)
  }
}

export const INSTANT_TEXT_EDITABLE_PLAIN_SHAPE_TYPES = ['frame', BLOCK_SHAPE_TYPE] as const
