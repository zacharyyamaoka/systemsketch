import {
  useEditor,
  useContainer,
  useValue,
  type Editor,
} from 'tldraw'
import * as Popover from '@radix-ui/react-popover'

import {
  isBlockShape,
  type BlockShape,
  type BlockShapeProps,
  type BlockTitleAlign,
  type BlockTitleFont,
  type BlockTitleSize,
} from '../blockModel'
import { getBlockInlineField } from '../inlineBlockEditing'
import { blockTitleAlign, blockTitleBold, blockTitleFont, blockTitleSize } from '../titleAppearance'
import { CustomColorPicker } from '../../appearance/CustomColorPicker'
import { FigjamGlyph } from '../../appearance/AppearanceGlyph'
import { isCustomColor, registeredHex } from '../../appearance/customColors'
import { FIGJAM_CHECK_ICON } from '../../appearance/figjamIconMap'
import { FIGJAM_COLOR_HEX, FIGJAM_PALETTE } from '../../appearance/figjamPalette'
import {
  CHEVRON_PATH,
  CHEVRON_VIEWBOX,
  FONT_SIZE_LADDER,
  POPOVER_COLLISION_PADDING,
  POPOVER_GAP,
} from '../../appearance/figjamTokens'
import './block-title-formatting-menu.css'

type TitlePatch = Partial<Pick<
  BlockShapeProps,
  'titleSize' | 'titleFont' | 'titleAlign' | 'titleBold' | 'titleColor'
>>

const FONT_OPTIONS: readonly { value: BlockTitleFont; label: string }[] = [
  { value: 'sans', label: 'Simple' },
  { value: 'serif', label: 'Bookish' },
  { value: 'mono', label: 'Technical' },
  { value: 'draw', label: 'Scribbled' },
]

const SIZE_OPTIONS: readonly { value: BlockTitleSize; label: string }[] = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
]

const ALIGN_OPTIONS: readonly { value: BlockTitleAlign; label: string; icon: string }[] = [
  { value: 'start', label: 'Left', icon: 'align/Text align left' },
  { value: 'middle', label: 'Center', icon: 'align/Text align center' },
  { value: 'end', label: 'Right', icon: 'align/Text align right' },
]

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
  // A control is part of editing, not a commit boundary. Return keyboard input
  // to the title as soon as the popover action has painted its new appearance.
  returnFocusToTitleEditor(editor, shape.id)
}

function Chevron() {
  return (
    <svg className="systemsketch-appearance__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
      <path d={CHEVRON_PATH} />
    </svg>
  )
}

/**
 * tldraw's UI popover intentionally calls `editor.complete()` when opened.
 * That is right for a selection menu, but wrong for this FigJam-like editor:
 * opening a typeface list must not turn the title field back into plain text.
 * Radix is already tldraw's supported popover primitive; this tiny adapter
 * keeps its portal in the editor container and preserves the input's focus.
 */
function TitlePopover({ children }: { children: React.ReactNode }) {
  return <Popover.Root>{children}</Popover.Root>
}

function TitlePopoverTrigger({ children }: { children: React.ReactNode }) {
  return <Popover.Trigger asChild>{children}</Popover.Trigger>
}

function TitlePopoverContent({
  children,
  side,
  align = 'center',
  sideOffset = POPOVER_GAP,
  collisionPadding = POPOVER_COLLISION_PADDING,
}: {
  children: React.ReactNode
  side: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  collisionPadding?: number
}) {
  const container = useContainer()
  const editor = useEditor()
  return (
    <Popover.Portal container={container}>
      <Popover.Content
        className="tlui-popover__content"
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDown={editor.markEventAsHandled}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  )
}

