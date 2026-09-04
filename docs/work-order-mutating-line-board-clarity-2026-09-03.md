# Work order: finish the critique→fix loop on the mutating-line review board

**Status:** round 3 of the loop is about to start (a builder task was queued
and then interrupted before launch — nothing lost, its exact prompt is
reproduced below). Rounds 1 and 2 are complete and their findings are the
proof this needs. This is a handoff brief for whoever continues the loop —
everything below is either verbatim agent output already produced, or a
direct reading of source files, not speculation.

## What Zach asked for

He opened `sketches/review/mutating-line-examples.systemsketch` (the 20-example
"mutating line" board covering `list.append`-style in-place mutations across
Port/Expanded/Simple views — the underlying effect-port/mutation-hook feature
itself is **already verified correct**, documented in
[`docs/mutating-line-review-2026-09-03.html`](mutating-line-review-2026-09-03.html),
and is **not** in question here) and said:

> "This looks like a complete mess... there's a lot of work to do here...
> I'm not even sure what's going on... it looks like an amateur."

He asked for an explicit **loop**: spawn an agent to critique the board,
hand the critique to another agent to fix it, repeat, "continue until you
think it's all looking good." This work order is that loop, mid-flight.

**Scope discipline: this is purely an information-design / visual-clarity
task.** Do not re-litigate whether the mutation grammar itself is correct.

## The standing infrastructure (should still be alive, verify first)

A detached preview server pair was launched for this work, separate from
Zach's own Stable (4321/4323) and Preview (4322/4323) — **never touch those**.

```
vite:  http://127.0.0.1:4780  (SYSTEMSKETCH_API_PORT=4781)
api:   http://127.0.0.1:4781  (scripts/server.py --allow-source-root)
```

Board URL:
```
http://127.0.0.1:4780/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Fmutating-line-examples.systemsketch
```

**Check `ss -ltnp | grep 478` before assuming these are still running** —
they were started with `nohup … & disown` from an interactive shell and may
or may not have survived. If dead, relaunch:

```bash
cd /home/bam/systemsketch
FILES_ROOT=$(mktemp -d); DIST=$(mktemp -d); RELEASE=$(mktemp -d)
nohup python3 scripts/server.py --port 4781 --dist "$DIST" --channel preview \
  --build mutline-review --release-home "$RELEASE" --source-root "$PWD" \
  --files-root "$FILES_ROOT" --allow-source-root > /tmp/mutline-api.log 2>&1 < /dev/null &
disown
SYSTEMSKETCH_API_PORT=4781 nohup node node_modules/vite/bin/vite.js \
  --host 127.0.0.1 --port 4780 --strictPort > /tmp/mutline-vite.log 2>&1 < /dev/null &
disown
```
Confirm with: `curl -s http://127.0.0.1:4780/api/health` proxied through vite
(should return JSON with `"documentRoots"` including `/home/bam/systemsketch`
— that's the `--allow-source-root` flag working).

**CDP screenshot/inspection primitives:** `tests/cdp_kit.mjs` exports
`launchChrome`, `openCdpPage`, `evaluate`, `waitFor`, `delay`. Pattern used
throughout both audit rounds:

```js
import { writeFile } from 'node:fs/promises'
import { launchChrome, openCdpPage, evaluate, waitFor, delay } from '/home/bam/systemsketch/tests/cdp_kit.mjs'
const session = await launchChrome({ label: 'x', width: 1920, height: 1080, offline: false })
try {
  const page = await openCdpPage(await session.devToolsPort(), { width: 1920, height: 1080 })
  await page.send('Page.navigate', { url: 'http://127.0.0.1:4780/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Fmutating-line-examples.systemsketch' })
  await waitFor(page, `document.querySelector('.tl-container')`, 'canvas', 60000)
  await delay(1500)
  // editor is window.__systemsketch.editor inside evaluate() strings
} finally { session.kill() }
```

Screenshots/geometry dumps from rounds 1–2 were written under a
**session-scoped `/tmp` scratchpad that will NOT survive into a new agent
session** — don't go looking for them; regenerate fresh ones if you need
evidence. What DOES persist (in the repo, in the working tree, uncommitted):

- `docs/make_mutating_line_examples_recipe.py` — the round-1 generator
  (Python; reads no external state, emits a recipe JSON, then shells out to
  `create_fixture.mjs --force` to regenerate the board in place). **Extend
  this file, don't create a parallel one.**
- `sketches/review/mutating-line-examples.recipe.json` — the full recipe
  (30 blocks, all ports/types, 12 bindings, notes) the generator produces.
- `sketches/review/mutating-line-examples.systemsketch` — the live board.
- `sketches/review/mutating-line-examples.png` — last rendered snapshot.
- Reference for the recipe schema / how `create_fixture.mjs` is invoked:
  `skills/systemsketch-review-fixture/SKILL.md` and
  `skills/systemsketch-review-fixture/scripts/create_fixture.mjs`.

**Nothing here is committed.** Working tree only. Do not merge to `main` or
touch git state beyond it without Zach's explicit go-ahead (standing
instruction from earlier in this task).

