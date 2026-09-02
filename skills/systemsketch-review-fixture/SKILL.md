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
5. Keep cue cards outside the interaction area. Never cover a handle, port, menu trigger, label, or intended drop target. Cue arrows are decorative; product connections must use the feature's real shape and binding types.
6. Generate through the real editor and autosave path:

   ```bash
   node skills/systemsketch-review-fixture/scripts/create_fixture.mjs \
     --recipe skills/systemsketch-review-fixture/assets/example-review-recipe.json \
     --output sketches/review/<feature-slug>.systemsketch
   ```

   The helper cold-reopens the board, checks the `.systemsketch` envelope and shape inventory, and writes a PNG beside it. It refuses to overwrite by default; use `--force` only when intentionally replacing the same review fixture.
7. Inspect the generated PNG yourself. Then drive the saved fixture once in the real running app to verify that the intended interaction—not just the static composition—works.
8. Check ports before launching. Reuse the current Preview only if it belongs to this checkout; otherwise allocate an unused Preview/API port pair. Report a clickable URL with the absolute fixture path:

   ```text
   http://127.0.0.1:<preview-port>/?board=%2Fabsolute%2Fpath%2Fto%2Ffixture.systemsketch
   ```

Keep the server running for Zach. Report the fixture, PNG, exact URL, gesture, and pass condition together.

## Invariants

- Use the helper instead of hand-editing tldraw schema versions or complete saved records. SystemSketch registers custom Block, connection, and binding schemas and adds a top-level `systemSketch` envelope.
- A fixture supplements ordinary regression tests and real-browser proof; it does not replace them.
- Preserve meaningful product semantics. A real cable has real connection bindings; an orange instructional arrow is only a cue.
- Keep the board disposable, focused, and safe to edit. One primary interaction is ideal; split unrelated interactions into separate fixtures.
- Never point a generator, smoke test, or launched review URL at Zach's real board.

## Provenance

The planning, layout, and visual self-check ideas are adapted from the MIT-licensed [Agents365 tldraw skill](https://github.com/Agents365-ai/tldraw-skill). File creation follows the stronger custom-schema rule from [tldraw's official serializer](https://tldraw.dev/reference/tldraw/serializeTldrawJson) and the version-aware [r0b0tlab tldraw skill](https://github.com/r0b0tlab/tldraw-skill): author through the registered editor/schema and round-trip the result instead of maintaining raw schema JSON by hand.
