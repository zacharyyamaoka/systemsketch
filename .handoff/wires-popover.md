# Handoff: Behavior Tree wire styles + Add-process popover — DONE

Resumed after the 2026-09-05 machine restart. All work described in the
prior handoff is finished, tested, and committed on `main` at `da392448`.

## What was wrong, and the actual fix

### `insert.outside-closes` (the check the prior agent was mid-debugging)

**Root cause (verified live, not guessed):** `TldrawUiPopover` computes its
real `open` as `open ?? false || isOpen`, where `isOpen` mirrors
`editor.menus` (tldraw's own open-menu registry) and `open` is whatever we
pass in. Because that's an OR, our own `open` prop can only ever *widen*
the popover to open — it can never force it closed; only `editor.menus`
itself dropping the id can do that.

Two things bypass our `onOpenChange` and mutate `editor.menus` directly,
so whichever side wasn't poked goes stale:

- **`MenuClickCapture`** — tldraw's own invisible, full-viewport overlay
  that mounts whenever *any* menu is open, specifically to swallow canvas
  interaction — closes menus on every canvas pointer-down by calling
  `editor.menus.clearOpenMenus()` directly. An outside click cleared
  `editor.menus` while our own `openInsert` state (and therefore the
  forced-open half of `open={active}`) stayed stuck true, so the popover
  never visibly closed. Caught live: right after the click,
  `editor.menus.getOpenMenus()` read `[]` while
  `document.querySelector('[data-testid="bt-insert-menu"]')` still found
  the DOM node.
- **`choose()`** (our own code) closed the *other* way: it only cleared
  `openInsert`, so `editor.menus` still listed the id and the OR kept
  `open` true regardless (`insert.closes-on-choose`, a second failure this
  surfaced once `outside-closes` was fixed and the journey could run
  further than before).

**Fix** (`src/behaviorTree/BehaviorTreeCanvas.tsx`): added `closeInsert()`,
which clears `openInsert` *and* calls
`editor.menus.deleteOpenMenu(insertMenuId(insert))` directly, used
everywhere we want to force a close (`choose()`, deselect, xml/projection/
orientation change, switching to a different insert). Added a
`useValue`-backed sync effect that mirrors `editor.menus` back into
`openInsert` for the other direction (the `MenuClickCapture` bypass). Full
WHY comments are at the `InsertButton` doc comment and above `closeInsert`.

### `insert.one-open-at-a-time` (a second failure this pass also uncovered)

**This one is not a wiring bug** — it's a real, structural limitation of
putting a popover trigger on the canvas. Verified live via
`document.elementFromPoint` at the other insert's own screen centre: it
returned `.tlui-menu-click-capture`, not the button. Every `.BehaviorTree-
insert` button lives inside `.tl-canvas` (`contain: strict`, an isolated
stacking context, `z-index: auto`), while `MenuClickCapture` is a sibling
of `.tl-canvas` with an explicit `z-index: 250` — no z-index inside
`.tl-canvas`'s subtree can ever escape above it. Every *stock* tldraw
popover trigger lives in the chrome layer (`.tlui-layout`, z-index 300)
instead, safely above this overlay, which is why this only shows up for a
canvas-native trigger like this one.

Net effect: clicking a *different* "+" while one is already open lands on
`MenuClickCapture` first (same as an outside-canvas click — closes the
open one, inserts nothing), and only a **second** click, once nothing
covers the canvas, reaches the real trigger. `insert.closes-on-choose`
proves the exclusivity/close logic itself is correct once a click actually
reaches a trigger — this is purely about the click getting there.

Fixed the *test* to match reality (`tests/behavior_tree_smoke.mjs`): two
clicks on the other insert, with a comment explaining why. This is a
one-line acknowledgment, not a silent redesign — flagged in the report
below for a real decision: leave it as a documented two-click reality, or
invest in portaling the "+" buttons into the chrome/overlay layer (camera-
tracked, like tldraw's own shape handles) so a single click can switch
directly. Not attempted here — that's a real feature change, not a bug fix.

## Files changed (all committed in `da392448`)

- `src/behaviorTree/BehaviorTreeCanvas.tsx` — `closeInsert()`, the
  `editor.menus` sync effect, `insertMenuId()` helper, updated doc
  comments on `InsertButton`.
- `src/behaviorTree/behaviorTreeModel.ts`, `treeLayout.ts`, `sceneSvg.ts`,
  `ui/BehaviorTreeInspector.tsx`, `layouts.test.ts`, `behavior-tree.css`,
  `ui/BtInsertMenu.tsx` — unchanged from the pre-restart handoff (wire
  styles + popover z-order fix), carried forward and committed as-is.
- `tests/behavior_tree_smoke.mjs` — added the four wire-style browser
  checks (`tree.wires.<style>`, screenshots `tree-wires-<style>.png`);
  fixed the two-click reality for `insert.one-open-at-a-time`; added a
  `centerOnButton()` helper (the "other" insert's button was landing
  off-screen after the camera centred tight on `bt-insert-end` for the
  z-order checks — a second, unrelated test bug this pass also fixed).
- `docs/build_behavior_tree_rebuild.py` — added the four wire-style
  captures to `CAPTURES`.
- `docs/behavior-tree-rebuild-2026-09-05.html` — rebuilt.
- `docs/assets/behavior-tree/*` — regenerated screenshots + the four new
  `tree-wires-*.png` captures.

## Proof

- `npx tsc -b` — clean.
- `npm run test:bt` — **65/65 passed**, run twice to confirm not flaky.
- `npm run check` (tsc + 1430 vitest tests across 142 files + 118 Python
  tests + the depth-breadcrumbs browser journey) — **all green**, exit 0.

## Not touched (peer lanes, confirmed by mtime before editing)

`src/blocks/detach/*`, `installBehaviorTreeRegions.ts`,
`detachBehaviorTree.ts`, `btPrimitives*`, `src/export/portableTldraw.ts`,
`tests/test_stock_boundary.py`, `tests/behavior_tree_detach_smoke.mjs`,
`tests/behavior_tree_identity_smoke.mjs` (detach/duplicate peer);
`src/scroll/`, `btNodeIcons.tsx`, `behaviorLibraryModel.ts`,
`behaviorTreeDrag.ts`, `BehaviorTreeLibraryPanel.*`, `src/library/`,
`src/chrome/`, `src/app.css`, `tests/behavior_tree_library_smoke.mjs`,
`package.json`, `docs/peps/` (library/chrome peer — confirmed actively
running concurrently in this same checkout while I worked, per fresh
mtimes on `docs/assets/behavior-tree-library/*` and
`behaviorLibraryModel.ts`). A third peer (selection-menu / UI review) also
has its own uncommitted work in this checkout (`README.md`,
`src/chrome/*`, `docs/build_ui_review.py`, etc.) — left entirely alone;
staged nothing of theirs (a shared-index race briefly pulled their staged
files into my index via a prior `git add`, caught via
`git diff --cached --name-only` before committing, and unstaged with
`git reset -- <their paths>` — a safe, index-only, working-tree-preserving
operation — before this commit).
