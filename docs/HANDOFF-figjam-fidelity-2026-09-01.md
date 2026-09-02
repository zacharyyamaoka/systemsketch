# Handoff — FigJam fidelity, state after the second pass

**Repo:** `/home/bam/systemsketch`. **Read first:** `CLAUDE.md` (the one rule: tldraw stays
stock), then `docs/appearance-menu-implementation-2026-09-01.html` §7, which is the current
state of the copy, every FigJam reading beside the token it became, and the decision surface.

## The standing instruction

Zach's brief is a **pixel-for-pixel** copy of FigJam's selection menu, because the icons and
layout carry muscle memory:

> "Its super important that we match the same icons. the icons really communicate alot
> regarding what the thing is and there is alot of muscle memory there."

The rule for anything that remains is unchanged: **read the value out of FigJam, do not judge
it.** The instrument is `tools/figjam/` (`README.md` there lists what silently breaks it and
which capture holds what). Everything the product carries has a reading behind it in
`docs/assets/figjam-*.json`, and the report's build refuses to publish if a reading and its
token disagree.

## Done in the second pass (do not redo)

| Task | Where |
|---|---|
| 1 · Custom colour: FigJam's 22nd cell and its picker; a picked colour is a named colour carrying its hex (`custom-a3f2c1`); every load site hydrates a file's names before parsing | `src/appearance/customColors.ts`, `CustomColorPicker.tsx`, `LocalWorkspace.tsx`, `EmbeddedCanvas.tsx`, `previewClone.ts` |
| 2 · Line style is one control: weight beside dash on a connector, labelled chips on a shape; Font size is a 144px combobox after Typeface | `src/appearance/appearanceModel.ts`, `AppearanceControls.tsx`, `appearance.css` |
| 3 · Five more icons read off FigJam: the Line style and Typeface triggers, the menu check, the eyedropper, Add text | `tools/figjam/chrome_trace.py` → `emit_icons.py` → `figjamIcons.ts` (generated; `--check` in CI) |
| 4 · A mixed selection reads `N selected`, with the S / P / E group captioned `2 Blocks` | `src/blocks/ui/BlockSelectionMiniMenu.tsx` |
| Chrome geometry: 56/54/144px triggers, 24px cells on a 32px pitch, two purples (`#9747ff` chips, `#8a38f5` cells and the swatch ring), the picker's 64/62/184 bands | `src/appearance/figjamTokens.ts`, `appearance.css` |
| Found and fixed: a board in FigJam's teal could not be reopened — `parseTldrawJsonFile`'s themeless store unregistered every non-default colour on parse | `figjamPalette.ts` (`extendDefaultTheme`), pinned by `customColors.test.ts` |

Green: `npm run check`, `npm run test:appearance` (18 checks, geometry asserted against
FigJam's DOM), `test:batch`, `test:selection-menu`.

## Still open

- **Task 5 — a Block's colour.** A Block declares only `systemsketch:*` styles, so it has no
  appearance. What its colour should *mean* (header band, border, or a semantic category) is
  Zach's decision; the report's §7 carries the recommendation (header band via tldraw's own
  `color` style) and the reversible default (leave it). Do not invent a mapping.
- **Paste across sessions.** A shape carrying a custom colour pasted into a session that has
  never registered that name fails tldraw's paste validation before any hook here runs. Known,
  unhandled; a `registerExternalContentHandler` for `tldraw` content is the stock seam if it is
  ever wanted.
- **Stable cannot open a board with a custom colour** (or one in FigJam's teal) until a build
  with this pass is promoted. Same one-way door as every new colour.
- FigJam's shape-picker search, its number field under Font size, and its separate stroke
  weight on shapes are deliberately not copied — each would offer a state tldraw cannot hold.

## Two traps that cost real time here

- **`parseTldrawJsonFile` re-registers colours from tldraw's default theme alone** and removes
  the rest. Anything registered only on the app's theme dies on the first file parse. The
  palette and every custom colour are therefore written into `DEFAULT_THEME` too; keep it that
  way, and keep the parser test.
- **tldraw switches all shortcuts off while any menu is open.** Ctrl+Z inside the picker does
  nothing on its own; the picker answers it through `editor.undo()`. Any new popover that
  expects a shortcut must do the same.
