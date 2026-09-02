/**
 * The one place that decides which theme is on.
 *
 * A tiny external store in the `interfaceScale` pattern: the choice and the
 * imported palettes live in localStorage, React reads them through
 * `useSyncExternalStore`, and the board is kept in step by `installBoardTheme`,
 * which pushes the scheme into tldraw's own user preference so the canvas
 * flips with the chrome. The embedded lane does not use this store — there
 * the host owns appearance and `EmbeddedCanvas` stamps the root directly.
 */
import { useSyncExternalStore } from 'react'
import type { Editor } from 'tldraw'
import {
  applyThemeChoice,
  DEFAULT_THEME_CHOICE,
  readImportedPalettes,
  readThemeChoice,
  sameChoice,
  writeImportedPalettes,
  writeThemeChoice,
  type AppliedTheme,
  type ThemeChoice,
  type ThemePalette,
} from './themeModel'
import { BUILT_IN_PALETTES } from './palettes'

let choice: ThemeChoice = DEFAULT_THEME_CHOICE
let imported: readonly ThemePalette[] = []
let applied: AppliedTheme | null = null
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window === 'undefined') return
  choice = readThemeChoice(window.localStorage)
  imported = readImportedPalettes(window.localStorage)
}

function allPalettes(): ThemePalette[] {
  return [...BUILT_IN_PALETTES, ...imported]
}

function notify(): void {
  applied = null
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getThemeChoice(): ThemeChoice {
  hydrate()
  return choice
}

export function getImportedPalettes(): readonly ThemePalette[] {
  hydrate()
  return imported
}

/** The attributes and style the app root renders right now. */
export function getAppliedTheme(): AppliedTheme {
  hydrate()
  if (!applied) applied = applyThemeChoice(choice, allPalettes())
  return applied
}

function persistChoice(): void {
  if (typeof window === 'undefined') return
  writeThemeChoice(choice, window.localStorage, applyThemeChoice(choice, allPalettes()).scheme)
}

export function updateThemeChoice(next: ThemeChoice): void {
  hydrate()
  if (sameChoice(choice, next)) return
  choice = next
  persistChoice()
  notify()
}

/** Add (or replace, by id) a palette a person imported, and switch to it. */
export function addImportedPalette(palette: ThemePalette): void {
  hydrate()
  imported = [...imported.filter((item) => item.id !== palette.id), palette]
  if (typeof window !== 'undefined') writeImportedPalettes(imported, window.localStorage)
  choice = { kind: 'palette', id: palette.id }
  persistChoice()
  notify()
}

export function removeImportedPalette(id: string): void {
  hydrate()
  if (!imported.some((item) => item.id === id)) return
  imported = imported.filter((item) => item.id !== id)
  if (typeof window !== 'undefined') writeImportedPalettes(imported, window.localStorage)
  if (choice.kind === 'palette' && choice.id === id) {
    choice = DEFAULT_THEME_CHOICE
    persistChoice()
  }
  notify()
}

/**
 * `index.html` stamps the theme on `<html>` before the bundle runs so the page
 * never flashes light under a dark theme. Once an app root carries the
 * attributes itself, the pre-paint copy has to go: two ancestors naming
 * different themes would make the derivation and the palette push in
 * `tokens.css` fight over the same container.
 */
export function releasePrepaintTheme(): void {
  if (typeof document === 'undefined') return
  document.documentElement.removeAttribute('data-ss-theme')
  document.documentElement.removeAttribute('data-ss-color-scheme')
}

const SERVER_APPLIED = applyThemeChoice(DEFAULT_THEME_CHOICE, [])

export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribe, getAppliedTheme, () => SERVER_APPLIED)
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, getThemeChoice, () => DEFAULT_THEME_CHOICE)
}

const NO_PALETTES: readonly ThemePalette[] = []

export function useImportedPalettes(): readonly ThemePalette[] {
  return useSyncExternalStore(subscribe, getImportedPalettes, () => NO_PALETTES)
}

/**
 * Keep tldraw's board in step with the chrome.
 *
 * tldraw already owns light/dark for everything it paints — the canvas, its
 * menus, the shape palette — behind one user preference, and flips the
 * `.tl-theme__dark` class that every `--tl-*` token hangs off. So the board
 * follows the theme by that supported call and nothing else. Installed from
 * `onMount` beside the other seams; returns the uninstaller.
 */
export function installBoardTheme(editor: Editor): () => void {
  const push = () => {
    const { scheme } = getAppliedTheme()
    if (editor.user.getUserPreferences().colorScheme !== scheme) {
      editor.user.updateUserPreferences({ colorScheme: scheme })
    }
  }
  push()
  return subscribe(push)
}
