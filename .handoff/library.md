# Behaviors library / search / icons / scroll / drag — handoff

Resumed after the 2026-09-05 restart and **landed**. Everything below was measured in
`/home/bam/systemsketch` on `main`, not inferred.

## What is committed

Two commits on `main`, by explicit pathspec (never `git add -A`; new files were staged
individually first, because `git commit -- <path>` only matches paths git already knows). The
peer's 32-file index was 32 before and 32 after both. Not pushed.

- **`e75ea884` — "Add a Behaviors library, and give the app one scrolling surface"** (18 files)
- **`f54c2350` — "Make the Behaviors panel say what its click will actually do"** (3 files),
  fixing a defect the browser journey caught — see below.

The first commit's set was verified in isolation: `git archive HEAD` into a scratch tree,
copy **only** the committed paths over it, then `tsc -b` (0) + `vitest run` (142 files, 1421
tests) + `python3 -m unittest discover -s tests` (118 tests). All green. The commit therefore
stands on its own; it does not depend on anything still uncommitted.

- `src/scroll/{ScrollArea.tsx,scroll-area.css,ScrollArea.test.tsx}` — the one scrolling
  primitive, now **adopted**: `src/app.css` line 1 is `@import './scroll/scroll-area.css';`
  and the old rule block is gone. **Both halves in one change** — the deletion alone would
  have removed every panel scrollbar. Proved in the real bundle, not just the source:
  `npx vite build` then `grep` on `dist/assets/*.css` → `.ss-scroll` present in both CSS
  chunks, and `scrollbar-width: thin` still present twice, so no panel lost its bar.
  NOTE the old block was `src/app.css:105–180`, not `105–178` as the previous note said.
- `src/behaviorTree/btNodeIcons.tsx` (+ test) — `BtNodeIcon`, `btSubjectIsControl`,
  `btSubjectIconName`. Leaves go through the *same* `btLeafIcon` the projection calls, so a
  projected Block and its library row agree by construction; controls/decorators go through
  `btGlyphFor` + `BtGlyphSvg`. 6 tests, `renderToStaticMarkup`, node env.
- `src/behaviorTree/behaviorLibraryModel.ts` (+ test) — the catalog. Skills / Conditions /
  Behavior Trees from `projectBehaviorTree(props).document`; Controls / Decorators derived
  from `BT_BUILTIN_MODELS` (never hand-curated), `SubTree` excluded, Sequence · Fallback ·
  Parallel · IfThenElse ranked first, document-declared controls unioned in. `document` is
  **nullable**: with no region there is still a true Controls/Decorators list. Recents
  (`systemsketch.behavior-library.recents.v1`, cap 8) deliberately do **not** validate ids on
  read — the catalog is document-dependent, so filtering happens in
  `behaviorLibrarySections` at render. 16 tests, driven off the real `SAMPLE_BEHAVIOR_TREE_XML`.
- `src/behaviorTree/behaviorTreeDrag.ts` (+ test) — pure, no React/tldraw/DOM. MIME
  `application/x-systemsketch-behavior`, payload `{itemId,label,template}`, candidates from
  `scene.inserts` through the region origin into screen space, nearest-target with a 96px
  screen snap radius, the parent-edge → target suggestion segment, and `behaviorDropRefusal`.
  12 tests including both sides of the radius boundary.
- `src/behaviorTree/ui/BehaviorTreeLibraryPanel.tsx` + `behavior-tree-library.css` — the
  panel. Region = the selection, else the page's only Behavior Tree. Click inserts by the
  same three cases the inspector and the on-canvas "+" use; rows are `draggable` and set the
  DnD payload.
- `src/library/LibrarySearchModal.tsx` + a rewritten `src/library/PrimitiveSearch.tsx` — the
  search shell extracted. `primitiveSearchModel.ts` unchanged, as predicted.
- `src/chrome/chromeState.ts` — `LeftSurface` gains `'behaviors'`.
- `package.json` — `test:bt-detach`, `test:bt-identity`, `test:bt-library` (all three, one pass).

## What is deliberately NOT committed, and why