function FontMenu({ editor, shape }: { editor: Editor; shape: BlockShape }) {
  const selected = blockTitleFont(shape.props)
  return (
    <TitlePopover>
      <TitlePopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__trigger"
          data-control="titleFont"
          aria-label="Title typeface"
          title="Title typeface"
          onPointerDown={(event) => {
            editor.markEventAsHandled(event)
          }}
        >
          <FigjamGlyph name="trigger/Typeface" />
          <Chevron />
        </button>
      </TitlePopoverTrigger>
      <TitlePopoverContent side="top">
        <div className="systemsketch-appearance__panel" role="menu" aria-label="Title typeface" data-layout="list">
          <div className="systemsketch-appearance__options" role="group" aria-label="Title typeface">
            {FONT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="systemsketch-appearance__option"
                data-control="titleFont"
                data-value={option.value}
                role="menuitemradio"
                aria-checked={selected === option.value}
                onClick={() => updateTitleFormatting(editor, shape.id, { titleFont: option.value })}
              >
                <FigjamGlyph name={FIGJAM_CHECK_ICON} className="systemsketch-appearance__check" />
                <span className={`systemsketch-block-title-formatting__font systemsketch-block-title-formatting__font--${option.value}`}>Aa</span>
                <span className="systemsketch-appearance__label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </TitlePopoverContent>
    </TitlePopover>
  )
}

function SizeMenu({ editor, shape }: { editor: Editor; shape: BlockShape }) {
  const selected = blockTitleSize(shape.props)
  const selectedLabel = SIZE_OPTIONS.find((option) => option.value === selected)?.label ?? 'Large'
  return (
    <TitlePopover>
      <TitlePopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__trigger"
          data-control="titleSize"
          data-trigger="text"
          aria-label={`Title font size, ${selectedLabel.toLowerCase()}`}
          title="Title font size"
        >
          <span className="systemsketch-appearance__trigger-text">{selectedLabel}</span>
          <Chevron />
        </button>
      </TitlePopoverTrigger>
      <TitlePopoverContent side="top">
        <div className="systemsketch-appearance__panel" role="menu" aria-label="Title font size" data-layout="list">
          <div className="systemsketch-appearance__options" role="group" aria-label="Title font size">
            {SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="systemsketch-appearance__option"
                data-control="titleSize"
                data-value={option.value}
                role="menuitemradio"
                aria-checked={selected === option.value}
                onClick={() => updateTitleFormatting(editor, shape.id, { titleSize: option.value })}
              >
                <FigjamGlyph name={FIGJAM_CHECK_ICON} className="systemsketch-appearance__check" />
                <span
                  className="systemsketch-appearance__label"
                  style={{ fontSize: `${FONT_SIZE_LADDER[option.value]}px` }}
                >
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </TitlePopoverContent>
    </TitlePopover>
  )
}

function TitleColorSwatch({ editor, color }: { editor: Editor; color: string | undefined }) {
  const hex = useValue(
    'SystemSketch Block title colour swatch',
    () => color ? FIGJAM_COLOR_HEX[color] ?? registeredHex(editor, color) : undefined,
    [editor, color],
  )
  return <span className="systemsketch-appearance__swatch" style={{ background: hex ?? 'var(--ss-text)' }} />
}

function ColorMenu({ editor, shape }: { editor: Editor; shape: BlockShape }) {
  const selected = shape.props.titleColor
  const custom = selected && isCustomColor(selected) ? selected : undefined
  const customHex = useValue(
    'SystemSketch Block title custom colour',
    () => custom ? registeredHex(editor, custom) : undefined,
    [editor, custom],
  )
  const setColor = (titleColor: string | undefined, options?: { markHistory?: boolean }) =>
    updateTitleFormatting(editor, shape.id, { titleColor }, options)

  return (
    <TitlePopover>
      <TitlePopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__trigger"
          data-control="titleColor"
          aria-label="Title color"
          title="Title color"
        >
          <TitleColorSwatch editor={editor} color={selected} />
          <Chevron />
        </button>
      </TitlePopoverTrigger>
      <TitlePopoverContent side="top">
        <div className="systemsketch-appearance__panel" role="menu" aria-label="Title color" data-layout="swatches">
          <div
            className="systemsketch-appearance__options"
            role="group"
            aria-label="Title color"
            style={{ gridTemplateColumns: 'repeat(11, 24px)' }}
          >
            <button
              type="button"
              className="systemsketch-appearance__option systemsketch-block-title-formatting__automatic"
              data-control="titleColor"
              data-value="automatic"
              role="menuitemradio"
              aria-checked={selected === undefined}
              aria-label="Automatic title color"
              title="Automatic title color"
              onClick={() => setColor(undefined)}
            >A</button>
            {FIGJAM_PALETTE.map(([value, hex, label]) => (
              <button
                key={value}
                type="button"
                className="systemsketch-appearance__option"
                data-control="titleColor"
                data-value={value}
                role="menuitemradio"
                aria-checked={selected === value}
                aria-label={label}
                title={label}
                onClick={() => setColor(value)}
              >
                <span className="systemsketch-appearance__swatch" style={{ background: hex }} />
              </button>
            ))}
            <TitlePopover>
              <TitlePopoverTrigger>
                <button
                  type="button"
                  className="systemsketch-appearance__custom"
                  data-control="titleColor"
                  data-active={custom ? '' : undefined}
                  role="menuitemradio"
                  aria-checked={Boolean(custom)}
                  aria-label="Custom"
                  title="Custom"
                >
                  <span className="systemsketch-appearance__custom-ring">
                    <span
                      className="systemsketch-appearance__custom-disc"
                      style={customHex ? { background: customHex } : undefined}
                    />
                  </span>
                </button>
              </TitlePopoverTrigger>
              <TitlePopoverContent
                side="bottom"
                align="center"
                sideOffset={POPOVER_GAP}
                collisionPadding={POPOVER_COLLISION_PADDING}
              >
                <CustomColorPicker
                  editor={editor}
                  colorName={selected}
                  showOpacity={false}
                  onColorChange={(titleColor) => setColor(titleColor, { markHistory: false })}
                />
              </TitlePopoverContent>
            </TitlePopover>
          </div>
        </div>
      </TitlePopoverContent>
    </TitlePopover>
  )
}

function AlignMenu({ editor, shape }: { editor: Editor; shape: BlockShape }) {
  const selected = blockTitleAlign(shape.props)
  const icon = ALIGN_OPTIONS.find((option) => option.value === selected)?.icon ?? ALIGN_OPTIONS[0].icon
  return (
    <TitlePopover>
      <TitlePopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__trigger"
          data-control="titleAlign"
          aria-label="Title text alignment"
          title="Title text alignment"
        >
          <FigjamGlyph name={icon} />
          <Chevron />
        </button>
      </TitlePopoverTrigger>
      <TitlePopoverContent side="top">
        <div className="systemsketch-appearance__panel" role="menu" aria-label="Title text alignment">
          <div className="systemsketch-appearance__options" role="group" aria-label="Title text alignment">
            {ALIGN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="systemsketch-appearance__option"
                data-control="titleAlign"
                data-value={option.value}
                role="menuitemradio"
                aria-checked={selected === option.value}
                aria-label={option.label}
                title={option.label}
                onClick={() => updateTitleFormatting(editor, shape.id, { titleAlign: option.value })}
              >
                <FigjamGlyph name={option.icon} />
              </button>
            ))}
          </div>
        </div>
      </TitlePopoverContent>
    </TitlePopover>
  )
}

