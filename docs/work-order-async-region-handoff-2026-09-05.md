# Work order: take over contextual Async regions

**Status:** implemented, verified, and merged into local `main` by
`f32d1ab1` on 2026-09-06. The merge reconciles the communication work with
the Draft, Type, primitive-search, and canvas-navigation changes already on
`main`; it has not been pushed or promoted. The adversarial review has five
components, 18 protocol legs, nine semantic relationships, selectable
fixed/shortest carrier edges, exact focused-phase labels, and a live
nineteenth-wire defaulting gesture. Do not rebuild the feature from scratch.

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

In the Components projection, Service relationships can ride Request,
Response, or their independently shortest rendered leg. Actions can ride Goal,
Feedback, Result, or shortest. Topic and Stream stay on their single data leg.
These are transient presentation choices: no connection, binding, port, or
component record is rewritten.

The crucial distinction is **authoring default, not enforcement**. The region
helps create a wire; it does not continuously reinterpret existing wires as
components move, boards load, or users edit temporal behavior.

## Exact working state

| Item | Value |
|---|---|
| Repository and integrated checkout | `/home/bam/systemsketch` |
| Historical feature worktree | `/home/bam/.codex/worktrees/7110/systemsketch-track-communication-representative-edge` |
| Historical feature branch | `codex/communication-representative-edge` at `008bd59c8ec072253d2e60eb5b7f5d74c840eb40` |
| Original implementation and focused browser proof | `7a959d11d2ed7adce989a2a26e99944b9de6cc80` |
| Reconciled communication/Async-region predecessor | `9a36d399893a2087f6c678afd819f7bf258e1f8a` |
| Representative-edge implementation and proof | `ff3d4cbde0aa6000d8bbcc130d341185682b36d8` |
| Exact focused-phase labels and proof | `2a6f4bfdc9f4abc3140583429120d9055cbc58dd` |
| Pre-merge `main` | `bad92c887eb03fbf3b649c96e8d0f5ee5700ff05` |
| Merge commit | `f32d1ab1` — `Merge communication relationship carrier and focus UX` |
| Integration state | Merged into local `main`; not pushed and not promoted to Stable/Preview |
| Retained review | Run `python3 scripts/review_runtime.py list` and use `communication-async-regions-main-20260906` |

Before writing, run `git status --short`, `git worktree list`, and
`git rev-parse main`. The authoritative main checkout had an unrelated
Control-lanes Babble in progress when this merge was performed: a README link,
`sketches/review/edge-styling.systemsketch`, and three
`docs/control-lanes-babble*` files. Those changes were deliberately restored
uncommitted, with a safety copy in the stash named
`preserve control-lane work before communication merge 2026-09-06`. Do not
stage, rewrite, drop, or claim them. The historical feature worktree also has
an unrelated `AGENTS.md` edit; preserve it.

## Review surfaces

- The integrated retained review's exact board and report URLs are printed by
  `python3 scripts/review_runtime.py list`; use
  `communication-async-regions-main-20260906`.
- Committed board:
  `sketches/review/async-region.systemsketch`
- Committed stress board:
  `sketches/review/async-region-stress.systemsketch`
- Report source and output:
  `docs/build_async_region.py` and `docs/async-region-2026-09-05.html`

If the retained review is down, relaunch it from the integrated main checkout:

```bash
python3 scripts/review_runtime.py up communication-async-regions-main-20260906 \
  --ref main \
  --board sketches/review/async-region-stress.systemsketch \
  --report docs/async-region-2026-09-05.html
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
7. **Choose carriers from authored routes.** In Elbow mode, fixed phases reuse
   that constituent connection's exact rendered route. Shortest measures the
   real elbow polyline for each relationship independently; it is not
   center-to-center distance. Action cancel is a coordination side-channel and
   cannot win Shortest while goal, feedback, or result exists. A missing
   optional phase falls back to the initiating leg. Straight disables both
   selectors because every candidate becomes the same center line.
8. **Focus names exact legs.** An unfocused A#/S# tag summarizes the collapsed
   family and interaction. Once focused, its carrier tag switches to the exact
   representative phase alongside the already expanded member phases—for
   example `S1 · request` and `S1 · response`, never `S1 · service · health`.
   The stable relationship ID remains so the legs are visibly associated.

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
| Carrier policy and phase fallback | `src/prototypes/communication/communicationProjection.ts` — `chooseCommunicationRepresentative` |
| Contextual controls and click-away lifecycle | `src/prototypes/communication/CommunicationPrototypeControls.tsx` |
| Rendered-route measurement and carrier painting | `src/blocks/connections/ConnectionShapeUtil.tsx` — `resolveCommunicationRepresentative` |
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
- In Components + Elbow, Service and Action selectors switch each collapsed
  relationship onto the requested existing phase route.
- Shortest is resolved per A#/S# from actual rendered polyline length, excludes
  cancel when an Action has a work/outcome leg, and leaves all authored shape
  records byte-identical.
- Topic and Stream remain on data, and Straight makes both selectors disabled.
- Focused relationships label every visible member with its exact phase while
  keeping the stable A#/S# association ID.

## Verification commands

From the integrated main checkout:

```bash
npm install
npm run check
npm run test:async-region
npm run test:async-region-fixture
npm run test:async-region-stress
npm run capture:async-region-carrier-hero
python3 docs/build_async_region.py
npm run test:async-region-gallery
git diff --check
```

The stress journey additionally proves that 18 legs resolve to A1–A3, S1–S3,
T1–T2, and ST1; fixed Service/Action phases, missing-phase fallback, and
per-relationship shortest carriers choose the expected real connection IDs;
A2 contains exactly the four move legs; and a real alerts port drag creates an
Async nineteenth wire. Treat a browser journey as required evidence; a
TypeScript build alone is insufficient.

If UI behavior changes, refresh `sketches/review/async-region.systemsketch`
through the repo's `systemsketch-review-fixture` skill, drive that exact saved
board in the real app, regenerate `docs/async-region-2026-09-05.html`, and
visually inspect the result. Never hand-edit tldraw schema JSON.

## Most likely continuation: semantic association V2

The open product question is how to replace naming inference with authored or
source-derived communication meaning without creating a second graph. A safe
next increment is:

1. Define one analyzer result shaped like `CommunicationDescriptor`, including
   family, interaction name, phase, direction, and provenance.
2. Prefer an explicit authored/source-derived result when it is complete and
   internally consistent; otherwise fall back visibly to the existing strict
   port-name parser.
3. Keep grouping and validation downstream of that seam unchanged: component
   pair + family + interaction name, followed by missing/duplicate/reversed-leg
   diagnostics.
4. Surface unresolved or conflicting provenance instead of silently guessing.
5. Add an adversarial fixture containing two Actions and two Services with the
   same component pair and deliberately misleading port names, proving source
   semantics win without changing the canonical data edges.

This matches Dora's model: Topic, Service, Action, and Streaming remain
well-known interpretations over ordinary inputs and outputs rather than new
YAML edge primitives. Reference:
<https://github.com/dora-rs/dora/blob/main/guide/src/concepts/patterns.md>.

## Known boundaries; ask before expanding them

- The existing legacy Communication prototype remains available behind its
  query flag for old review links. Real Async regions do not require that flag.
- V1 communication inference is deliberately strict and name-based. It reads
  the two endpoint port names; recognizes Action phases `goal`, `cancel`,
  `feedback`, and `result`, and Service phases `req`/`request`/`query` and
  `reply`/`response`; requires an interaction prefix such as `move.goal`; and
  rejects conflicting endpoint claims. It groups legs by unordered component
  pair + family + lowercase interaction name. It does not yet parse a Block's
  source/function body. The `provenance: 'strict-port-name'` descriptor field
  is the explicit V2 replacement seam.
- The region is not a runtime scheduler, deployment boundary, queue, or Dora
  topology object. Those could become projections or exports later, but they
  are not implied by this canvas tag.
- The stress fixture exposed one adjacent integration gap: after the live
  nineteenth wire triggers a board-wide diagnostic recompute, the generic
  Problems analyzer reports `graph.cycle` across Mission orchestrator and Robot
  runtime. Those reverse edges are valid Action/Service feedback, result, and
  response legs, and the communication lens itself reports zero association
  issues. Do not hide this finding; either teach generic cycle diagnostics
  about communication phases or keep it as an explicit follow-up.
- Do not add a background rule that rewrites every contained wire. That would
  make a spatial edit silently mutate runtime semantics.
- Do not merge, promote, cherry-pick, or otherwise integrate the branch unless
  Zach explicitly asks for integration.

## Copy/paste prompt for the next agent

> Take over the SystemSketch Async-region work using
> `docs/work-order-async-region-handoff-2026-09-05.md` as the authoritative
> handoff. The feature is already merged into local `main` by `f32d1ab1`; do
> not recreate or re-merge it. Start by checking the GUI-selected environment,
> `git status`, and `git rev-parse main`, then open the retained board/report
> named `communication-async-regions-main-20260906`. Preserve the unrelated
> uncommitted Control-lanes Babble in `/home/bam/systemsketch`. The Async-region
> base started at `7a959d11`, representative-edge selection is at `ff3d4cbd`,
> and exact focused-phase labels are at `2a6f4bfd`. Preserve both central
> contracts: a region supplies a one-time
> creation default rather than continuous semantic enforcement, and carrier
> selection is a transient projection over authored data edges rather than a
> second graph. V1 protocol association is strict port-name inference; if you
> implement V2 source/function analysis, feed it through the existing descriptor
> provenance seam and retain V1 as an explicit fallback until the authored
> semantic source is trustworthy. Run the full verification listed above after
> any change, and do not push, promote, or integrate subsequent work unless I
> explicitly authorize it. Report the exact branch, commit, checkout/worktree,
> test results, and retained-review URL when you hand back.
