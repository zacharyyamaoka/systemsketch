import { useEditor, useValue, type Editor } from 'tldraw'

import {
  isBlockShape,
  type BlockShape,
  type BlockShapeProps,
  type BlockTitleAlign,
  type BlockTitleFont,
  type BlockTitleSize,
} from '../blockModel'
import { getBlockInlineField } from '../inlineBlockEditing'
import {
  BLOCK_TITLE_FONT_PX,
  blockTitleAlign,
  blockTitleBold,
  blockTitleFont,
  blockTitleSize,
} from '../titleAppearance'
import {
  BLOCK_TITLE_CONTEXTUAL_RECIPE,
  bindContextualControl,
  composeContextualControls,
  type ContextualControl,
} from '../../contextualMenus/contextualControlRegistry'
import { ContextualControls } from '../../contextualMenus/ContextualControls'

type TitlePatch = Partial<Pick<
  BlockShapeProps,
  'titleSize' | 'titleFont' | 'titleAlign' | 'titleBold' | 'titleColor'
>>

function currentBlock(editor: Editor, shapeId: BlockShape['id']): BlockShape | null {
  const shape = editor.getShape(shapeId)
  return isBlockShape(shape) ? shape : null
}

function returnFocusToTitleEditor(editor: Editor, shapeId: BlockShape['id']): void {
  requestAnimationFrame(() => {
    if (editor.getEditingShapeId() !== shapeId) return
    editor.getContainer()
      .querySelector<HTMLInputElement>('[data-testid="block-inline-title"]')
      ?.focus({ preventScroll: true })
  })
}

/** One formatting gesture is one undoable mutation of the active Block title. */
function updateTitleFormatting(
  editor: Editor,
  shapeId: BlockShape['id'],
  patch: TitlePatch,
  { markHistory = true }: { markHistory?: boolean } = {},
): void {
  const shape = currentBlock(editor, shapeId)
  if (!shape) return
  const next = { ...shape.props, ...patch }
  const changed = (Object.keys(patch) as (keyof TitlePatch)[])
    .some((key) => shape.props[key] !== next[key])
  if (!changed) return
  if (markHistory) editor.markHistoryStoppingPoint('format block title')
  editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: next })
  // A formatting choice is part of editing, not a commit boundary. Return
  // keyboard input to the live title after the document-backed style changes.
  returnFocusToTitleEditor(editor, shape.id)
}

function titleControls(editor: Editor, shape: BlockShape): ContextualControl[] {
  const bind = (
    kind: 'font' | 'size' | 'align',
    id: string,
    value: string,
    patch: (next: string) => TitlePatch,
  ) => bindContextualControl(kind, {
    id,
    value: { type: 'shared', value },
    // A Block title reads its rungs off its own table; printing the px keeps
    // this menu's "Extra large" from claiming kinship with a sticky note's.
    rungPx: kind === 'size'
      ? (option) => BLOCK_TITLE_FONT_PX[option as BlockTitleSize] ?? null
      : undefined,
    onSelect: (next) => {
      if (!next) return
      updateTitleFormatting(editor, shape.id, patch(next))
    },
  })

  return [
    bind(
      'font',
      'titleFont',
      blockTitleFont(shape.props),
      (titleFont) => ({ titleFont: titleFont as BlockTitleFont }),
    ),
    bind(
      'size',
      'titleSize',
      blockTitleSize(shape.props),
      (titleSize) => ({ titleSize: titleSize as BlockTitleSize }),
    ),
    bindContextualControl('bold', {
      id: 'titleBold',
      value: { type: 'shared', value: blockTitleBold(shape.props) ? 'on' : 'off' },
      onSelect: (value) => updateTitleFormatting(editor, shape.id, { titleBold: value === 'on' }),
    }),
    bindContextualControl('color', {
      id: 'titleColor',
      value: { type: 'shared', value: shape.props.titleColor ?? 'automatic' },
      automaticOption: { value: 'automatic', label: 'Automatic' },
      onSelect: (value, options) => {
        if (!value) return
        updateTitleFormatting(
          editor,
          shape.id,
          { titleColor: value === 'automatic' ? undefined : value },
          { markHistory: !options?.continuous },
        )
      },
    }),
    bind(
      'align',
      'titleAlign',
      blockTitleAlign(shape.props),
      (titleAlign) => ({ titleAlign: titleAlign as BlockTitleAlign }),
    ),
  ]
}

/** The active editable Block title, or null for every other field. */
export function getEditingBlockTitle(editor: Editor): BlockShape | null {
  const editingId = editor.getEditingShapeId()
  if (!editingId) return null
  const candidate = editor.getShape(editingId)
  if (!isBlockShape(candidate)) return null
  return getBlockInlineField(editor, editingId).kind === 'title' ? candidate : null
}

/** Block titles bind their document props into the shared control recipe. */
export function BlockTitleFormattingControls() {
  const editor = useEditor()
  const shape = useValue(
    'SystemSketch active Block title formatting target',
    () => getEditingBlockTitle(editor),
    [editor],
  )
  if (!shape) return null
  return (
    <ContextualControls
      composition={composeContextualControls(
        BLOCK_TITLE_CONTEXTUAL_RECIPE,
        titleControls(editor, shape),
      )}
      popoverMode="editing"
      className="systemsketch-block-title-formatting"
      testId="block-title-formatting-menu"
      label="Block title formatting"
    />
  )
}
