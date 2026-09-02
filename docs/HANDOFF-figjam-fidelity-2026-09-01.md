# Handoff — FigJam fidelity, remaining work

**For:** a Fable model continuing the appearance-menu copy.
**Repo:** `/home/bam/systemsketch`, branch `main`. Baseline commit `3027da6`.
**Read first:** `CLAUDE.md` (the one rule: tldraw stays stock), then
`docs/appearance-menu-implementation-2026-09-01.html` §3, which is the current
state of the copy and why each value is what it is.

---

## The standing instruction

Zach's brief is a **pixel-for-pixel** copy of FigJam's selection menu, because the
icons and layout carry muscle memory:

> "Its super important that we match the same icons. the icons really communicate
> alot regarding what the thing is and there is alot of muscle memory there."

So the rule for every task below is: **read the value out of FigJam, do not judge
it.** Three of the four defects fixed in this pass were already sitting in a
capture that had been taken and not read.

---

## What is already done (do not redo)

| | Where |
|---|---|
| FigJam's 21 colours, as a stock `TLTheme` | `src/appearance/figjamPalette.ts` |
| 49 traced icons, namespaced by control | `src/appearance/figjamIcons.ts` (generated) |
| Which icon means which tldraw value | `src/appearance/figjamIconMap.ts` |
| Control order `start → line shape → end` | `src/appearance/appearanceModel.ts` |
| Three line shapes for a cable | same, `CONNECTION_ROUTING_OPTIONS` |
| Chrome tokens (40px pill, `#1e1e1e`, `#9747ff`, chevron path) | `src/appearance/figjamTokens.ts` |

Green at baseline: `npm run check` (tsc + 379 vitest + 29 Python) and
`npm run test:appearance` (12/12 in a real browser).

---

## The capture harness — use it, don't guess

```bash
cd ~/systemsketch/tools/figjam && bash launch.sh
```

Then `CDP_PORT=9333 python3 icon_trace.py <subject>`. Subjects are `shape`,
`shape-text`, `connector`, `connector-text`, `text`. `tools/figjam/README.md`
lists the four things that silently break it. Already-taken readings:

- `docs/assets/figjam-menu-inventory.json` — every control and popover per
  subject, with geometry. **Check this before capturing anything new.**
- `docs/assets/figjam-icons-traced.json` — the 49 icons.
- `docs/assets/figjam-palette-hex.json` — the 21 colours + Custom.

---

## Task 1 — The custom colour picker  *(highest value; Zach asked for it by name)*

FigJam's palette has a 22nd cell, **Custom**, at grid position row 2 column 11
(a 32×32 cell where the others are 24×24 — see the inventory). It opens a
picker. We show 21 swatches and no picker.

The stock route is the same one the palette used. `registerColorsFromThemes`
adds any colour a theme names, so a picked colour becomes a registered colour:

```ts
editor.updateThemes((themes) => ({ ...themes, default: withCustomColor(themes.default, hex) }))
```

Verify before building — `node -e` against `@tldraw/tlschema` — that adding a
colour to a live editor's theme (a) grows `DefaultColorStyle.values` and (b) does
not remove the existing ones. The removal half of that function is the trap: it
unregisters any colour absent from *every* theme, so the new theme must carry all
the existing ones. Capture FigJam's picker first
(`appearance/shape-11-custom-color-picker.png` exists as a still).

**Open question for Zach, do not decide alone:** a custom colour is per-document
state, and a board that stores `custom-a3f2c1` must still open on a build that
has never seen it. Ask before choosing between a fixed set of custom slots
(bounded, safe) and unbounded named colours (faithful, needs the theme rehydrated
from the document on load).

## Task 2 — FigJam's "Line style" is one control, ours is two

FigJam's connector `Line style` popover is **145×44** and holds *both*
`Thin / Thick` **and** `Solid / Dashed` (inventory: `"Line style Thin Thick Line
style Solid Dashed"`). For a shape it is **368×129** and holds
`Solid / Dashed / None` *plus the whole colour palette*.

We show `dash` and `size` as two separate triggers. Merging them means one
popover writing two style props — `AppearanceControl` already supports exactly
this via `modeControl` (that is how Fill sits above the palette). Reuse it rather
than inventing a second mechanism.

Note the deliberate deviation already recorded in report §4: tldraw's `size`
drives stroke weight *and* text size from one prop, so a merged control is a
presentational grouping, not a split of the underlying style.

## Task 3 — The remaining icons

`figjamIconMap.ts` is deliberately partial. These tldraw values still fall back
to a hand-drawn glyph because FigJam has no equivalent:

- `dash`: `draw`, `dotted`
- `size`: `m`, `l`
- `arrowheadStart/End`: `square`, `pipe`, `bar`
- `geo`: 11 of 20 (`star`, `cloud`, `heart`, `x-box`, `check-box`, the four
  arrows, `rhombus`, `rhombus-2`)
- `verticalAlign`: all three

**Leave these as drawn glyphs unless FigJam actually has the icon.** Inventing a
FigJam-looking icon for a state FigJam does not have is worse than not matching —
it teaches a muscle memory that is wrong. What *is* worth doing: FigJam's shape
library has 22 entries and we map 9. Several unmapped FigJam shapes
(`Cylinder`, `Document`, `Folder`, `Chevron`…) have no tldraw `geo` value, so
this is bounded by tldraw, not by the tracing.

## Task 4 — The multi-select label

Selecting two Blocks and three shapes shows **"2 Blocks"**. The union of
*settings* is correct — that was verified — but the label counts only Blocks, and
the Block-only S/P/E group is unmarked, so it reads as though the Block has
overridden the selection.

`src/blocks/ui/BlockSelectionMiniMenu.tsx`. **This file is peer-owned and was
being actively edited** — `ls --time-style=full-iso` it first, and if it moved in
the last few minutes make a surgical exact-match edit or leave it and say so.

## Task 5 — Blocks have no appearance at all

A Block declares only `systemsketch:*` style props, so it contributes nothing to
the menu. This is **not a bug to fix silently** — it needs Zach's decision on what
a Block's colour should *mean* (its header? its border? a semantic category?).
Ask; do not invent a mapping.

---

## How to know you are done

1. `npm run check` green — tsc, vitest, Python.
2. `npm run test:appearance` green, and **look at the frames it writes** into
   `docs/`. The arrowhead-in-the-shape-picker bug passed every assertion; it was
   only visible in the screenshot.
3. Extend `docs/build_appearance_menu_implementation.py` — **one report per unit
   of work**, do not start a second. Measure every number at build time from the
   live repo; the builder already has helpers in `docs/report_measurements.py`.
4. Re-link it from `README.md`.

## Two traps that cost real time here

- **A wrong icon key does not throw.** It falls back to a drawn glyph and looks
  deliberate. `figjamIconMap.test.ts` guards the mapping; keep it passing, and if
  you add a control, add it to that test.
- **Several agents edit this tree at once.** Never `git add -A`; read
  `git diff --cached --name-only` before every commit; never kill a server you
  did not start (`ss -ltnp | grep 432` first — Stable is 4321, Preview 4322).
