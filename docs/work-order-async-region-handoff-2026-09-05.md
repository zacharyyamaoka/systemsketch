# Work order: take over contextual Async regions

**Status:** implemented, verified, committed, reconciled through `main` commit
`1d0313b`, and intentionally not integrated. `main` advanced again while this
handoff was being written, so the next agent must inspect and reconcile its new
commits before further implementation or integration. Do not rebuild the
feature from scratch.

## Objective

Take ownership of the Async-region implementation, preserve its existing
behavior contract, and continue whatever review, polish, or integration Zach
requests next. The present implementation turns a stock tldraw Frame into a
semantic region:

- selecting the region opens the communication lens for only that region;
- clicking outside the region dismisses the lens;
- completing a new data wire between two components that share the region
  defaults that wire to **Async**;
- a wire crossing the region boundary is unchanged;
- an explicit Async, Delayed, or later Data choice wins permanently.

The crucial distinction is **authoring default, not enforcement**. The region
helps create a wire; it does not continuously reinterpret existing wires as
components move, boards load, or users edit temporal behavior.

## Exact working state

| Item | Value |
|---|---|
| Repository | `/home/bam/systemsketch` |
| Feature worktree | `/home/bam/.codex/worktrees/7110/systemsketch-track-communication-projection-prototype` |
| Branch | `track/communication-projection-prototype` |
| Implemented and browser-proven commit | `7a959d11d2ed7adce989a2a26e99944b9de6cc80` |
| Reconciled `main` baseline | `1d0313b4cf77c8f06fc2c47585d08fdd550aa619` |
| `main` observed when this handoff was committed | `da3924480479ed6cf9d053881175f4f3bcb2fe18` |
| Integration state | Not merged into `main`; no integration was authorized |
| Retained review | `async-region-contextual-20260905`, ports `4696/4697` |

Before writing, run `git status --short`, `git worktree list`, and
`git rev-parse main`. The named worktree was clean when this handoff was
written. Claim it only if no other lane is using it. If another writer owns it,
create a fresh worktree at the branch HEAD instead of sharing one filesystem
lane.

## Review surfaces

- Interactive board:
  `http://127.0.0.1:4696/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fasync-region-contextual-20260905-7a959d11d2ed%2Fsketches%2Freview%2Fasync-region.systemsketch`
- Implementation gallery:
  `http://127.0.0.1:4696/docs/async-region-2026-09-05.html`
- Committed board:
  `sketches/review/async-region.systemsketch`
- Report source and output:
  `docs/build_async_region.py` and `docs/async-region-2026-09-05.html`

If the retained review is down, relaunch it from the feature worktree with:

```bash
python3 scripts/review_runtime.py up async-region-contextual-20260905
```

If the app reports unresolved CodeMirror imports, the review worktree's
`node_modules` points to `/home/bam/systemsketch/node_modules`; run `npm install`
in `/home/bam/systemsketch` and restart only this retained review. Do not stop
unrelated review runtimes.

## Product decisions that must survive refactoring

1. **Use the stock Frame primitive.** `AsyncRegionTool` subclasses tldraw's
   `FrameShapeTool`; tldraw still owns drawing, containment, resize, history,
   selection, and z-order. SystemSketch adds only semantic metadata, naming,
   contextual UI, and the wire-completion default.
2. **Containment is structural.** Membership follows tldraw parentage, not an
   independent geometric overlap calculation. Nested regions resolve to the
   closest region shared by both endpoint components.
3. **Apply the default once.** The completion hook changes only a newly created
   connection whose temporal mode is still `data`. It records provenance but
   does not install a watcher or reconciler.
4. **Keep explicit choices authoritative.** Rerouting, import, load, component
   moves, and an Inspector change from Async back to Data must not cause the
   region to reapply its default.
5. **Keep communication chrome contextual.** The lens opens when an Async
   region is selected or actively being edited. Interaction inside that region
   may temporarily clear canvas selection without closing the controls; a press
   outside its bounds closes them.
6. **Scope projections, not the canonical graph.** Dataflow, semantic tags,
   simple component cards, and focus are projections over the same stored
   Blocks and Connections. They must not duplicate or rewrite the graph.

These decisions match `docs/project-preferences.md`: one canonical definition,
dataflow first, and a strict boundary between semantics and canvas
presentation.

