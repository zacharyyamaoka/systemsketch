# Behavior Tree — detach crash + duplicate/paste scramble

**Status: COMPLETE and COMMITTED.** Rewritten 2026-09-05 after the machine restart.
Commit `d1cdf5cb` on `main` in the primary checkout, **not pushed** (`main` is ahead 46).
`npm run check` green before and after the commit.

There is nothing left to resume. The two open items below are notes for whoever
touches the neighbouring files, not work owed.

## What shipped

Two bugs, one seam: **who owns a projected child.**

### Bug 1 — "Detach to primitives" on a region crashed the app

`ValidationError: At shape(type = group).meta: Expected json serializable value, got object`,
and the React app unmounted.

Chain, verified against the primary sources:

1. `src/blocks/definitions/definitionLinking.ts:539` passes `draftOrdinal: canonical.props.draftOrdinal`
   — an **absent** optional prop, so the value is `undefined` — into `updateDefinitionGroup`
   (`:384`), which spreads it into `props` at `:393`.
2. tldraw's `applyPartialToRecordWithProps`
   (`node_modules/@tldraw/editor/dist-esm/lib/editor/Editor.mjs:8735-8758`) skips a **top-level**
   `undefined` in a partial (`:8741`) but copies every `props`/`meta` sub-key verbatim
   (`:8745-8750`). The stored record now literally holds `draftOrdinal: undefined`.
3. That is legal for `props` (`draftOrdinal: T.number.optional()`, `src/blocks/blockModel.ts:349`)
   and illegal for `meta`: `createShapeValidator` validates `meta` with `T.jsonValue`
   (`@tldraw/tlschema/dist-esm/shapes/TLBaseShape.mjs:24`), and `isValidJson`
   (`@tldraw/validate/dist-esm/lib/validation.mjs:857-878`) rejects `undefined` anywhere.
4. `src/blocks/detach/detachBlock.ts:226` copies the whole `block.props` into the detached
   **group's** `meta`. Crash.
5. The message says "got object" and points at `.meta` because `jsonValue` is a leaf validator
   with no path tracking — it names the top-level type, never the offending key.
6. Why the Behavior Tree region: the sample tree repeats leaf names (`CloseGrip` x3,
   `MoveHome` x3), so the duplicate-title reconciler at `definitionLinking.ts:535-540` fired for
   the content-identical copies and exactly 4 of 9 projected Blocks (paths `0.4.0`, `0.4.1.0`,
   `0.4.1.1`, `0.4.2`) carried `draftOrdinal: undefined`.

**Fix**: `toJsonSafe` in `src/blocks/detach/detachModel.ts` — deep copy dropping present-but-
undefined keys (array holes become `null`). `detachMeta` runs every record through it;
`detachBranch.ts` and `detachLoop.ts` too (same latent crash via `structuredClone(props)`).
Deliberately did NOT change `definitionLinking`: writing `undefined` is the only way tldraw's
merge can express "cleared", and dropping the key would keep the old value. A `WHY:` comment
there says so.

**Second half**: detaching a *projected child* was never legitimate — deleting a projected
Block compiles an XML delete, so "detach this node" silently REMOVED it (XML 2123 -> 2062
bytes). `selectedDetachableIds` now excludes any shape carrying BT child meta, so no menu item
appears — the refusal idiom the menu already used for control cards.

**Region detach works**: `src/behaviorTree/detachBehaviorTree.ts` (editor) +
`src/behaviorTree/btPrimitives.ts` (pure). The region becomes a stock `frame` named for the
tree carrying the canonical BT.CPP XML in JSON-only `meta`; leaves and Blackboard pills go
through the ordinary Block detach; Dataflow cables through the ordinary connection detach; the
painted layer becomes stock line/geo/text. Wired into `detachSelectedPrimitives` and
`src/export/portableTldraw.ts` (which previously did not register the BT utils at all, so a
board with a region could not be loaded into the export store), with
`tests/test_stock_boundary.py` extended to require it.

### Bug 2 — duplicate/paste scrambled the ORIGINAL region

Primary evidence, Zach's recording: row `store-000325` at t=10637.5 ms (the Ctrl+V) — the
**original** region's `props.offsets` goes `{}` -> 12 entries, largest 14,495 px, 13.5x the
region's own width. Tidy clears `offsets`, which is why Tidy "fixed" it. The row is preserved
at `docs/assets/behavior-tree-identity/recording-store-000325.json` in case the
`~/.systemsketch-reviews/...` recording is cleaned up.

**Root cause**: `installBehaviorTreeRegions.ts` resolved a projected child's region from
`meta.btRegion`, a **stored id**. tldraw re-mints shape ids on duplicate/paste but copies
`meta` verbatim, so a copy still names the region it came from, and every rule that read that
name acted on the original.

