/**
 * The theme model: what a theme is, what a person can choose, and how that
 * choice becomes two attributes and (sometimes) a style block on the app root.
 *
 * Deliberately free of React, tldraw and the DOM so it can be unit-tested and,
 * later, shared with a host that wants to name a palette. The CSS side of this
 * contract is `src/theme/tokens.css`; the vocabulary below mirrors its
 * per-theme tokens exactly, and `tests/test_theme_tokens.py` checks the two
 * lists agree.
 */

/** The twenty per-theme tokens, in the order `tokens.css` documents them. */
export const TOKEN_NAMES = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'surfaceHover',
  'surfaceActive',
  'surfaceInverse',
  'text',
  'textMuted',
  'textFaint',
  'textInverse',
  'border',
  'accent',
  'accentText',
  'danger',
  'warning',
  'success',
  'codeSurface',
  'codeText',
  'shadow1',
  'shadow2',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]
export type ThemeTokens = Record<TokenName, string>

/** A palette is authored for one scheme; only the default theme can follow the OS. */
export type PaletteScheme = 'light' | 'dark'
export type ColorScheme = PaletteScheme | 'system'

/** A complete set of values with a provenance line. */
export interface ThemePalette {
  /** Stable id: `obsidian-dark`, `dark-modern`, `imported:<slug>`. */
  id: string
  label: string
  scheme: PaletteScheme
  /** Where the values came from, shown beside the label and in the report. */
  source: string
  tokens: ThemeTokens
}

/** What a person picked in Settings. */
export type ThemeChoice =
  | { kind: 'systemsketch'; scheme: ColorScheme }
  | { kind: 'palette'; id: string }

export const DEFAULT_THEME_CHOICE: ThemeChoice = { kind: 'systemsketch', scheme: 'light' }

/** The `data-ss-theme` value that derives everything from tldraw. */
export const DEFAULT_THEME_ID = 'systemsketch'
/** The `data-ss-theme` value under which a palette's tokens arrive inline. */
export const PALETTE_THEME_ID = 'palette'

/**
 * Hosts that have a block in `tokens.css`. A host announces itself through
 * `EmbedHostBridge.host`; if its name is here its live variables drive the
 * chrome, and if it is not the chrome falls back to the default theme, which
 * is a correct-looking app rather than an unstyled one. Adding a host is one
 * CSS block and one entry here.
 */
export const KNOWN_HOST_THEMES = ['vscode', 'obsidian'] as const

export function resolveHostTheme(host: string | undefined | null): string {
  if (typeof host !== 'string') return DEFAULT_THEME_ID
  return (KNOWN_HOST_THEMES as readonly string[]).includes(host) ? host : DEFAULT_THEME_ID
}

/** `surfaceRaised` → `--ss-surface-raised`. */
export function tokenCssName(name: TokenName): string {
  return `--ss-${name.replace(/[A-Z0-9]/g, (letter) => `-${letter.toLowerCase()}`)}`
}

export function tokensToStyle(tokens: ThemeTokens): Record<string, string> {
  const style: Record<string, string> = {}
  for (const name of TOKEN_NAMES) style[tokenCssName(name)] = tokens[name]
  return style
}

/** What the app root renders for a choice. */
export interface AppliedTheme {
  /** The `data-ss-theme` attribute. */
  theme: string
  /** The `data-ss-color-scheme` attribute, and tldraw's `colorScheme`. */
  scheme: ColorScheme
  /** Inline `--ss-*` values, present only for a palette. */
  style: Record<string, string> | undefined
  /** For the settings list and the report. */
  label: string
  /** The palette in force, if any. */
  palette: ThemePalette | undefined
}

export function applyThemeChoice(
  choice: ThemeChoice,
  palettes: readonly ThemePalette[],
): AppliedTheme {
  if (choice.kind === 'palette') {
    const palette = palettes.find((candidate) => candidate.id === choice.id)
    if (palette) {
      return {
        theme: PALETTE_THEME_ID,
        scheme: palette.scheme,
        style: tokensToStyle(palette.tokens),
        label: palette.label,
        palette,
      }
    }
    // A palette that was removed, or an id from a newer build: the default,
    // not a blank chrome.
    return applyThemeChoice(DEFAULT_THEME_CHOICE, palettes)
  }
  return {
    theme: DEFAULT_THEME_ID,
    scheme: choice.scheme,
    style: undefined,
    label: SYSTEMSKETCH_SCHEME_LABELS[choice.scheme],
    palette: undefined,
  }
}

export const SYSTEMSKETCH_SCHEME_LABELS: Record<ColorScheme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match system',
}

/** The five tokens a picker swatch paints. */
export type SwatchTokens = Pick<ThemeTokens, 'surface' | 'surfaceRaised' | 'text' | 'accent' | 'border'>

/**
 * What the default theme's swatches show. The values are tldraw's own light
 * and dark palette — the same ones `tokens.css` carries as its root fallback,
 * copied from `node_modules/tldraw/tldraw.css` — because a swatch for "Light"
 * has to show light even while dark is on, so it cannot read the live tokens.
 */