## Main implementation seams

| Responsibility | File / symbol |
|---|---|
| Durable Frame tag and creation default | `src/asyncRegion/asyncRegionModel.ts` — `isAsyncRegionShape`, `sharedAsyncRegionId`, `applyAsyncRegionConnectionDefault` |
| Stock Frame drawing tool | `src/asyncRegion/AsyncRegionTool.ts` |
| System-family toolbar entry | `src/asyncRegion/asyncRegionToolUi.tsx`, `src/toolbar/SystemSketchToolbar.tsx`, `src/toolbar/toolbarIntegration.ts` |
| Apply default after both port bindings exist | `src/blocks/connections/ConnectionShapeUtil.tsx` — `applyNewConnectionRegionDefault` |
| Keep wires painted above the Frame | `src/blocks/connections/connectionScope.ts` |
| Region-scoped projection state and filtering | `src/prototypes/communication/communicationProjection.ts` |
| Contextual controls and click-away lifecycle | `src/prototypes/communication/CommunicationPrototypeControls.tsx` |
| Same-size Simple/Port Block projection | `src/blocks/BlockShapeUtil.tsx`, `src/blocks/blockVisibility.ts` |
| Product and embedded registration | `src/App.tsx`, `src/embed/EmbeddedCanvas.tsx` |

The code contains a `WHY:` comment at the one-shot default seam. Preserve that
rationale if the implementation moves.

## Acceptance contract

The next change is acceptable only if all of these remain true:

- An ordinary board shows no communication controls.
- Drawing an Async region uses stock Frame interaction and adopts enclosed
  components.
- Selecting that Frame opens a lens whose summary, tags, component projection,
  and edge focus include only contained relationships.
- A real port-to-port drag between two contained Blocks produces an Async wire
  above the Frame and records the region provenance.
- The same gesture across the region boundary leaves the wire at its ordinary
  temporal value.
- Changing an auto-defaulted wire to Data in the Inspector sticks after region
  reselection.
- Clicking outside the Frame dismisses the contextual controls.
- Nested membership chooses the nearest common Async region.
- The embedded canvas registers the same semantic tool and opens the document
  without a missing-tool or schema error.

## Verification commands

From the feature worktree:

```bash
npm install
npm run check
npm run test:async-region
npm run test:async-region-fixture
npm run test:async-region-gallery
git diff --check
```

The last completed run passed 1,348 Vitest tests, 118 Python tests, the real
depth-navigation browser journey, seven feature browser checks, three saved
fixture checks, and the gallery browser check. Treat a browser journey as
required evidence; a TypeScript build alone is insufficient.

If UI behavior changes, refresh `sketches/review/async-region.systemsketch`
through the repo's `systemsketch-review-fixture` skill, drive that exact saved
board in the real app, regenerate `docs/async-region-2026-09-05.html`, and
visually inspect the result. Never hand-edit tldraw schema JSON.

## Known boundaries; ask before expanding them

- The existing legacy Communication prototype remains available behind its
  query flag for old review links. Real Async regions do not require that flag.
- This implementation does not infer communication families by parsing
  arbitrary source code. It scopes and presents the existing connection
  metadata and applies only the temporal Async default.
- The region is not a runtime scheduler, deployment boundary, queue, or Dora
  topology object. Those could become projections or exports later, but they
  are not implied by this canvas tag.
- Do not add a background rule that rewrites every contained wire. That would
  make a spatial edit silently mutate runtime semantics.
- Do not merge, promote, cherry-pick, or otherwise integrate the branch unless
  Zach explicitly asks for integration.

## Copy/paste prompt for the next agent

> Take over the SystemSketch Async-region work using
> `docs/work-order-async-region-handoff-2026-09-05.md` as the authoritative
> handoff. Start by inspecting the exact branch/worktree and opening the retained
> board and report. Do not recreate the feature: it is implemented and verified
> at commit `7a959d11d2ed7adce989a2a26e99944b9de6cc80`. Preserve the central contract
> that a region supplies a one-time creation default, not continuous semantic
> enforcement. Check current `main` and concurrent work before editing, run the
> full verification listed in the work order after any change, and do not merge
> or promote anything unless I explicitly authorize integration. Report the
> exact branch, commit, worktree, test results, and retained-review URL when you
> hand back.