**Fix**: containment decides. `behaviorTreeRegionFor` / `behaviorTreeRegionAncestor` walk up to
the nearest region ancestor; a cable (parented at page level) resolves through its bindings'
Blocks. The stored id survives only as the fallback for a child dragged clean out of every
region, and `reconcileBehaviorTree` re-stamps a copied child's `btRegion` so a later delete
edits the right tree's XML. Second, independent guard: an `arrived` set of shapes created in
the current operation, so a fresh arrival is never read as a drag.

## Verified

- `npm run check` — green: tsc + 138 vitest files / 1392 tests + 118 Python tests + the
  breadcrumbs journey. Run again after the commit; still green.
- `node tests/behavior_tree_detach_smoke.mjs` — 26/26.
- `node tests/behavior_tree_identity_smoke.mjs` — 33/33.
- `npm run test:bt` — 43/43, including `drag.offset`, proving the `arrived` guard did not
  disable genuine drags.
- Mutation-tested, each mutation reverted and md5-verified: containment off -> 1/33 red;
  `arrived` guard off -> 2 red; **both off (= shipped pre-fix behaviour) -> 12/33 red**,
  including `duplicate.offsets`, `paste.offsets`, `move.offsets` and their `.kids` twins.
- Portable export driven through the real Share menu; the downloaded `.tldr` holds shape types
  `group 5, geo 25, arrow 4, line 8, text 13, frame 1`, one frame named `PickAndPlace` with 769
  bytes of BT.CPP XML, **zero** `btRegion` stamps, and renders in an isolated stock tldraw
  5.3.2 editor with no SystemSketch utilities.
- Both review fixtures cold-reopened and driven in the real app.
- **Report opened and read in headless Chrome** (post-restart, the one item the previous note
  left unconfirmed): title correct, 14/14 images decode, **all 14 are data URIs, zero network
  requests, zero `<script>`/`<link>`/`<iframe>`**, no sideways overflow, all six sections
  render. The only `undefined` strings in the body are the bug's own subject matter in prose
  and code, not template holes. Nothing needed fixing.

## PEP

`docs/peps/0004-projected-child-ownership-by-containment.md` — *a projected child's owning
region is derived from containment, not from a stored id.*

Written because the fork is real and the shipped code keeps **both** mechanisms: containment is
the truth, the stored stamp answers the two cases containment cannot (a page-parented cable,
and a child dragged clean out of every region), and `reconcileBehaviorTree` repairs the stamp
to agree. The non-obvious part is the *precedence*, and a future reader who sees the redundancy
will be tempted to delete one half. The crash fix is explicitly scoped OUT of the record — that
was a mistake with one right answer and it lives in `WHY:` comments.

Linked from the `WHY:` block above `behaviorTreeRegionFor` in
`src/behaviorTree/installBehaviorTreeRegions.ts`; `tests/test_pep_links.py` (part of
`npm run check`) fails if that pointer rots.

`docs/build_behavior_tree_detach.py` now **measures** the PEP at build time (`measure_pep`
reads the `WHY:` pointer out of the source and resolves the file) instead of promising one in
hardcoded prose, so the decision surface cannot drift from the tree again.

## Commit

`d1cdf5cb` on `main`, **not pushed**. 38 files, staged by explicit pathspec and committed with
`git commit -F … -- <paths>` so that the peer work sitting in the shared index was not swept in.

## Two notes for whoever touches the neighbouring files

- **`README.md` is NOT in the commit.** A peer had it staged with their own in-flight change (a
  deletion of their `app UI review` paragraph). My paragraph — the one linking
  `docs/behavior-tree-detach-2026-09-05.html`, sitting right after the Behavior Tree rebuild
  paragraph — is still in the working tree, unstaged, and will land with whoever commits README
  next. If it ever gets lost, it is recoverable from the report itself. Do not `git checkout`
  README to clean up.
- **No `package.json` scripts** for the two new journeys — the library agent held that file this
  round. When it is free, add
  `"test:bt-detach": "node tests/behavior_tree_detach_smoke.mjs"` and
  `"test:bt-identity": "node tests/behavior_tree_identity_smoke.mjs"`. Until then run them by
  path. The report says so too.

## Servers

None of mine are running. The pre-restart vite on **4730** / Python host on **4731** died with
the restart and were not brought back. To review the fixtures:

```bash
cd ~/systemsketch && nohup python3 scripts/server.py --port 4731 --dist dist --channel preview --build bt-detach-review --source-root /home/bam/systemsketch --files-root /home/bam/systemsketch/sketches --allow-source-root > /tmp/ss-api-4731.log 2>&1 &
```

```bash
cd ~/systemsketch && SYSTEMSKETCH_API_PORT=4731 nohup npx vite --host 127.0.0.1 --port 4730 --strictPort > /tmp/ss-vite-4730.log 2>&1 &
```

```text
http://127.0.0.1:4730/?board=/home/bam/systemsketch/sketches/review/behavior-tree-detach.systemsketch
```

```text
http://127.0.0.1:4730/?board=/home/bam/systemsketch/sketches/review/behavior-tree-region-identity.systemsketch
```