export const SYSTEMSKETCH_SWATCHES: Record<PaletteScheme, SwatchTokens> = {
  light: {
    surface: 'hsl(210 20% 98%)',
    surfaceRaised: 'hsl(0 0% 99%)',
    text: 'hsl(0 0% 18%)',
    accent: 'hsl(214 84% 56%)',
    border: 'hsl(0 0% 91%)',
  },
  dark: {
    surface: 'hsl(240 5% 6.5%)',
    surfaceRaised: 'hsl(235 6.8% 13.5%)',
    text: 'hsl(0 0% 85%)',
    accent: 'hsl(217 89% 61%)',
    border: 'hsl(240 9% 22%)',
  },
}

/** One row of the picker. */
export interface ThemeOption {
  id: string
  label: string
  /** A short provenance line under the label. */
  detail: string
  scheme: ColorScheme
  choice: ThemeChoice
  /** Whether a person may remove it — only imported palettes. */
  removable: boolean
}

export function themeOptions(
  builtIn: readonly ThemePalette[],
  imported: readonly ThemePalette[],
): ThemeOption[] {
  const schemes: ColorScheme[] = ['light', 'dark', 'system']
  const defaults = schemes.map<ThemeOption>((scheme) => ({
    id: `systemsketch:${scheme}`,
    label: SYSTEMSKETCH_SCHEME_LABELS[scheme],
    detail: scheme === 'system' ? 'SystemSketch · follows the OS' : 'SystemSketch',
    scheme,
    choice: { kind: 'systemsketch', scheme },
    removable: false,
  }))
  const palette = (item: ThemePalette, removable: boolean): ThemeOption => ({
    id: item.id,
    label: item.label,
    detail: item.source,
    scheme: item.scheme,
    choice: { kind: 'palette', id: item.id },
    removable,
  })
  return [
    ...defaults,
    ...builtIn.map((item) => palette(item, false)),
    ...imported.map((item) => palette(item, true)),
  ]
}

export function sameChoice(left: ThemeChoice, right: ThemeChoice): boolean {
  if (left.kind !== right.kind) return false
  return left.kind === 'palette'
    ? left.id === (right as { id: string }).id
    : left.scheme === (right as { scheme: ColorScheme }).scheme
}

// --------------------------------------------------------------------------
// Persistence. Two keys: the choice, and the palettes a person imported.
// Both are conveniences — a bad value must never stop the app drawing.
// --------------------------------------------------------------------------

export const THEME_STORAGE_KEY = 'systemsketch.theme.v1'
export const IMPORTED_PALETTES_STORAGE_KEY = 'systemsketch.imported-themes.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const SCHEMES: readonly string[] = ['light', 'dark', 'system']

export function parseStoredThemeChoice(value: unknown): ThemeChoice {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.choice)) {
    return DEFAULT_THEME_CHOICE
  }
  const choice = value.choice
  if (choice.kind === 'palette' && typeof choice.id === 'string' && choice.id) {
    return { kind: 'palette', id: choice.id }
  }
  if (choice.kind === 'systemsketch' && typeof choice.scheme === 'string' && SCHEMES.includes(choice.scheme)) {
    return { kind: 'systemsketch', scheme: choice.scheme as ColorScheme }
  }
  return DEFAULT_THEME_CHOICE
}

export function readThemeChoice(storage: Pick<Storage, 'getItem'>): ThemeChoice {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY)
    return stored === null ? DEFAULT_THEME_CHOICE : parseStoredThemeChoice(JSON.parse(stored))
  } catch {
    return DEFAULT_THEME_CHOICE
  }
}

/**
 * The resolved scheme is stored beside the choice so the pre-paint script in
 * `index.html` — which has no palette table — can still paint the page dark
 * before the bundle arrives.
 */
export function writeThemeChoice(
  choice: ThemeChoice,
  storage: Pick<Storage, 'setItem'>,
  scheme: ColorScheme = choice.kind === 'systemsketch' ? choice.scheme : 'dark',
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, choice, scheme }))
  } catch {
    // A theme is a convenience preference; drawing must keep working.
  }
}

export function isThemeTokens(value: unknown): value is ThemeTokens {
  if (!isRecord(value)) return false
  return TOKEN_NAMES.every((name) => typeof value[name] === 'string' && value[name] !== '')
}

export function isThemePalette(value: unknown): value is ThemePalette {
  return (
    isRecord(value)
    && typeof value.id === 'string' && value.id !== ''
    && typeof value.label === 'string'
    && (value.scheme === 'light' || value.scheme === 'dark')
    && typeof value.source === 'string'
    && isThemeTokens(value.tokens)
  )
}

export function parseStoredPalettes(value: unknown): ThemePalette[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.palettes)) return []
  return value.palettes.filter(isThemePalette)
}

export function readImportedPalettes(storage: Pick<Storage, 'getItem'>): ThemePalette[] {
  try {
    const stored = storage.getItem(IMPORTED_PALETTES_STORAGE_KEY)
    return stored === null ? [] : parseStoredPalettes(JSON.parse(stored))
  } catch {
    return []
  }
}

export function writeImportedPalettes(
  palettes: readonly ThemePalette[],
  storage: Pick<Storage, 'setItem'>,
): void {
  try {
    storage.setItem(IMPORTED_PALETTES_STORAGE_KEY, JSON.stringify({ version: 1, palettes }))
  } catch {
    // See writeThemeChoice.
  }
}
