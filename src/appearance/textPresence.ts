/**
 * Whether the current selection already carries visible text.
 *
 * FigJam hides a shape's typography controls — Typeface, Font size, Text
 * alignment, Vertical alignment — until the shape actually has text, and
 * never shows them on a connector at all (a labelled arrow's typography is
 * fixed, not user-editable). Both rules need to know, per shape, whether its
 * `richText` prop actually renders to anything: `renderPlaintextFromRichText`
 * is tldraw's own answer to that, so an empty paragraph and a whitespace-only
 * one both read as "no text" the same way tldraw's own renderer would.
 */
import { renderPlaintextFromRichText, richTextValidator, type Editor, type TLRichText, type TLShape } from 'tldraw'

function richTextOf(shape: TLShape): TLRichText | undefined {
  const richText = Reflect.get(shape.props, 'richText')
  return richTextValidator.isValid(richText) ? richText : undefined
}

function shapeHasVisibleText(editor: Editor, shape: TLShape): boolean {
  const richText = richTextOf(shape)
  if (richText === undefined) return false
  return renderPlaintextFromRichText(editor, richText).trim().length > 0
}

/**
 * True once every text-capable shape in the selection has visible text.
 * A shape with no `richText` prop at all (a bare Line, a Block) does not
 * count against this — only shapes that could hold a label and currently
 * don't.
 */
export function selectionHasVisibleText(editor: Editor): boolean {
  const textCapable = editor.getSelectedShapes().filter((shape) => richTextOf(shape) !== undefined)
  if (textCapable.length === 0) return false
  return textCapable.every((shape) => shapeHasVisibleText(editor, shape))
}

/**
 * The one shape "Add text" should target: exactly one shape selected, it can
 * hold a `richText` label, and it doesn't have one yet. Anything else — no
 * selection, a multi-selection, a shape whose type has no label at all like
 * a stock Line — has no single unambiguous target, so the button stays off
 * rather than guessing.
 */
export function addTextTarget(editor: Editor): TLShape | null {
  const shape = editor.getOnlySelectedShape()
  if (!shape) return null
  if (richTextOf(shape) === undefined) return null
  return shapeHasVisibleText(editor, shape) ? null : shape
}
