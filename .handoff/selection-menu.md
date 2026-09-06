# Selection menu placement — DONE

Committed on `main`: `d4d8dfad Pin the selection menu to the top margin when
scrolled off above` (3 files, 204 insertions / 14 deletions, staged and
committed by explicit pathspec so no peer's in-flight staged work rode
along).

## What changed

- `src/chrome/selectionMenuPlacement.ts` — horizontal centring now uses the
  midpoint of the intersection of `selection` and `[0, viewport.w]` when
  `selection.w > viewport.w` (unchanged otherwise). Vertical placement is now
  a three-way branch: room above → `'above'` (unchanged); selection's top
  edge above the viewport (`overlayTop < 0`) → new `'pinned'` side at
  `y = SELECTION_MENU_MARGIN`; otherwise → `'below'` (unchanged). Final floor
  clamp is untouched and still covers all three branches. `SelectionMenuSide`
  widened to `'above' | 'below' | 'pinned'`.
- `src/chrome/SelectionContextualMenu.tsx` — **no changes needed**. Its
  `element.dataset.side = placement.side satisfies SelectionMenuSide` was
  already generic over the union type.
- `systemsketch-chrome.css` / `interface-settings.css` — checked, no
  `[data-side=...]` rule scoped to `.systemsketch-selection-menu` exists, so
  nothing to add there either.
- `src/chrome/selectionMenuPlacement.test.ts` — the one pre-existing test
  whose fixture (`{x:700, y:-400, w:240, h:1600}`, top edge above viewport)
  used to hit the old clamped-to-floor behaviour now asserts the new
  `'pinned'` branch (`side: 'pinned'`, `y: SELECTION_MENU_MARGIN`). This is
  the fix's whole point, not a regression. All 13 tests pass
  (`npx vitest run src/chrome/selectionMenuPlacement.test.ts`).
- `tests/selection_menu_smoke.mjs` — check 5 ("the bottom toolbar is an
  obstacle") updated the same way, for the same reason, live in a browser.
  Added three new camera scenarios (9a/9b/9c) using a stock Frame shape:
  viewport entirely inside an oversized frame → pinned; frame's top edge
  visible near mid-screen → back to `'above'`; pan 600px sideways → the
  horizontal-intersection centre follows by half the pan (one tracked edge,
  the other clamped). A lone Frame shows no selection menu at all (nothing
  about it satisfies `hasVisibleActions` in `SystemSketchChrome.tsx` — no
  colour style, no Block, and `canWrapSelection()` needs ≥2 wrappable shapes),
  so a tiny geo rectangle parked just outside the frame's bounds (same
  y-span, so it doesn't touch the frame's own top/bottom) rides along purely
  to make the menu mount.

## Second reference (task's step 1)

Read `node_modules/tldraw/src/lib/ui/components/Toolbar/DefaultRichTextToolbar.tsx`:
it wraps `TldrawUiContextualToolbar` — the *same* primitive already read for
reference 1 — via `getSelectionBounds` from the live DOM text selection. No
independent intersection or top-pin logic; it delegates entirely.

Also checked Excalidraw (`excalidraw/excalidraw` on GitHub, via `gh api` +
`curl` raw source, since it's not vendored here): its `hyperlink/helpers.ts`
only positions a small link-edit icon handle, and its `Stats/Stats.scss`
panel is `position: absolute; top: 60px` — a CSS-docked sidebar, not a
selection-following floating toolbar. Excalidraw has no equivalent of this
pattern at all.

So both references converge on the same finding as reference 1: nothing in
either library does "centre on the visible portion, pin near the top" for an
oversized selection. This is a genuine SystemSketch/FigJam behaviour, not a
port of existing library logic.

## Verification

- `npx tsc -b` — clean.
- `npx vitest run src/chrome` — 9 files, 56 tests, all pass.
- `npm run check` (tsc + vitest full suite + Python + depth-breadcrumbs
  browser smoke) — **fully green**: 142/142 test files, 1430/1430 vitest
  tests, 118 Python tests, browser smoke pass.
- `npm run test:selection-menu` — **cannot complete a full run** in this
  environment. Root cause, confirmed independent of this change: check 2
  ("zooming resizes the shape but never the menu") uses `zoomBy()`'s
  ctrl+wheel CDP gesture (`modifiers: 2`), and this Chrome/CDP setup is not
  honouring it as a zoom at all — instrumented directly and confirmed
  `editor.getZoomLevel()` stays `1` for all 26 synthetic "zoom" events while
  `camera.y` just pans by a fixed 120px/step. Reproduced the identical
  numeric failure with `git stash` on the unmodified baseline code, so this
  predates and is unrelated to this change. It also blocks check 5's own
  `zoomBy(page, 26)` setup from ever engulfing the viewport as intended,
  independent of my assertion change there.
  - **Worked around for verification, not committed**: wrote a standalone
    scratch harness (deleted; lived under the session scratchpad, not in the
    repo) that reused the exact same setup/assertions for check 5 and the
    new 9a/9b/9c but skipped the broken `zoomBy` call. Result: 9a, 9b, and
    9c — the three new checks this task added, which drive the camera
    directly via `editor.setCamera()` and never touch `zoomBy` — **all
    pass** against the real running app. Check 5 itself still can't be
    exercised end-to-end because its setup (not its assertion) depends on
    the broken gesture; its exact geometry is covered instead by the vitest
    fixture (`{x:700, y:-400, w:240, h:1600}`), which is green.
  - This is a pre-existing, environment-level test-infra bug in `zoomBy`'s
    ctrl+wheel simulation (also used as-is, untouched, by
    `tests/desktop_windows_smoke.mjs` and `tests/local_comments_smoke.mjs`),
    not something this task's scope covers. Worth a separate look — flagged
    via `spawn_task`.

## Not done / out of scope

- Did not touch `zoomBy()` or check 2 — both pre-exist this task and are
  unrelated to the placement rule.
- Did not touch anything under `src/behaviorTree/`, `src/blocks/detach/`,
  `src/scroll/`, `src/library/`, or `docs/peps/` — those are three peer
  agents' concurrent work in this same checkout.
