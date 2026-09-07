# Work order — line thickness shipped; the contextual-menu composition layer is now the surface to build on

**For:** the agent picking this up. **Repo:** `~/systemsketch`.
**Branch:** `claude/rectangle-line-thickness-86b080`, worktree
`/home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080`, commit
`900cb1fa`, forked from `main` at `0655fff8`.
**Written:** 2026-09-06, from measurements on that tree. Re-measure before trusting a number.

**Merge status.** Zach asked for it to land. The branch is a strict descendant of `main`,
so it is a clean **fast-forward** — no conflicts, no merge commit needed. It is *not*
merged yet only because another session has uncommitted work in the main checkout
(`/home/bam/systemsketch`: a Code-block legacy-migration track touching `src/code/*`,
plus edits to `README.md` and `package.json`, which this branch also changes). Git
correctly refuses rather than overwriting them, and stashing is forbidden here — the
stash stack is shared across every worktree. Once those two files are committed there:

```bash
cd /home/bam/systemsketch && git merge --ff-only claude/rectangle-line-thickness-86b080
```

Report (hero recording, the ladder, the lab, the prior art):
`docs/line-thickness-2026-09-06.html`.
Board: `sketches/review/line-thickness.systemsketch`.

---

## What was asked, and what shipped

Zach, in `Sources/Daily Notes/Daily Note - Sep 6 2026.md`, three messages:

1. *"I need the option to control the line thickness of the rectangle. Right now its
   seems linked to the thickness of the text which is bad!!! please ad the option to
   the menu … for the icons we can take inspiration and copy excali draw."*
2. *"That same menu should work for the line formating … in the spirit of the modular
   composable contextual menu. all the icons by construction must be the same … In this
   case we hide the color selector and hide the labels and then put the things side by
   side instead of stacked on top of each other."*
3. *"I'm tired of these contextual menus being so buggy … show me how you can build and
   compose these contextual menus in an incredibly modular way. Please just check for
   prior art … make a generic contextual menu with all the different configuration
   levers that I can just press myself."*

All three landed. The diff is 47 files; the load-bearing parts are below.

---

## The problem, stated exactly

Stock tldraw derives a geo shape's stroke width **and** its label font size from one
`size` rung — `theme.strokeWidth × STROKE_SIZES[size]` and
`theme.fontSize × LABEL_FONT_SIZES[size]` in `GeoShapeUtil`. SystemSketch exposes that
rung as **Font size**, so the Font size list was silently the line-thickness control:
picking Extra large for a title jumped the outline from 3.5px to 10px, and there was no
way to say otherwise. The connector's old **Weight** row wrote the same `size` style —
which a Block cable's painter ignores outright, and which drags label typography along
on every other shape.

Adding a control does not fix that on its own. Both halves were needed.

---

## Architecture — three seams, and the middle one is the idea

### 1. Thickness is an edge fact in `meta`, not a StyleProp

`src/appearance/strokeMeta.ts` already owned "a shape's edge": its own colour, and the
`async` cadence tldraw has no dash value for. Thickness is the third field.