## Progress so far

### Round 1 (done)

An `auditor` (Opus, no edit access) drove the original board cold and found
it was a near-total information-design failure — 34% of all text truncated,
blocks physically overlapping, the title sliced by its own instructional
cards, zero section framing, zero legend, duplicate names triggering the
app's own "Draft 1/2" disambiguation pills (reading as *unfinished*), and a
portrait-shaped board (aspect 0.49) crammed into a landscape viewport,
capping fit-zoom at ~30%. Full 21-item punch list was produced (not
reproduced here — round 2 below is the current source of truth, since it
re-verified everything round 1 claimed).

A `builder` (Sonnet) then wrote `docs/make_mutating_line_examples_recipe.py`
from scratch (the recipe survived even though the *original* pre-round-1
generator script did not — it lived in scratch and was wiped). It added:
stock tldraw frames per difficulty tier with real header labels, a
measured-from-real-DOM sizing formula (`width = max(320, ceil((20.9×len(title)
+ 80 + (draft_pill?74:0))/20)×20)`) so nothing truncates, unique titles for
every block (eliminating every Draft-N pill), visible 1–20 numbering, a real
legend panel with worked mini-examples, one reconciled PASS-WHEN card. It
also confirmed via source reading (`layoutBlock.ts:589`,
`finiteDimension(props.w)`) that **Block width does NOT auto-size to
content** — it's always author-specified, so the sizing formula above is the
correct permanent approach, not a workaround.

