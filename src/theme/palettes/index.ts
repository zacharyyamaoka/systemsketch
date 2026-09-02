/**
 * The palettes SystemSketch ships. Each is generated from the source it names
 * by a script in `scripts/`, so a value here is a measurement, not a guess:
 *
 *   - Obsidian Light / Dark — `scripts/extract_obsidian_palette.py`, from the
 *     `app.css` inside Obsidian's own asar.
 *   - Dark Modern — `scripts/import_vscode_theme.mjs`, from the theme file VS
 *     Code and Cursor ship, with its include chain resolved.
 *
 * A palette a person imports at run time goes through the same VS Code
 * mapping and lives in localStorage instead of here.
 */
import type { ThemePalette } from '../themeModel'
import { DARK_MODERN_PALETTE } from './darkModern'
import { OBSIDIAN_DARK_PALETTE, OBSIDIAN_LIGHT_PALETTE } from './obsidian'

export const BUILT_IN_PALETTES: readonly ThemePalette[] = [
  OBSIDIAN_LIGHT_PALETTE,
  OBSIDIAN_DARK_PALETTE,
  DARK_MODERN_PALETTE,
]

export { DARK_MODERN_PALETTE, OBSIDIAN_DARK_PALETTE, OBSIDIAN_LIGHT_PALETTE }