**A peer has 32 files staged in the shared index** (a "UI review" unit: `docs/build_ui_review.py`,
`docs/ui-review-2026-09-05.html`, 10 PNGs, ~20 source files). Read it yourself with
`git diff --cached --name-only` before you commit anything. Three files I edited also carry
**peer work in the working tree**, so committing them would have swallowed someone else's
in-flight change under my message:

| file | the peer content in it | what of mine rides along |
|---|---|---|
| `src/chrome/SystemSketchChrome.tsx` | staged, −24/+7 vs HEAD | the Shapes/Behaviors switcher, `data-left-surface`, the `behavior-library` command |
| `src/library/ShapeLibraryBrowser.tsx` | staged; removes HEAD's Escape handler | the `.ss-scroll` adoption on the panel body |
| `src/behaviorTree/ui/BehaviorTreeInspector.tsx` | unstaged; adds `curved`/`slanted` wire options (the wires-popover lane) | `'Sub Tree'` → `'Behavior Tree'` on the tree rows |

Committing the inspector would have been worse than an attribution smudge: it would ship two
wire styles whose `treeLayout.ts` / `sceneSvg.ts` support is still uncommitted.

Consequently `src/library/shape-library.css` **keeps** its own `min-height:0` /
`overflow-y:auto` / `overscroll-behavior` rather than leaning on the `.ss-scroll` class that
lands in a different commit — the stylesheet has to be self-sufficient across that split.

`tests/behavior_tree_library_smoke.mjs` is written and left **uncommitted** with the chrome
wiring it exercises: committing it alone would commit a test that is red against its own
commit. `package.json`'s `test:bt-library` points at it exactly the way `test:bt-detach` and
`test:bt-identity` already point at the detach lane's uncommitted files.

**Next agent's first job:** once the UI-review peer commits, commit those three files plus the
journey, then run `npm run test:bt-library`.

## Still pending

- `BtInsertMenu.tsx:60` still says `detail: 'Sub Tree'` for another tree of the file. It was
  locked all round; the matching fix in `BehaviorTreeInspector.tsx:238` is done (uncommitted).
  Leave `BehaviorTreeInspector.tsx:150` and `btLeafBlockType` alone — there "Sub Tree" correctly
  names the *node type*, not the target tree.
- **The drop half of drag-and-drop.** `behaviorTreeDrag.ts` is complete and tested, and the
  panel is a drag source, but the `dragover`/`drop` handlers belong in `BehaviorTreeCanvas.tsx`
  (locked this round) with the refusal going through its existing `setNotice` →
  `data-testid="bt-notice"`. That is a few lines against a module that already answers every
  geometric question.
- **`LibrarySearchModal` has one consumer, not two.** The natural second consumer is the
  on-canvas "+" flow (`BtInsertMenu.tsx`), which was locked. I did **not** invent a floating
  behaviour search bound to a new global key just to have a second caller: the docked panel
  already has an inline filter, and a second search over the same catalog is redundant chrome.
  Default `testIdPrefix` is `systemsketch-primitive-search`; pass `systemsketch-behavior-search`
  when the canvas flow adopts it.
- `BehaviorTreeLibraryPanel` is imported by path in `SystemSketchChrome.tsx`, not through
  `src/behaviorTree/index.ts`, because the barrel was being edited concurrently. Move it to the
  barrel when the tree is quiet.

## Two defects the browser journey caught

**1. Fixed (`f54c2350`) — the panel refused every insert in its commonest state.** With a
region selected and no node selected, the caption said "Adds the root node." while the click
passed `parentPath: null` to `insertBehaviorTreeChild`, which `insertBehaviorTreeNode`
(`btcppXml.ts`) refuses on any tree that already has a root. The null path was the symptom;
the cause was that the caption and the insertion were two expressions over the same selection
that could drift, and had. `planBehaviorInsert` in `behaviorLibraryModel.ts` now derives one
plan that both read. Note the lone-leaf-root case: a tree whose whole root is one action needs
a SIBLING plan, or it hits the other refusal in the same function. The inspector's
`LibrarySection.add` (`BehaviorTreeInspector.tsx:243`) still has the original bug verbatim —
it should adopt `planBehaviorInsert` when that file is free.

