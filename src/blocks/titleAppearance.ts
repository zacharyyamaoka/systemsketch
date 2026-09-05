/**
 * The one rendering translation for an authored Block title style.
 *
 * The stored values use the same compact vocabulary as the FigJam controls;
 * pixel values and font stacks belong here so the Simple face, heading face,
 * value capsule, and live editor cannot slowly become four typographic systems.
 */
import type { Editor } from 'tldraw'

import {
  type BlockShapeProps,
  type BlockTitleAlign,
  type BlockTitleFont,
  type BlockTitleSize,
  blockHeaderAlign,
} from './blockModel'
import { customColorHex } from '../appearance/customColors'
import { FIGJAM_COLOR_HEX } from '../appearance/figjamPalette'

const FONT_SIZES: Readonly<Record<BlockTitleSize, number>> = {
  s: 18,
  m: 24,
  l: 36,
  xl: 44,
}

const FONT_FAMILIES: Readonly<Record<BlockTitleFont, string>> = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  draw: '"Comic Sans MS", "Segoe Print", cursive',
}

/** The old face is the default until a person actually changes that control. */
export function blockTitleSize(props: BlockShapeProps): BlockTitleSize {
  return props.titleSize ?? (props.view === 'simple' ? 'xl' : props.view === 'value' ? 'm' : 'l')
}

/** The old face is the default until a person actually changes that control. */
export function blockTitleFont(props: BlockShapeProps): BlockTitleFont {
  return props.titleFont ?? (props.view === 'simple' ? 'sans' : 'mono')
}

/** The old face is the default until a person actually changes that control. */
export function blockTitleAlign(props: BlockShapeProps): BlockTitleAlign {
  return props.titleAlign ?? (
    props.view === 'simple' || (
      props.view !== 'value' && blockHeaderAlign(props) === 'center'
    )
      ? 'middle'
      : 'start'
  )
}

/** Simple cards already used a bold display title; the other views did not. */
export function blockTitleBold(props: BlockShapeProps): boolean {
  return props.titleBold ?? props.view === 'simple'
}

export interface BlockTitleAppearance {
  fontFamily: string
  fontSize: number
  fontWeight: number
  textAlign: 'left' | 'center' | 'right'
  justifyContent: 'flex-start' | 'center' | 'flex-end'
  color?: string
}

function resolveTitleColor(editor: Editor, name: string | undefined): string | undefined {
  if (!name) return undefined
  const colors = editor.getCurrentTheme().colors[editor.getColorMode()] as unknown as
    Record<string, { solid?: string } | string | undefined>
  const entry = colors[name]
  return typeof entry === 'object' ? entry?.solid : undefined
}

function exportTitleColor(name: string | undefined): string | undefined {
  return name ? FIGJAM_COLOR_HEX[name] ?? customColorHex(name) : undefined
}

function titleAppearance(props: BlockShapeProps, color: string | undefined): BlockTitleAppearance {
  const align = blockTitleAlign(props)
  return {
    fontFamily: FONT_FAMILIES[blockTitleFont(props)],
    fontSize: FONT_SIZES[blockTitleSize(props)],
    // Preserve the pre-formatting face exactly until the bold control is used.
    fontWeight: props.titleBold === undefined
      ? (props.view === 'simple' ? 600 : 500)
      : (blockTitleBold(props) ? 700 : 400),
    textAlign: align === 'start' ? 'left' : align === 'middle' ? 'center' : 'right',
    justifyContent: align === 'start' ? 'flex-start' : align === 'middle' ? 'center' : 'flex-end',
    color,
  }
}

/**
 * WHY: title formatting stays on the visual occurrence, not the linked
 * definition. One function can read differently in different canvas contexts
 * without silently forking its name or source identity.
 */
export function blockTitleAppearance(editor: Editor, props: BlockShapeProps): BlockTitleAppearance {
  return titleAppearance(props, resolveTitleColor(editor, props.titleColor))
}

/** A board export has no live theme, but its authored FigJam or custom ink is still portable. */
export function blockTitleExportAppearance(props: BlockShapeProps): BlockTitleAppearance {
  return titleAppearance(props, exportTitleColor(props.titleColor))
}