**Real bug found and correctly scoped out:** wiring a `connection` between
two Blocks nested inside a plain stock Frame renders invisibly (correct
bindings/path, painted behind the Frame's own fill) — `connectionScope.ts`'s
`blockScopeId`/`cableCompositingParent` only recognize Expanded Blocks and
Branch/Loop as cable-hosting containers, not an ordinary Frame. Worked
around in the recipe using the same `meta.systemSketch.kind:'imported-page'`
marker the app's own single-page migration already uses. The real app-level
fix was filed separately as background task `task_6fea309b` ("Make plain
Frames host their own cables") — **don't refix this, it's tracked.**

### Round 2 (done) — verdict: NEEDS ROUND 3

A fresh, independent `auditor` re-drove the rebuilt board (not trusting
round 1's own screenshots) and confirmed the structural rebuild held —
**1 of 1776 text nodes clipped** (benign), **zero** Draft-N pills, all 20
ordinals present, tier frames real — but found a new, more specific cluster
of collisions the rewrite introduced or missed. Verdict quote: *"Zach would
not call this 'amateur' any more; he would call it 'close, but you didn't
look at it.'"*

It also definitively **settled two open questions**:

- **Cold-boot camera/zoom-to-fit is permanently out of scope.** Proven by
  patching a throwaway copy's saved camera record and reopening cold — the
  camera reset to `{x:0,y:0,z:1}` anyway. Root cause: tldraw's camera
  record is `scope:"session"` (`@tldraw/tlschema/.../TLCamera.js:59`),
  discarded by `parseTldrawJsonFile`; `editor.zoomToFit()` only runs inside
  `singlePageDocument.ts:203`'s multi-page-consolidation branch, never on an
  ordinary reopen; there's no `?camera=` URL param. **Do not re-attempt
  this.** (Silver lining: cold boot at 100%/top-left is a defensible landing
  — title + intro card + PASS card + examples 1–4 visible — the real damage
  is only to must-fix #7 below, where an intro card points at the wrong
  place for the legend.)
- **A genuine app-level bug, unrelated to this board:** stock Frame fill and
  frame-label text become nearly illegible in dark theme (measured contrast
  1.10–1.31:1, WCAG AA needs 4.5:1) — reproduced on a completely blank board
  with no file loaded, so it's a global bug in how `getColorValue(colors,
  "black", "frameFill")` resolves for dark mode, not fixture content. **This
  has been filed as background task `task_b01b9d78` ("Fix frame text
  contrast in dark theme") — do not fix app source for this here.**

## THE ACTUAL NEXT STEP: round 3 must-fix + would-help list

Everything below is round 2's verbatim, geometry-verified findings (not
eyeballed — every claim has a coordinate/measurement backing it, produced
via `getCurrentPageShapes()` dumps and `elementFromPoint` hit-testing). Hand
this directly to a `builder` (Sonnet, high effort) — nothing here requires
further design judgment, only careful implementation and per-item
verification with the same rigor round 2 used (**not** a visual glance).

### MUST FIX

1. **`wire-9a` draws a strikethrough through example 9's caption**
   (`note-r2c0`, ~250px overlap at y≈2269). General problem: cable paths and
   caption/note boxes were never checked against each other. Fix: after
   generating, read back real connection paths (`getConnectionRenderPoints`
   or the rendered SVG `d`) and check for overlap with every text shape's
   bounds; reposition captions (or the geometry that determines where a
   cable's known exit corridor runs) until clear. Iterate, don't guess once.

2. **`mut` pills are bisected by a solid cable stroke on vertical runs**,
   rendering as "mʉt" — affects examples 1, 9, 13, and the legend's own
   `mut` pill example. The `mut z⁻¹ = 1.0` pill is unaffected (sits on a
   dotted segment).
   **Before touching layout, determine root cause.** Reading
   `src/blocks/connections/ConnectionShapeUtil.tsx` myself: paint order is
   correct (`DataCablePath` before `DelayPill`), the pill rect has an opaque
   `fill`, no rotation transform, text is centered in an axis-aligned rect
   sized by `delayPillWidth()`. A pill should NOT be occluded by its own
   cable. Leading hypothesis: this is the same "no automatic cable-route
   separation" limitation already documented in
   `docs/mutating-line-review-2026-09-03.html` §4 (two cables can share an
   identical corridor) — what's bisecting the pill may be a **different**
   connection's path, drawn later in shape z-order, crossing exactly at
   that pill's position. **Verify with real geometry**: dump every
   connection's rendered path and check which other connection (if any)
   crosses each affected pill's rect bounds.
   - If confirmed as cross-cable collision → fixture-level fix: move
     `pillPosition` and/or the colliding blocks/ports so no two cables'
     paths cross near a pill (same category of fix as items 1 and 3).
   - If it's genuinely same-cable self-occlusion (a real rendering-order
     bug) → do **not** attempt an app source fix this round. File it as its
     own background task (same pattern as `task_b01b9d78`), then apply a
     fixture-level workaround (move that pill's `pillPosition` off the
     crossing point) so the board reads clean regardless.

3. **Cables draw directly through the orange ordinal chips 01, 09, 13**
   (same color, digit and wire merge). Reposition chips so no connection's
   rendered path crosses them — same path-vs-shape geometry check as #1.

4. **Example 18's caption (`note-18`) prints on top of its own blocks**
   (`nest_outer`/`nest_mid`/`nest_inner`). Root cause: captions in that row
   sit at a hardcoded shared y regardless of each column's actual block
   height (17's stack is 362 tall, 18's is 522 tall; both captions were
   placed at y=2002). Fix: compute each caption's y from **its own
   column's** actual rendered bottom edge, never a shared per-row constant.

5. **Nested parent blocks' own port labels are hidden under their child
   block** — confirmed via `elementFromPoint` hit-testing on **all 3**
   nesting examples on the board (`run_outer`'s "poses" under
   `append_inner`; `nest_mid`'s "poses" and `nest_outer`'s "list[Pose]"
   under `nest_inner`). Root cause: children are inset only ~48px from the
   parent's left edge and start above the parent's own port row, burying
   it. Fix: give child blocks enough top-inset to start **below** the
   parent's own port-row band. Verify with the same hit-test method on all
   3 examples, not a sample of one.

6. **Hard-wrapped captions/legend text don't match their real rendered box
   width**, producing stub lines — worst case, the legend splits the token
   `z⁻¹` itself mid-line ("...'mut z⁻¹ =⏎1.0' pill..."). Compute wraps from
   real font metrics and real box width (word-wrap, don't hand-author `\n`
   breaks that don't match); verify by reading back the actual rendered
   line count/content, not by trusting the wrap calculation.

7. **The intro card says "See the Legend frame (bottom)" but the legend is
   actually top-right**, same row as the first tier. Fix the text to match
   reality (or move the legend somewhere the text can correctly describe —
   either direction is fine, they just need to agree).

8. **Terminology gaps/mismatches.** "tether" appears 3× in visible text
   (PASS card, caption 1, caption 17) but the legend never names or draws
   it — add a legend entry for the tether (dashed connector from a mutated
   argument's hook to its effect port; geometry/CSS reference:
   `src/blocks/effectTether.ts`, `src/blocks/ui/block-canvas.css`). Also fix
   caption 13: it says "so the cables cross on purpose" but round 2 verified
   geometrically that on that example the **tethers** cross (correct,
   matches the PASS card) while the **cables** are collinear/overlapping,
   not crossing — reword to say "tethers", matching the PASS card's own
   correct usage.

### WOULD HELP (after must-fix, time permitting)

9. Board is 42% empty by area (dead bands above the tiers, below the
   legend), pinning fit-zoom at ~27%; real aspect is 2.11 (not the ~1.95
   previously claimed). Tighten the macro layout to shrink those bands.
10. Ordinal chips stagger up to 88px because rows are bottom-aligned
    (captions share a baseline) while chips ride the top — keep chips on a
    common top position regardless of block-bottom alignment.
11. Numbering format is inconsistent 3 ways: chips "01"–"20", captions
    "1 - "/"20 - ", intro card "numbered 1-20". Pick one style everywhere.
12. Legend covers only 4 marks; the board visibly uses more — at least 4
    port-ring colors (orange hook, green on `str`-typed ports, olive/tan on
    `dict`/`Any`-typed, grey on plain producer/consumer values), hollow vs.
    filled rings (unwired vs. wired), "Simple view"/"Port view" labels
    (captions 17/20). Add coverage for whichever are actually meaningful to
    THIS feature's vocabulary; skip ordinary tldraw/product chrome (the
    `call` chip, the `⋮` menu) that isn't mutation-grammar-specific.
13. In the legend, the dotted `mut z⁻¹` example cable is hidden under the
    solid `mut` example cable for its first ~229px — reposition so both
    are visually distinct along their whole length.
14. 7 secondary/companion blocks (`run() — collapsed`, `len (delayed)`,
    `append (port view)`, `len(poses)`, `use`, `len(pending)`,
    `show(a)`/`show(b)`) have no visible number/label tying them to their
    example — give each a small sub-label or fold them under their
    example's existing number.
15. Example 20's ordinal chip sits below its "Simple view" label, unlike
    every other example (chip is topmost) — reorder for consistency.

## What "done" (for round 3) means

1. Extend `docs/make_mutating_line_examples_recipe.py` (don't fork a second
   generator) and regenerate the board in place via `create_fixture.mjs`.
2. Cold-reopen-verify: fresh Chrome tab, expected shape count, zero console
   errors.
3. For every MUST FIX item, verify with real geometry/DOM evidence — cross-
   shape overlap checks, `elementFromPoint` hit-tests, computed
   positions/line counts — not a visual glance. Round 2 was explicit that
   this bar should not slip just because visible effort went into round 1.
4. Fresh screenshots proving each must-fix item is resolved.
5. Report: what changed and why; the item-2 root-cause finding (cross-cable
   collision vs. genuine rendering bug, and if the latter, confirmation a
   background task was filed and a fixture workaround applied instead of
   touching app source); which items were completed vs. deferred and why.

## After round 3 lands

Spawn **another independent `auditor`** (fresh instance, don't reuse — it
must not inherit sympathy for the fix it's grading) for round 4, same
mandate as rounds 1–2: cold first impression, systematically re-check every
failure class from prior rounds (a rewrite can reintroduce them), judge any
new elements on their own merits, honest verdict. Keep alternating
auditor → builder → auditor until an auditor's verdict is genuinely "ship
it, only trivial nitpicks" — do not stop on a builder's self-report alone,
and do not soften the audit bar just because multiple rounds have already
happened.

**Once the loop converges:**

1. Rebuild the write-up: `python3 docs/build_mutating_line_review.py`
   regenerates `docs/mutating-line-review-2026-09-03.html` — update its
   screenshots/assets (`docs/assets/mutline-*-2026-09-03.png`) to reflect
   the final board, and add a short section documenting the critique/fix
   loop itself (what round 1 found, what changed, what round 2 caught,
   final state) since that process is itself part of what Zach asked to
   see proof of.
2. Confirm `README.md`'s existing entry for this report (search for
   "mutating-line-review") still accurately describes the board — update it
   if the final layout differs materially from what's currently written
   there.
3. Report back to Zach with before/after screenshots and a plain summary:
   what was wrong, what the loop fixed, what (if anything) is left and why
   (e.g. the two items confirmed permanently out of scope, and the two
   background tasks filed for unrelated app bugs).
4. **Do not merge anything to `main`** without an explicit go-ahead in
   chat — this stays working-tree-only until Zach approves, per his
   standing instruction earlier in this task.