**Why meta and not a StyleProp** (the module's own docstring carries this): a StyleProp
only reaches shapes whose util declares it, and `geo` is tldraw's own shape. Adding a
prop to it changes the on-disk schema of a stock record, so a `.tldr` written here would
stop opening in plain tldraw — the property `stockPrimitiveVisuals.ts` exists to protect.

| Seam | Where |
|---|---|
| The ladder | `STROKE_WIDTH_PX` — `src/appearance/strokeMeta.ts:86` |
| Where it may be painted | `hasAdjustableStrokeWidth` — `strokeMeta.ts:217` |
| What the menu reads | `strokeWidthOf` — `strokeMeta.ts:243` |
| What the canvas paints | `strokeWidthDisplay` — `strokeMeta.ts:271` |
| The write | `applyStrokeWidth` — `strokeMeta.ts:369` |
| The decoupling | `pinStrokeWidth` — `strokeMeta.ts:403` |
| Next-shape memory | `installStrokeWidthDefault` — `strokeMeta.ts:448`, mounted in `src/App.tsx:170` |

**The ladder is anchored, not invented.** thin `2` is tldraw's own `s` width; medium
`3.5` is exactly what every shape is already drawn at, so nothing on an existing board
moves and an untouched rectangle reads truthfully as Medium instead of blank; thick `7`
is double medium, because tldraw's own `s`→`l` span is only 2.5× and would not read as a
ladder. A shape still on `l`/`xl` reports the number it paints and check-marks nothing —
the honest reading, not a rung it is not on.

**The paint rides tldraw's published `getCustomDisplayValues` seam**, which four utils
name identically:

| Shape | Seam |
|---|---|
| `geo` | `systemSketchGeoDisplayValues` — `src/stockPrimitiveVisuals.ts` (configured in `src/excalidrawInterop.ts`) |
| `draw` | `SystemSketchDrawShapeUtil` — `src/stockPrimitiveVisuals.ts` |
| `line` | `SystemSketchLineShapeUtil` — `src/stockPrimitiveVisuals.ts` |
| `arrow` | `ConfiguredArrowShapeUtil` — `src/systemSketchArrow.tsx` |

An arrow's arrowheads size off the same `strokeWidth`, so overriding it scales the heads
with the line — which is why the connector could drop its `size`-writing Weight row.

**The override is divided by the shape's `scale`** (`strokeWidthDisplayValue`) because
tldraw multiplies the display value by it and `customFontSize.ts` moves `scale` to reach
an exact px. That division is what makes a chosen thickness survive a text-size change.

### 2. ONE registered control, composed two ways

`CONTEXTUAL_CONTROL_REGISTRY.strokeWidth` (`src/contextualMenus/contextualControlRegistry.ts`)
is the whole vocabulary: three options, one `glyph` family, one `meta: 'width'` write.
The old connector-only `weight` kind is **deleted** — a second kind for the same concept
is exactly how duplicate controls get composed into one pill (see the `lineShape` WHY
comment for the last time that happened).

- **Shape:** `lineStyleWithThickness` — `src/appearance/appearanceModel.ts:164`.
  `strokeColor` ← `above` `lineStyle` ← `above` `strokeWidth`. Three sections in one
  popover: thickness, line style, palette.
- **Connector:** `connectorLineStyleControl` — same file. `lineStyle` with
  `modeControl: strokeWidth`, `modePlacement: 'beside'`, both at `layout: 'row'` so the
  labels disappear. Zach's literal ask.

The renderer walks the chain rather than handling one mode control:
`stackedModes` — `src/contextualMenus/ContextualControls.tsx:221`. **A new edge section
is one link in the model and no renderer change.**

`withEdgeValues` (`appearanceModel.ts`) drops a meta-only section whose reading is
`null`. That is what keeps the thickness row off a Block cable, whose width is semantic
and whose painter would ignore the override — the model can propose the row for every
edge and let the selection decide. A section backed by a StyleProp still keeps its stock
fallback; do not conflate the two.

### 3. The composition lab — Settings › Menu lab, or `?menu-lab`

`src/prototypes/menuLab/` — a lever board wired to the **real** registry, binder and
renderer. Two entry points, one board: `MenuLabPanel` is what Settings renders (it
mounts nothing — the dialog is already inside the app's editor and UI context), and
`ContextualMenuLab` is the standalone route, which has no app around it and therefore
supplies that context itself. It is not a second menu implementation: it builds `ContextualControl` objects
and hands them to `ContextualControls`. If a composition works there it works in the
product; if it is buggy there the product bug reproduces without a canvas selection.

Levers: `include`, `layout` (`row` is the hide-the-labels lever), `trigger`, `stack`
(`none`/`above`/`beside`), `value` (shared/mixed), `new group`, `↑ ↓` order. It prints
the recipe literal live, and **names** any control stacked onto nothing
(`labDangling` — `menuLabModel.ts:257`) rather than letting it vanish.

Prior art it follows, recorded in `menuLabModel.ts`'s docstring rather than reinvented:

- **VS Code's `menus` contribution point** — a command declared once, surfaces asking
  for it by `group@order` + `when`. That is exactly the registry / recipe /
  `composeContextualControls` split already in this repo.
- **Blender's `layout.prop()`** — the widget comes from the property's type, never
  restated at the call site. That is the registry's `glyph` and `layout` fields.
- **Tweakpane / leva / dat.GUI** — a control panel generated from a schema of levers.
- Zach's own `C - Semantic Type Registry` — "resolve semantics once, then project them
  many times".

---

## Contracts to keep

1. **One vocabulary per concept.** Never register a second kind with the same label and
   options for a different surface. Surfaces differ by *composition* (layout, trigger,
   stack, recipe), never by a private option list.
   `contextualControlRegistry.test.ts` asserts this for both Line shape and thickness.
2. **The renderer never asks the editor who is selected.** Every value flows in through
   a binding. `customSize` exists because that rule was broken once.
3. **A meta-only section with a `null` reading is dropped; a StyleProp-backed one keeps
   its stock fallback.** Both branches have tests.
4. **`hasAdjustableStrokeWidth` is the list of utils actually wired to the paint seam.**
   Widening it without wiring the util produces a control that silently does nothing.
5. **`pinStrokeWidth` only touches shapes with no thickness of their own**, so it
   converges instead of rewriting metadata on every type change.
6. **tldraw stays stock.** `tests/test_stock_boundary.py` pins the arrow util's
   `ArrowShapeUtil.configure({ getCustomDisplayValues })` seam by name.
7. **No colour literals outside `src/theme/tokens.css`, and no phantom `--ss-*`.**
   `tests/test_theme_tokens.py` caught `--ss-ink` in the lab's stylesheet; the real
   token is `--ss-text`.

---

## Deliberately not done

- **Cables (`connection` shapes) have no thickness control.** Their width is semantic —
  an effect cable is thicker than a data cable on purpose — and `ConnectionShapeUtil`
  paints literal widths (2 / 2.6 / 2.8 / `EFFECT_CABLE_WIDTH`). The row reads nothing on
  a cable and is dropped. If a cable *should* take a user thickness, that is a product
  decision first, then a real display-value seam in `ConnectionShapeUtil.tsx` — not a
  widening of `hasAdjustableStrokeWidth`.
- **No custom-px thickness field.** `ContextualCustomSize` already renders a Custom px
  cell for Font size and would compose here, but the mock has three buttons and nothing
  asked for a fourth state. `applyStrokeWidth` takes a rung name; a px channel would
  bind through the same `customSize` seam.
- **`strokeRoundness` is only overridden for `geo`** (tldraw defines it as
  `strokeWidth * 2`). Arrow/line/draw take the width alone; nothing visibly depends on
  it there today.
- **A thickness override does not travel to plain tldraw.** Display values are ours; a
  `.tldr` opened elsewhere paints from `size`. That is the documented, accepted cost of
  the meta approach — the same one stroke colour and the async cadence already pay.
- **Saving lever sets and writing a recipe back to source.** The lab prints the recipe
  literal; it cannot yet save a composition or emit a file. That is the obvious next
  increment if it starts being used to design menus rather than to debug them.
- **No PEP.** Per `docs/peps/README.md` this is a fix plus a composition seam, not a
  fork where two approaches were defensible; the `WHY:` comments carry the rationale at
  the seams. If the cable decision above gets made, that one may deserve a PEP.

---

## What to do next, if anything

Nothing here is blocking. In rough order of value:

1. **Land it.** Then delete `weight` references anywhere they resurface.
2. **Use the lab to audit the other surfaces.** `BLOCK_TITLE_CONTEXTUAL_RECIPE` and the
   Code selection pill were not touched; the lab is now the cheapest way to see whether
   they compose the way they claim to.
3. **Consider the thickness row on the Block title / Code pills** — currently absent
   because neither target carries a painted edge. Probably correct; verify in the lab.
4. If a fourth edge section ever appears (opacity? corner radius?), it is one `above`
   link in `lineStyleWithThickness` and zero renderer changes. That is the test of
   whether this seam actually paid for itself.

---

## How to run it

```bash
cd /home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080 && npm run check
```

`tsc -b` + 1966 vitest + 149 Python tests. Green on `b298f5a9`. Not sufficient for UI.

```bash
cd /home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080 && npm run test:line-thickness
```

9 checks in real headless Chrome, reading exact painted widths off the canvas: the
stacked popover, each rung's painted width, the font-size decoupling, next-shape memory,
the connector's beside-row, and three lab checks. Also re-run the neighbour it changes:

```bash
cd /home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080 && npm run test:selection-menu
```

The appearance journey (`tests/appearance_menu_smoke.mjs`, 24/24) is the one that pins
FigJam geometry; it rewrites committed PNGs, so stage only the frames whose content
actually changed.

Rebuild the report after any change to the code it describes — it measures the tree at
build time and will fail loudly if a seam moved:

```bash
cd /home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080 && python3 docs/build_line_thickness.py
```

Re-record the hero only if the interaction changes (it drives a copy of the fixture, so
the committed board stays pristine):

```bash
cd /home/bam/systemsketch/.claude/worktrees/rectangle-line-thickness-86b080 && node docs/capture_line_thickness_hero.mjs
```

---

## Traps found while building this

- **A journey that opens a committed board autosaves into it.** The first hero recording
  left the review fixture holding its own final state. Drive a copy in the run's
  `filesRoot`; nothing outside it is served.
- **tldraw's arrow util refuses to bind an arrow to another arrow**, so a review-fixture
  cue pointed at a connector must use an absolute target (1 binding, not 2) or the
  fixture helper's binding count check fails.
- **A cue arrow crossing a connector wins the click.** The hero script selected
  `shape:cue-step-3-arrow` instead of the connector until it clicked near the arrowhead.
- **A popover opens above its pill.** A shape near the top of the viewport opens its
  panel off-screen and every option click lands on nothing — centre the camera first.
- **A lab route is its own entry point.** `?menu-lab` rendered transparent-on-canvas
  until it imported `src/theme/tokens.css` itself, and threw four `Uncaught (in promise)`
  errors until it passed `assetUrls={ASSET_URLS}` instead of reaching for tldraw's CDN.
- **tldraw stacks popovers at z-index 400 and dialogs at 500** (measured). A contextual
  surface hosted inside a dialog therefore opens its popover *behind* the dialog — the
  panel is there, painted under the content. The fix is `ContainerProvider`: override
  `useContainer()` for that subtree so both popover paths portal into the host dialog.
  Generalise it if a second dialog-hosted surface appears.
- **React swallows a bare `select.value = …`.** Drive its native setter, then dispatch a
  bubbling `change`, or the lever appears to do nothing.
- **A `.claude/worktrees/` checkout has no `node_modules`.** `npm ci` first or every
  browser journey is red.
