/**
 * Custom colours: FigJam's 22nd cell, on tldraw's enum colour style.
 *
 * tldraw's `color` is a closed enum, not a hex, so a colour a person picks has
 * to become a *named* colour before any shape can hold it. The name carries the
 * hex — `custom-a3f2c1` — for one reason: it makes the file self-describing.
 * Every shape that uses the colour stores the hex on itself, so there is no
 * registry beside the shapes that could disagree with them, and a board opens
 * on any build that knows the prefix with nothing to reconcile.
 *
 * Two things have to happen for a name to work, and both go through tldraw's
 * public theme API. The theme must carry the colour (so it paints), and the
 * style enum must accept the name (so the store validates it). `updateThemes`
 * does only the first; `registerColorsFromThemes` does the second, and it is
 * the same call `<Tldraw themes>` makes at mount. The trap is that the store
 * validates *before* it loads: a saved board naming `custom-a3f2c1` fails to
 * parse unless the name is registered first, which is why every load site
 * calls `hydrateCustomColors` on the raw text before parsing it.
 */
import { DefaultColorStyle, registerColorsFromThemes, type Editor } from 'tldraw'

import { FIGJAM_THEME, SYSTEMSKETCH_THEMES, addThemeColor } from './figjamPalette'

export const CUSTOM_COLOR_PREFIX = 'custom-'

const CUSTOM_NAME = /^custom-([0-9a-f]{6})$/
/** Every custom name in a document's text. Quoted, so a stray word cannot match. */
const CUSTOM_NAMES_IN_TEXT = /"(custom-[0-9a-f]{6})"/g
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isCustomColor(name: string | undefined): name is string {
  return typeof name === 'string' && CUSTOM_NAME.test(name)
}

/** `#A3F2C1`, `a3f2c1` or `#abc` → `custom-a3f2c1`; anything else → undefined. */
export function customColorName(hex: string): string | undefined {
  const normalized = normalizeHex(hex)
  return normalized ? `${CUSTOM_COLOR_PREFIX}${normalized.slice(1)}` : undefined
}

/** `custom-a3f2c1` → `#a3f2c1`. */
export function customColorHex(name: string): string | undefined {
  const match = CUSTOM_NAME.exec(name)
  return match ? `#${match[1]}` : undefined
}

/** A six-digit lower-case `#rrggbb`, or undefined when the text is not a colour. */
export function normalizeHex(text: string): string | undefined {
  const match = HEX.exec(text.trim())
  if (!match) return undefined
  const digits = match[1].toLowerCase()
  return `#${digits.length === 3 ? digits.split('').map((d) => d + d).join('') : digits}`
}

/** Every custom colour a document names, in first-seen order, each once. */
export function findCustomColorNames(documentText: string): string[] {
  const names = new Set<string>()
  for (const match of documentText.matchAll(CUSTOM_NAMES_IN_TEXT)) names.add(match[1])
  return [...names]
}

/**
 * Make each name a colour the editor can paint and the store can validate.
 *
 * Idempotent, and cheap when nothing is new. Returns the names that were not
 * yet registered, which is what a caller wanting to know "did this change
 * anything" needs. Pass the editor so its live theme picks the colour up too;
 * without one (before mount, or in a test) the theme prop still carries it.
 */
export function registerCustomColors(names: Iterable<string>, editor?: Editor): string[] {
  const added: string[] = []
  for (const name of names) {
    const hex = customColorHex(name)
    if (!hex) continue
    if (addThemeColor(name, hex)) added.push(name)
  }
  const registered = DefaultColorStyle.values as readonly string[]
  const unregistered = added.filter((name) => !registered.includes(name))
  if (unregistered.length > 0) {
    // Registers every colour the theme names and removes none, because the
    // theme is a spread of tldraw's own plus everything ever added here.
    registerColorsFromThemes(SYSTEMSKETCH_THEMES)
  }
  if (added.length > 0 && editor) {
    // A fresh object, so the theme atom changes identity and every swatch and
    // shape reading `getCurrentTheme()` re-renders with the new colour.
    editor.updateThemes({
      default: {
        ...FIGJAM_THEME,
        colors: { light: { ...FIGJAM_THEME.colors.light }, dark: { ...FIGJAM_THEME.colors.dark } },
      },
    })
  }
  return added
}

/**
 * Register every custom colour a document names, before the document is
 * parsed. The text is scanned rather than the records because the records do
 * not exist yet — parsing is exactly the step that would reject the name.
 */
export function hydrateCustomColors(documentText: string, editor?: Editor): string[] {
  return registerCustomColors(findCustomColorNames(documentText), editor)
}

/** The colour currently registered for a name, as the theme paints it. */
export function registeredHex(editor: Editor, name: string): string | undefined {
  const colors = editor.getCurrentTheme().colors[editor.getColorMode()] as unknown as
    Record<string, { solid?: string } | string | undefined>
  const entry = colors[name]
  return typeof entry === 'object' ? entry?.solid : undefined
}
