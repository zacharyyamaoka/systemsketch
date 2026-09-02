# Handoff: selection menu + appearance controls

For an agent picking this up in a track worktree. Written 2026-09-01, baseline
`5003713` on `main`.

---

## 0. Start here

```bash
cd /home/bam/systemsketch && python3 scripts/new_track.py appearance
```

That gives you `/home/bam/systemsketch-track-appearance` on `track/appearance`,
forked from `main`, with **your own** dev port, API port, release runtime and
board directory. Read the generated `TRACK.md` first — it carries the three
things that will otherwise make you fight Zach's running Preview:

- serve with `./serve.sh`, **never** `npm run dev` (pinned to 4322 = his Preview)
- never point a test at `~/SystemSketch/Untitled.tldr` (his real board)
- don't run `release:candidate` / `release:promote` without `SYSTEMSKETCH_RELEASE_HOME`

A worktree already exists at `.claude/worktrees/expanded-block-selection-41638d`
on the **old** baseline `df5c2f6`. It cannot see any of this work. If that lane is
still live it needs to rebase onto `5003713` before it will make sense.

---

## 1. What is already done

Two features, both shipped and proven in a real browser.

### Selection contextual menu — *placement*

The dark pill that follows the selection. Copied from FigJam, measured rather
than guessed: [`docs/figjam-contextual-menu-spec-2026-09-01.html`](figjam-contextual-menu-spec-2026-09-01.html).

- centred on the selection, **16 px** clear of its overlay
- **flips below** when its top would land under a **20 px** margin
- clamped to a safe area whose floor is the **bottom tool belt**, not the window
- constant screen size at every zoom
- **removed from the DOM** during drags and resizes, re-anchored on pointer-up

Replaces tldraw's `TldrawUiContextualToolbar`, which clamps where FigJam flips
and whose gap (8) and margin (16) are module constants with no prop. Everything
else is stock.

| File | What it is |
|---|---|
| `src/chrome/selectionMenuPlacement.ts` | the policy, as a pure function. 13 unit tests |
| `src/chrome/SelectionContextualMenu.tsx` | the shell: manipulation gate, `useQuickReactor` position write |
| `tests/selection_menu_smoke.mjs` | `npm run test:selection-menu` — 9 checks |
| [report](selection-menu-implementation-2026-09-01.html) | before/after and why the primitive was replaced |

### Appearance controls — *contents*

Ten controls in the pill, over stock tldraw styles, **no new shape props**.
Captured from FigJam first: [`docs/figjam-appearance-menu-spec-2026-09-01.html`](figjam-appearance-menu-spec-2026-09-01.html).

Shape · Colour + Fill · Stroke · Size · Typeface · Text alignment · Vertical
alignment · Line shape · Start point · End point.

Which controls appear is whatever `useRelevantStyles()` reports, so a connector
gets routing and endpoints where a shape gets fill. Nothing decides it by hand.

| File | What it is |
|---|---|
| `src/appearance/appearanceModel.ts` | which controls, what options, in FigJam order. Pure. 10 unit tests |
| `src/appearance/AppearanceControls.tsx` | one `TldrawUiPopover` per control |
| `src/appearance/AppearanceGlyph.tsx` | previews the value rather than naming it |
| `src/appearance/appearance.css` | FigJam tokens: `rgb(30,30,30)`, 13 px radius, 8 px padding |
| `tests/appearance_menu_smoke.mjs` | `npm run test:appearance` — 12 checks |
| [report](appearance-menu-implementation-2026-09-01.html) | the controls table and the six deliberate deltas |

---

## 2. The open gap — this is the next piece of work

**A Block has no appearance at all.** Select one and the pill shows
`S P E │ Step in │ Inspect` and nothing else. That is Zach's own screenshot, and
it is what he noticed after the appearance work landed.

It is correct given the current design and it is still the wrong outcome:

- `src/blocks/blockModel.ts` defines only **custom** style props —
  `systemsketch:blockView`, `systemsketch:blockPortLayout`,
  `systemsketch:blockShowDescription`. Those are already surfaced by the S/P/E
  group and the inspector.
- It defines **none** of tldraw's — no `color`, `fill`, `dash`, `size`, `font`.
  So `useRelevantStyles()` returns nothing for a Block and
  `buildAppearanceControls` correctly renders nothing.
- Blocks are the primitive Zach mostly draws. His stated goal is *"you can
  basically draw all of the composite primitives you make from scratch"*.

Verified live on Preview, both directions:

```
BLOCK ONLY  → blockMenu: true,  appearanceControls: []
RECTANGLE   → appearanceControls: [geo, color, dash, size, font, align, verticalAlign]
BLOCK+RECT  → blockMenu: true,  appearanceControls: [geo, color, …]   (already fixed)
```

The Block+shape case was a gap I introduced and closed — the controls now ride
on **both** branches of the pill, so a Block never hides its neighbour's paint.
The Block-alone case is untouched and is the real work.

