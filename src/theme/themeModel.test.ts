import { describe, expect, it } from 'vitest'
import {
  applyThemeChoice,
  DEFAULT_THEME_CHOICE,
  KNOWN_HOST_THEMES,
  parseStoredPalettes,
  parseStoredThemeChoice,
  readImportedPalettes,
  readThemeChoice,
  resolveHostTheme,
  sameChoice,
  themeOptions,
  TOKEN_NAMES,
  tokenCssName,
  tokensToStyle,
  writeImportedPalettes,
  writeThemeChoice,
  type ThemePalette,
} from './themeModel'
import { BUILT_IN_PALETTES, DARK_MODERN_PALETTE, OBSIDIAN_DARK_PALETTE } from './palettes'

class MemoryStorage {
  private items = new Map<string, string>()
  getItem(key: string): string | null { return this.items.get(key) ?? null }
  setItem(key: string, value: string): void { this.items.set(key, value) }
}

describe('the vocabulary', () => {
  it('names twenty tokens and turns each into its CSS custom property', () => {
    expect(TOKEN_NAMES).toHaveLength(20)
    expect(tokenCssName('surface')).toBe('--ss-surface')
    expect(tokenCssName('surfaceRaised')).toBe('--ss-surface-raised')
    expect(tokenCssName('shadow1')).toBe('--ss-shadow-1')
  })

  it('every shipped palette supplies every token', () => {
    for (const palette of BUILT_IN_PALETTES) {
      for (const name of TOKEN_NAMES) {
        expect(palette.tokens[name], `${palette.id}.${name}`).toMatch(/\S/)
      }
    }
    expect(Object.keys(tokensToStyle(DARK_MODERN_PALETTE.tokens))).toEqual(TOKEN_NAMES.map(tokenCssName))
  })
})

describe('which theme is on', () => {
  it('the default derives from tldraw and carries no inline values', () => {
    const applied = applyThemeChoice({ kind: 'systemsketch', scheme: 'dark' }, BUILT_IN_PALETTES)
    expect(applied).toMatchObject({ theme: 'systemsketch', scheme: 'dark', style: undefined, label: 'Dark' })
  })

  it('a palette arrives inline with its own scheme', () => {
    const applied = applyThemeChoice({ kind: 'palette', id: 'dark-modern' }, BUILT_IN_PALETTES)
    expect(applied.theme).toBe('palette')
    expect(applied.scheme).toBe('dark')
    expect(applied.style?.['--ss-surface']).toBe(DARK_MODERN_PALETTE.tokens.surface)
    expect(applied.palette).toBe(DARK_MODERN_PALETTE)
  })

  it('a palette that no longer exists falls back to the default rather than a blank chrome', () => {
    const applied = applyThemeChoice({ kind: 'palette', id: 'imported:gone' }, BUILT_IN_PALETTES)
    expect(applied).toMatchObject({ theme: 'systemsketch', scheme: 'light', style: undefined })
  })

  it('a known host gets its own block and an unknown host gets the default', () => {
    for (const host of KNOWN_HOST_THEMES) expect(resolveHostTheme(host)).toBe(host)
    expect(resolveHostTheme('sublime')).toBe('systemsketch')
    expect(resolveHostTheme(undefined)).toBe('systemsketch')
    expect(resolveHostTheme(null)).toBe('systemsketch')
  })

  it('lists the defaults first, then shipped palettes, then imported ones as removable', () => {
    const imported: ThemePalette = { ...DARK_MODERN_PALETTE, id: 'imported:mine', label: 'Mine', source: 'Imported from mine.json' }
    const options = themeOptions(BUILT_IN_PALETTES, [imported])
    expect(options.map((option) => option.id)).toEqual([
      'systemsketch:light', 'systemsketch:dark', 'systemsketch:system',
      'obsidian-light', 'obsidian-dark', 'dark-modern', 'imported:mine',
    ])
    expect(options.filter((option) => option.removable).map((option) => option.id)).toEqual(['imported:mine'])
    expect(options.find((option) => option.id === 'obsidian-dark')?.detail).toBe(OBSIDIAN_DARK_PALETTE.source)
  })

  it('compares choices by what they mean', () => {
    expect(sameChoice({ kind: 'systemsketch', scheme: 'dark' }, { kind: 'systemsketch', scheme: 'dark' })).toBe(true)
    expect(sameChoice({ kind: 'systemsketch', scheme: 'dark' }, { kind: 'systemsketch', scheme: 'light' })).toBe(false)
    expect(sameChoice({ kind: 'palette', id: 'a' }, { kind: 'palette', id: 'a' })).toBe(true)
    expect(sameChoice({ kind: 'palette', id: 'a' }, { kind: 'systemsketch', scheme: 'dark' })).toBe(false)
  })
})

describe('persistence', () => {
  it('round-trips a choice and stores the resolved scheme beside it for the pre-paint script', () => {
    const storage = new MemoryStorage()
    writeThemeChoice({ kind: 'palette', id: 'dark-modern' }, storage, 'dark')
    expect(JSON.parse(storage.getItem('systemsketch.theme.v1')!)).toEqual({
      version: 1, choice: { kind: 'palette', id: 'dark-modern' }, scheme: 'dark',
    })
    expect(readThemeChoice(storage)).toEqual({ kind: 'palette', id: 'dark-modern' })
  })

  it('treats anything malformed as the default', () => {
    expect(parseStoredThemeChoice(null)).toEqual(DEFAULT_THEME_CHOICE)
    expect(parseStoredThemeChoice({ version: 2, choice: { kind: 'systemsketch', scheme: 'dark' } })).toEqual(DEFAULT_THEME_CHOICE)
    expect(parseStoredThemeChoice({ version: 1, choice: { kind: 'systemsketch', scheme: 'sepia' } })).toEqual(DEFAULT_THEME_CHOICE)
    expect(parseStoredThemeChoice({ version: 1, choice: { kind: 'palette', id: '' } })).toEqual(DEFAULT_THEME_CHOICE)
    const storage = new MemoryStorage()
    storage.setItem('systemsketch.theme.v1', '{not json')
    expect(readThemeChoice(storage)).toEqual(DEFAULT_THEME_CHOICE)
  })

  it('keeps only well-formed imported palettes', () => {
    const storage = new MemoryStorage()
    const good: ThemePalette = { ...DARK_MODERN_PALETTE, id: 'imported:good' }
    const bad = { ...DARK_MODERN_PALETTE, id: 'imported:bad', tokens: { surface: '#000' } }
    writeImportedPalettes([good, bad as unknown as ThemePalette], storage)
    expect(readImportedPalettes(storage).map((item) => item.id)).toEqual(['imported:good'])
    expect(parseStoredPalettes({ version: 1, palettes: 'nope' })).toEqual([])
  })
})
