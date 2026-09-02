import { describe, expect, it } from 'vitest'
import {
  paletteFromVsCodeTheme,
  parseVsCodeThemeText,
  relativeLuminance,
  slugify,
  vsCodeThemeScheme,
  vsCodeThemeTokens,
  VSCODE_DEFAULTS,
} from './vscodeTheme'
import { DARK_MODERN_PALETTE } from './palettes'
import { TOKEN_NAMES } from './themeModel'

describe('reading a VS Code theme', () => {
  it('parses the jsonc real theme files use', () => {
    const theme = parseVsCodeThemeText(`{
      // a comment
      "name": "Mine", /* block */
      "type": "dark",
      "colors": { "editor.background": "#101010", },
    }`)
    expect(theme.name).toBe('Mine')
    expect(theme.colors?.['editor.background']).toBe('#101010')
    expect(() => parseVsCodeThemeText('[]')).toThrow(/JSON object/)
    expect(() => parseVsCodeThemeText('{"colors": 3}')).toThrow(/colors/)
  })

  it('finds the scheme from the type, then the name, then the background', () => {
    expect(vsCodeThemeScheme({ type: 'dark' })).toBe('dark')
    expect(vsCodeThemeScheme({ type: 'hcLight' })).toBe('light')
    expect(vsCodeThemeScheme({ name: 'Solarized Light' })).toBe('light')
    expect(vsCodeThemeScheme({ colors: { 'editor.background': '#1e1e1e' } })).toBe('dark')
    expect(vsCodeThemeScheme({ colors: { 'editor.background': '#fafafa' } })).toBe('light')
    expect(relativeLuminance('#fff')).toBeCloseTo(1)
    expect(relativeLuminance('#000000')).toBe(0)
  })

  it('maps the workbench colours onto every token and says which fell back', () => {
    const { tokens, fallbacks } = vsCodeThemeTokens({
      'editor.background': '#1F1F1F',
      'editorWidget.background': '#202020',
      'foreground': '#CCCCCC',
      'focusBorder': '#0078D4',
    }, 'dark')
    expect(tokens.surface).toBe('#1f1f1f')
    expect(tokens.surfaceRaised).toBe('#202020')
    expect(tokens.text).toBe('#cccccc')
    expect(tokens.accent).toBe('#0078d4')
    expect(tokens.codeText).toBe(VSCODE_DEFAULTS.dark['editor.foreground'])
    expect(tokens.surfaceInverse).toBe('color-mix(in srgb, #202020 86%, #cccccc)')
    for (const name of TOKEN_NAMES) expect(tokens[name], name).toMatch(/\S/)
    expect(fallbacks).toContain('textMuted')
    expect(fallbacks).toContain('danger')
    expect(fallbacks).not.toContain('accent')
  })

  it('ignores a value that is not a colour rather than shipping it', () => {
    const { tokens, fallbacks } = vsCodeThemeTokens({ 'focusBorder': 'blue-ish', 'editor.background': '#000' }, 'dark')
    expect(tokens.accent).toBe(VSCODE_DEFAULTS.dark['focusBorder'])
    expect(fallbacks).toContain('accent')
  })

  it('slugifies names into stable ids', () => {
    expect(slugify('Default Dark Modern')).toBe('default-dark-modern')
    expect(slugify('  Ω  ')).toBe('theme')
  })

  it('builds a palette record with provenance', () => {
    const { palette } = paletteFromVsCodeTheme(
      { name: 'Mine', type: 'light', colors: { 'editor.background': '#ffffff' } },
      { id: 'imported:mine', source: 'Imported from mine.json' },
    )
    expect(palette).toMatchObject({ id: 'imported:mine', label: 'Mine', scheme: 'light', source: 'Imported from mine.json' })
  })
})

describe('the shipped Dark Modern palette', () => {
  // Whether it still matches the theme file installed on this machine is
  // checked by tests/test_theme_tokens.py, which can read the disk.
  it('carries the values Zach sees in Cursor', () => {
    expect(DARK_MODERN_PALETTE.scheme).toBe('dark')
    expect(DARK_MODERN_PALETTE.tokens.surface).toBe('#1f1f1f')
    expect(DARK_MODERN_PALETTE.tokens.text).toBe('#cccccc')
    expect(DARK_MODERN_PALETTE.tokens.accent).toBe('#0078d4')
    expect(DARK_MODERN_PALETTE.tokens.textMuted).toBe('#9d9d9d')
    expect(DARK_MODERN_PALETTE.source).toContain('Dark Modern')
  })
})