**What it would take.** Giving a Block a colour means adding tldraw's style props
to the Block shape's own props and honouring them in `BlockShapeUtil`'s render.
That is a schema change to a SystemSketch shape, not to tldraw, so it stays
inside the stock boundary — but it needs a migration and it needs a decision
about *which* properties a Block should even have. A Block is not a rectangle:
colour probably means something (state? kind?), stroke and fill probably do not.
**Ask Zach what a Block's appearance should mean before building it.** Do not
infer it from FigJam; FigJam has no Block.

---

## 3. Deliberately not done

| | Why |
|---|---|
| Opacity | Neither FigJam nor our menu has it; Excalidraw does. `getSharedOpacity`/`setOpacityForSelectedShapes` are ready — one control whenever wanted. |
| Custom colour picker | FigJam's 22nd swatch. Needs a colour value outside tldraw's 13-name enum, so a custom style prop. |
| Separate stroke weight | tldraw's `size` drives stroke weight *and* text size from one prop. Splitting needs a custom style prop. |
| Rich text (bold, strikethrough, links, lists) | A separate tldraw feature with its own toolbar. Untouched. |
| FigJam's 11×2 palette | tldraw carries only four light variants, so an 11×2 grid would be mostly holes. Ours is 13 in 7 columns, each hue beside its twin. |

---

## 4. Gotchas already paid for

Do not rediscover these.

1. **`TldrawUiPopover` ORs its open state.** It computes `open || isOpen`,
   combining your prop with its own `useMenuIsOpen`. Track the state yourself
   and you can open a popover but never close it — the trigger stops working.
   Pass neither prop; style on Radix's `data-state="open"`.

2. **A reactor that first runs against a missing element goes silent forever.**
   `useQuickReactor` subscribes to whatever signals it reads. If it returns early
   before reading any, its scheduler never fires again. This is why
   `SelectionContextualMenu` splits the manipulation gate into an outer
   component: the inner one may assume its element exists. From the DOM this
   failure is indistinguishable from a latched early return.

3. **Escape reaches tldraw through an open popover** and clears the selection
   with it. Close popovers by clicking the trigger, not with Escape.

4. **`.tlui-button` re-enables its own pointer events.** Hiding a menu with
   `opacity: 0; pointer-events: none` on the container is not enough — an
   invisible menu still answers `elementFromPoint`. Use the descendant pair
   (`.x, .x *`), which is what tldraw does for its own contextual toolbar.

5. **vitest was collecting every worktree's tests.** A track worktree under
   `.claude/worktrees/` is a second checkout, so `npm run check` in the main tree
   ran its tests too — inflating the count to 610 and letting an unrelated lane
   turn Zach's check red. Excluded in `vite.config.ts`; the real figure for this
   checkout is **310 in 39 files**.

6. **`getSelectionRotatedScreenBounds()` is client-space**, not
   container-relative — it goes through `pageToScreen`, which *adds*
   `screenBounds.x/y`. For an overlay in `InFrontOfTheCanvas`, subtract
   `getViewportScreenBounds()`'s point, which is what tldraw's own primitive
   does internally.

---

## 5. Proving your change

```bash
cd /home/bam/systemsketch-track-appearance && npm run check
```

tsc + 310 unit + 24 Python. **Not sufficient for UI work.** Drive it in a real
browser: a `tests/*_smoke.mjs` CDP journey on your own port, and *look at* the
screenshots.

All browser suites were green at `5003713`. Run them one at a time — each boots
Vite, a Python API and headless Chrome:

```bash
npm run test:appearance && npm run test:selection-menu && npm run test:batch
```

| Suite | At `5003713` |
|---|---|
| `test:appearance` | 12/12 |
| `test:selection-menu` | 9/9 |
| `test:batch` | 11/11 |
| `test:context-menu` | 12/12 |
| `test:click-to-edit` | 9/9 |
| `test:reveal` / `test:edges` / `test:scale` / `test:edge-editor` | 13/13 · 32/32 · 12/12 · 17/17 |

A dev-only hit-area overlay exists from a concurrent session: `?hitareas=1` on
any board, or ⇧H on the canvas, paints every pointer-answering region from the
same functions the hit tests call. Gated on `import.meta.env.DEV`, so it works in
Preview and not in Stable. Useful for anything touching selection or hit targets.

---

## 6. House rules that bit me

- **Stable ≠ Preview.** Stable (`:4321`) serves an immutable build and does not
  swap under an open canvas. Twice I was asked why a change was missing and the
  answer was that the window was Stable. Check
  `curl -s http://127.0.0.1:4321/assets/<bundle>.js | grep -c <a-token-from-your-change>`
  before believing a "it isn't there" report.
- **Reports live in `docs/` and the builder is the source.** One
  `docs/build_<name>.py` emitting a self-contained HTML with captures inlined.
  Measure numbers at build time from the live repo. Render it and look at it
  before handing it over, then link it from `README.md`.
- **Frames belong to the run that asserts them.** Both smoke tests write the
  report's screenshots during the run that checks the behaviour they show, so a
  picture cannot drift from its claim. Keep that.
- **Several sessions edit this tree at once.** Never `git add -A`; stage explicit
  pathspecs and read `git diff --cached --name-only` first. `ls --time-style=full-iso`
  a file before rewriting it — if it moved in the last few minutes it is someone's
  in-flight run.
