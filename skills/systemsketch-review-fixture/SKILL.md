---
name: systemsketch-review-fixture
description: Create or refresh feature-specific `.systemsketch` review fixtures after SystemSketch implementation work, with real interaction targets, numbered text cues, arrows, and an exact Preview URL. Use when a completed UI or canvas feature needs a fast human verification board; do not use as a substitute for automated or real-browser acceptance tests.
---

# SystemSketch review fixture

Give Zach a board he can act on immediately after a feature is implemented. The fixture is a review aid: it prepares the right objects and explains the gesture and pass condition on the canvas itself.

## Refresh feature knowledge first

This standing request may not repeat the feature that was just added. Read the current task history, diff, relevant source, and regression test to recover the exact interaction. If this skill or [the recipe reference](references/recipe.md) does not cover a new shape, binding, state, or gesture introduced by that feature, update the narrow relevant guidance/example in this skill before generating the fixture. Do not guess from the standing request, and do not turn one feature into a universal rule.

## Build the fixture

1. Choose a stable slug and create `sketches/review/<feature-slug>.systemsketch`. Never seed Zach's real `~/SystemSketch` workspace.
2. Create a small recipe using [references/recipe.md](references/recipe.md). Start from [assets/example-review-recipe.json](assets/example-review-recipe.json) when useful.
3. Seed the minimum real SystemSketch objects needed to reach the interaction. Prefer an already-interesting state over making Zach perform setup steps.
4. Add numbered cue cards that state the literal gesture, such as “drag the output port onto…” or “collapse this Block.” Point each step at its target with an orange arrow. Add one separate green `PASS WHEN` card describing the visible result.
5. Lay out the interaction first, then reserve a quiet perimeter for instructions. Keep at least 80 canvas units between cards and interaction bounds and at least 48 units between cards. Use cards at least 340×100; enlarge or shorten any card whose text would wrap beyond its height. Do not build a flush stack of cards along one object edge.
6. Put each targeted card outside the specific edge it names: a `right` target gets a card to the right, a `top` target gets a card above, and so on. Use `dx` only along top/bottom edges and `dy` only along left/right edges. When several cues target one edge, separate their target offsets by at least 48 units so their final segments do not merge. The helper creates a stock elbow arrow bound at both ends so it stays attached and its final segment meets the target edge perpendicularly. Never leave a cue arrow as two loose coordinates.
7. Never cover a handle, port, menu trigger, label, or intended drop target. Cue arrows are decorative even though they use stock arrow bindings; product connections must use the feature's real shape and binding types.
8. Generate through the real editor and autosave path:

   ```bash
   node skills/systemsketch-review-fixture/scripts/create_fixture.mjs \
     --recipe skills/systemsketch-review-fixture/assets/example-review-recipe.json \
     --output sketches/review/<feature-slug>.systemsketch
   ```

   The helper cold-reopens the board, checks the `.systemsketch` envelope and shape inventory, and writes a PNG beside it. It refuses to overwrite by default; use `--force` only when intentionally replacing the same review fixture.
9. Inspect the generated PNG yourself. Check text clipping, card overlap, cropped content, arrow/card crossings, arrow/label crossings, and whether every target segment is normal to the target edge. Then drive the saved fixture once in the real running app: move one arrow's target and confirm the cue remains attached, then verify the intended feature interaction.
10. Check ports before launching. Reuse the current Preview only if it belongs to this checkout; otherwise allocate an unused Preview/API port pair. Report a clickable URL with the absolute fixture path:

   ```text
   http://127.0.0.1:<preview-port>/?board=%2Fabsolute%2Fpath%2Fto%2Ffixture.systemsketch
   ```

Keep the server running for Zach. Report the fixture, PNG, exact URL, gesture, and pass condition together.

## Calibrate layout changes with a visual loop

When changing this skill's layout guidance or helper geometry, do not judge one hand-composed example. Run the reproducible disposable sweep:

```bash
node skills/systemsketch-review-fixture/scripts/create_layout_sweep.mjs \
  --count 6 --seed 20260902 \
  --output-dir /tmp/systemsketch-review-fixture-sweep-20260902
```

Inspect all six PNGs together and critique each against the same visible gates: no clipped text or canvas content; no card overlap or crowding; no cue crossing a card or product label; every arrow attached at both ends; every last segment perpendicular to the named target edge. Fix the guidance or helper, rerun the same seed for an exact before/after comparison, then run one fresh seed to catch overfitting. Continue until both passes are plainly readable. Sweeps must stay under `/tmp`; they are calibration evidence, not review fixtures or committed artifacts.

## Invariants

- Use the helper instead of hand-editing tldraw schema versions or complete saved records. SystemSketch registers custom Block, connection, and binding schemas and adds a top-level `systemSketch` envelope.
- A fixture supplements ordinary regression tests and real-browser proof; it does not replace them.
- Preserve meaningful product semantics. A real cable has real connection bindings; an orange instructional arrow uses stock arrow bindings only to preserve its cue geometry and remains non-semantic.
- Keep the board disposable, focused, and safe to edit. One primary interaction is ideal; split unrelated interactions into separate fixtures.
- Never point a generator, smoke test, or launched review URL at Zach's real board.

## Provenance

The planning, layout, and visual self-check ideas are adapted from the MIT-licensed [Agents365 tldraw skill](https://github.com/Agents365-ai/tldraw-skill). File creation follows the stronger custom-schema rule from [tldraw's official serializer](https://tldraw.dev/reference/tldraw/serializeTldrawJson) and the version-aware [r0b0tlab tldraw skill](https://github.com/r0b0tlab/tldraw-skill): author through the registered editor/schema and round-trip the result instead of maintaining raw schema JSON by hand.
