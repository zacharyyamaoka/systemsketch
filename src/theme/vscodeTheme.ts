/**
 * A VS Code (or Cursor) colour theme, read into SystemSketch's vocabulary.
 *
 * A VS Code theme is a JSON file whose `colors` table names workbench parts —
 * `editor.background`, `focusBorder`, `descriptionForeground` — and this
 * module is the one place that says which of those each `--ss-*` token reads.
 * It is used twice, with the same function: at build time by
 * `scripts/import_vscode_theme.mjs`, which resolves a theme's `include` chain
 * and emits the shipped Dark Modern palette; and at run time by the Settings
 * dialog, which imports whatever file a person hands it.
 *
 * `tokenColors` — the syntax colours — are carried on the imported record
 * untouched. SystemSketch renders no syntax highlighting today, so nothing
 * reads them yet; keeping them means the day a highlighter exists, a theme
 * imported today already has what it needs.
 */
import type { PaletteScheme, ThemePalette, ThemeTokens, TokenName } from './themeModel'

export interface VsCodeThemeFile {
  name?: string
  type?: string
  include?: string
  colors?: Record<string, string>
  tokenColors?: unknown
  semanticTokenColors?: unknown
}

/**
 * VS Code's own defaults for the keys this mapping reads, used only when a
 * theme file leaves one out. Themes shipped with VS Code define nearly all of
 * them; the importer reports which keys fell back so a report can say so.
 */
export const VSCODE_DEFAULTS: Record<PaletteScheme, Record<string, string>> = {
  dark: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#bbbbbb',
    'foreground': '#cccccc',
    'descriptionForeground': '#ccccccb3',
    'disabledForeground': '#cccccc80',
    'input.placeholderForeground': '#a6a6a6',
    'editorWidget.background': '#252526',
    'editorHoverWidget.foreground': '#cccccc',
    'input.background': '#3c3c3c',
    'toolbar.hoverBackground': '#5a5d5e50',
    'toolbar.activeBackground': '#63666750',
    'list.hoverBackground': '#2a2d2e',
    'panel.border': '#80808059',
    'focusBorder': '#007fd4',
    'button.foreground': '#ffffff',
    'errorForeground': '#f48771',
    'editorWarning.foreground': '#cca700',
    'testing.iconPassed': '#73c991',
    'widget.shadow': '#0000005c',
  },
  light: {
    'editor.background': '#fffffe',
    'editor.foreground': '#333333',
    'foreground': '#616161',
    'descriptionForeground': '#717171',
    'disabledForeground': '#61616180',
    'input.placeholderForeground': '#767676',
    'editorWidget.background': '#f3f3f3',
    'editorHoverWidget.foreground': '#616161',
    'input.background': '#ffffff',
    'toolbar.hoverBackground': '#b8b8b850',
    'toolbar.activeBackground': '#a6a6a650',
    'list.hoverBackground': '#f0f0f0',
    'panel.border': '#80808059',
    'focusBorder': '#0090f1',
    'button.foreground': '#ffffff',
    'errorForeground': '#a1260d',
    'editorWarning.foreground': '#bf8803',
    'testing.iconPassed': '#73c991',
    'widget.shadow': '#00000029',
  },
}

/**
 * Which workbench colours each token reads, first hit wins. The order is the
 * argument: a popout is VS Code's "editor widget", a resting chip is an
 * input, the accent is the focus border because that is the one colour every
 * theme tunes for legibility against its own surfaces.
 */
export const VSCODE_TOKEN_SOURCES: Record<Exclude<TokenName, 'surfaceInverse' | 'shadow1' | 'shadow2'>, readonly string[]> = {
  surface: ['editor.background'],
  surfaceRaised: ['editorWidget.background', 'sideBar.background', 'editor.background'],
  surfaceSunken: ['input.background'],
  surfaceHover: ['toolbar.hoverBackground', 'list.hoverBackground'],
  surfaceActive: ['toolbar.activeBackground', 'list.activeSelectionBackground'],
  text: ['foreground', 'editor.foreground'],
  textMuted: ['descriptionForeground'],
  textFaint: ['disabledForeground', 'input.placeholderForeground'],
  textInverse: ['editorHoverWidget.foreground', 'foreground'],
  border: ['widget.border', 'panel.border', 'editorGroup.border'],
  accent: ['focusBorder'],
  accentText: ['button.foreground'],
  danger: ['errorForeground'],
  warning: ['editorWarning.foreground'],
  success: ['testing.iconPassed', 'editorGutter.addedBackground'],
  codeSurface: ['editor.background'],
  codeText: ['editor.foreground'],
}