/** The active editable Block title, or null for every other field. */
export function getEditingBlockTitle(editor: Editor): BlockShape | null {
  const editingId = editor.getEditingShapeId()
  if (!editingId) return null
  const candidate = editor.getShape(editingId)
  if (!isBlockShape(candidate)) return null
  return getBlockInlineField(editor, editingId).kind === 'title' ? candidate : null
}

/**
 * The controls are deliberately offered only for the active title field.
 * Formatting a port or description needs its own field contract rather than
 * accidentally treating every string in a function Block as its display name.
 */
export function BlockTitleFormattingControls() {
  const editor = useEditor()
  const shape = useValue(
    'SystemSketch active Block title formatting target',
    () => getEditingBlockTitle(editor),
    [editor],
  )
  if (!shape) return null

  const isBold = blockTitleBold(shape.props)
  return (
    <div
      className="systemsketch-appearance systemsketch-block-title-formatting"
      data-testid="block-title-formatting-menu"
      aria-label="Block title formatting"
    >
      <FontMenu editor={editor} shape={shape} />
      <SizeMenu editor={editor} shape={shape} />
      <span className="systemsketch-appearance__separator" aria-hidden="true" />
      <button
        type="button"
        className="systemsketch-appearance__trigger systemsketch-block-title-formatting__bold"
        data-control="titleBold"
        aria-label="Bold title"
        title="Bold title"
        aria-pressed={isBold}
        onClick={() => updateTitleFormatting(editor, shape.id, { titleBold: !isBold })}
      >
        <strong aria-hidden="true">B</strong>
      </button>
      <span className="systemsketch-appearance__separator" aria-hidden="true" />
      <ColorMenu editor={editor} shape={shape} />
      <span className="systemsketch-appearance__separator" aria-hidden="true" />
      <AlignMenu editor={editor} shape={shape} />
    </div>
  )
}