**2. NOT fixed, and the more serious one — undo loses a node.** Inserting beside a MIDDLE
sibling (select path `0.2`, `insertBehaviorTreeSiblingOf`) and pressing undo once leaves the
child count one BELOW where it started, and the `MoveHome` that sat at `0.3` is gone from the
XML entirely. Reproduced twice, once through the panel and once through a bare
`editor.undo()`, so it is not a double-fire. The insert itself is correct; only its undo is
broken, and only when the edit forces a path remap.

Mechanism, read out of the source: `applyEdit` restamps `meta[BT_META_PATH]` inside history,
but `installBehaviorTreeRegions.ts:380` re-runs `reconcileBehaviorTree` from the
operation-complete handler via `editor.run(repair, { history: 'ignore' })` — so a reconcile
fires after the undo and outside history, and reconcile deletes any child whose
`role:path` key collides with one already seen (its `stray` list). **I did not fix it**:
`behaviorTreeCommands.ts` and `installBehaviorTreeRegions.ts` are another session's this round,
and the fix needs that owner's model of child identity. A background task chip carries the
full reproduction. `behavior_tree_smoke.mjs` never caught it because its insert/undo and
delete/undo checks both target the LAST child, which needs no remap — add a middle-sibling
case when fixing.

## A third defect, older and not mine either

**The left popout has no UI entry point at all.** `git grep 'title="Shapes library"' HEAD -- src/`
returns nothing; `git log -S'title="Shapes library"' -- src/` shows commit `66afad2e`
("Refine structural breadcrumb controls") removed it. `grep -rn 'setLeft(' src/` shows the only
opener is the command palette, and `toggleLeft` has zero call sites. So Shapes — and now
Behaviors — are reachable only through the palette.

Two **committed** journeys are red at HEAD because of it, independently of any uncommitted work:
`tests/primitive_search_smoke.mjs:157` (`clickElement('[title="Shapes library"]')` throws) and
`tests/library_overview_smoke.mjs:78`. A background task chip was raised for it. Do not "fix"
it by deleting the assertions — the missing control is the bug.

## Evidence

```
cd /home/bam/systemsketch && npx tsc -b                                    # 0
cd /home/bam/systemsketch && npx vitest run                                # 142 files, 1430 tests
cd /home/bam/systemsketch && python3 -m unittest discover -s tests         # 118 tests, OK
cd /home/bam/systemsketch && node tests/primitive_search_smoke.mjs         # see below
```

`primitive_search_smoke.mjs` passes all four checks that cover the extracted modal — S opens a
focused sub-100px search beside the pointer; `arrow` returns exactly the three canonical
primitives and no commands; ArrowDown + Enter arms the real Curved arrow tool and one Undo
removes the drawn arrow — and then dies at line 157 on the missing `[title="Shapes library"]`
button described above. That failure predates this work.

Seen in the real app (`docs/assets/behavior-tree-library/behaviors-panel-region-selected.png`,
Preview chrome, the sample `PickAndPlace` region selected):

- header `LIBRARY / Behaviors`, the Shapes|Behaviors switcher **below** it and correctly
  proportioned, `Search behaviors`, and `Adds the root node.` under it;
- `SKILLS 6` — CloseGrip, CorrectGrip, FollowPath, MoveHome, PlanPath, New skill… — all five
  read off the document, none hand-written; `CONDITIONS 2`; `BEHAVIOR TREES 1` showing
  `MoveToObj · 3 nodes`; `CONTROLS 16` opening Sequence, Fallback, Parallel, IfThenElse in
  exactly the ranked order, each with BT.CPP's own description as its caption;
- leaves wearing the lucide Block icon, controls the stroked glyph — the same marks the cards
  on the canvas wear;
- a thin themed scrollbar on the panel body, i.e. `.ss-scroll` reaching the DOM;
- the right-hand inspector's Library list now reading `MoveToObj — Behavior Tree`, while the
  canvas card's footer still correctly says `Sub Tree` (there it names the node type).

Before running anything: `ss -ltnp | grep 432`, and do not kill a server you did not start.