export interface VsCodeImport {
  palette: ThemePalette
  /** Tokens whose every source key was absent, so a VS Code default painted them. */
  fallbacks: TokenName[]
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function normalizeColor(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  return HEX.test(trimmed) ? trimmed : undefined
}

/**
 * `'dark' | 'light'`, from the file's `type`, then its name, then the
 * luminance of its editor background — a theme that says nothing still has
 * one, and the board must follow it.
 */
export function vsCodeThemeScheme(theme: VsCodeThemeFile): PaletteScheme {
  const type = theme.type?.toLowerCase()
  if (type === 'dark' || type === 'hc') return 'dark'
  if (type === 'light' || type === 'hclight') return 'light'
  const name = theme.name?.toLowerCase() ?? ''
  if (/\bdark\b/.test(name)) return 'dark'
  if (/\blight\b/.test(name)) return 'light'
  const background = normalizeColor(theme.colors?.['editor.background'])
  return background && relativeLuminance(background) < 0.5 ? 'dark' : 'light'
}

export function relativeLuminance(hex: string): number {
  const digits = hex.slice(1)
  const wide = digits.length <= 4
    ? digits.split('').map((digit) => digit + digit).join('')
    : digits
  const channel = (offset: number) => {
    const value = parseInt(wide.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** A theme's `colors` table as SystemSketch tokens. */
export function vsCodeThemeTokens(
  colors: Record<string, string>,
  scheme: PaletteScheme,
): { tokens: ThemeTokens; fallbacks: TokenName[] } {
  const defaults = VSCODE_DEFAULTS[scheme]
  const fallbacks: TokenName[] = []
  const lookup = (keys: readonly string[]): string | undefined => {
    for (const key of keys) {
      const value = normalizeColor(colors[key])
      if (value) return value
    }
    return undefined
  }
  const pick = (token: TokenName, keys: readonly string[]): string => {
    const found = lookup(keys)
    if (found) return found
    fallbacks.push(token)
    for (const key of keys) {
      if (defaults[key]) return defaults[key]
    }
    return defaults['foreground']
  }

  const partial: Partial<ThemeTokens> = {}
  for (const [token, keys] of Object.entries(VSCODE_TOKEN_SOURCES) as [TokenName, readonly string[]][]) {
    partial[token] = pick(token, keys)
  }
  const shadow = lookup(['widget.shadow']) ?? (() => { fallbacks.push('shadow1'); return defaults['widget.shadow'] })()
  const raised = partial.surfaceRaised as string
  const ink = partial.text as string
  const tokens: ThemeTokens = {
    ...(partial as ThemeTokens),
    // VS Code has no "opposite polarity" surface; a hover widget is the
    // nearest thing and is barely raised. Mixing a little ink into the widget
    // surface gives the selection pill a body that reads as floating in both
    // dark and light themes without inventing a colour the theme never had.
    surfaceInverse: `color-mix(in srgb, ${raised} 86%, ${ink})`,
    shadow1: `0 1px 3px ${shadow}`,
    shadow2: `0 4px 14px ${shadow}`,
  }
  return { tokens, fallbacks }
}

/** `Default Dark Modern` → `default-dark-modern`. */
export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme'
}

export function paletteFromVsCodeTheme(
  theme: VsCodeThemeFile,
  { id, source, label }: { id: string; source: string; label?: string },
): VsCodeImport {
  const scheme = vsCodeThemeScheme(theme)
  const { tokens, fallbacks } = vsCodeThemeTokens(theme.colors ?? {}, scheme)
  return {
    palette: {
      id,
      label: label ?? theme.name ?? id,
      scheme,
      source,
      tokens,
    },
    fallbacks,
  }
}

/**
 * VS Code theme files are JSON with comments and trailing commas allowed
 * (`jsonc`), so a strict parser rejects real files from the marketplace.
 */
export function parseVsCodeThemeText(text: string): VsCodeThemeFile {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1')
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1')
  const parsed: unknown = JSON.parse(withoutTrailingCommas)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('A VS Code theme is a JSON object with a "colors" table.')
  }
  const theme = parsed as VsCodeThemeFile
  if (theme.colors !== undefined && (typeof theme.colors !== 'object' || theme.colors === null)) {
    throw new Error('The theme\'s "colors" entry is not a table.')
  }
  return theme
}
