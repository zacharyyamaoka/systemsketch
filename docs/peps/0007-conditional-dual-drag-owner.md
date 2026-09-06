# 0007: tldraw stays the drag owner, except a scoped handoff to dnd-kit on auto-laid-out diagram nodes

- **Status:** Accepted
- **Date:** 2026-09-06
- **Merge:** landed on `main` with the 2026-09-06 Behavior Tree merge (drag-architecture commit `aefd9343`)

## Context

The stock-boundary rule said one thing about gestures: tldraw owns them all. 0006 kept that
stance through the dnd-kit migration — dnd-kit contributed pure math, tldraw stayed the only
sensor. But with Auto-layout on, a Behavior Tree region is not behaving as a whiteboard: a
native translate in tidy arrangement is glide-and-settle — the shape you drag is a projection
whose position the layout engine owns, so the whiteboard gesture and the reorder resolution
fought each other for the same pointer. Zach's live recordings showed it (a ~68px sideways
swap he liked against 150–370px downward gestures he had to fight), and the observer-based
reorder path inside the region installer was the measured two-writer failure the migration
had just cleaned up.

The fork: keep tldraw the sole drag owner everywhere and keep compensating inside the
observer, or admit a second drag system with a precisely drawn boundary.

## Decision

Zach's call, verbatim (2026-09-06, quoted in `treeDndDrag.tsx`'s header): a second drag
system exists "only when we've turned on auto formatting. At that point it no longer acts as
a whiteboard, but as this reactive diagram. I still want to be able to draw whiteboard
primitives over top of it, and tldraw can't own that, but I do think it is more accurate to
actually create two drag systems — if you're clicking on something that is part of the
diagram, the dnd-kit drag system overtakes; if you're doing something that is not part of the
diagram, you use the whiteboard one." **Auto-layout changes a region's identity from
whiteboard to reactive diagram, so the diagram's own gesture engine takes the drag.**

`treeDndDrag.tsx` mounts one real `DndContext` (PointerSensor and all) that may claim a
gesture only when ALL hold: the pressed shape is a projected diagram node (`btRole ===
'node'`) of a region with `arrangement === 'tidy'` in a diagram projection (`'tree'`, and
`'process'` after Zach's follow-up); the press is a plain primary press that **tldraw's own
hit test** resolves to that node (replicated verbatim from
`getHitShapeOnCanvasPointerDown`, so a whiteboard arrow drawn over the diagram wins the
point exactly as it would natively); and the gesture would have translated exactly that one
node. Everything else — auto-layout off, whiteboard primitives over the region, modified
clicks, multi-select, the region itself — is byte-identical native tldraw with zero dnd-kit
listeners in its event path.

The two systems never share a gesture: the pointer-down flows to tldraw untouched (SHADOW),
the claim preempts through supported seams (`editor.cancel()`,
`editor.markEventAsHandled`), and single-writer discipline holds for the duration — the
region installer no longer resolves drags at all, it only skips the gesture owner's shapes
and settles on release. Resolution inside the claimed lane is 0006's pure engine, shared
with the Dev-panel drag-model overlay and the Drag Model Tuner so the debug surfaces render
the drag's own frozen geometry, never a second derivation.

## Alternatives considered

- **tldraw stays the sole drag owner, observer keeps compensating** — lost on measured
  behaviour: glide-and-settle native translate is the wrong physics for a reorder, the
  observer reorder path was the documented two-writer corruption site, and drag feel
  (hysteresis, capture padding, claim distance) had no principled home inside a whiteboard
  translate.
- **Hand the whole region to dnd-kit when auto-layout is on** — lost on Zach's own
  requirement: whiteboard primitives drawn over the diagram must stay fully native, so the
  boundary has to be per-press (tldraw's hit test arbitrates), not per-region-state.
- **Fork tldraw's translate tool for diagram nodes** — never seriously on the table; it
  forks the engine, which is the one rule the whole design rests on.

## Consequences

- The stock-boundary rule now has exactly one written exception, and
  `tests/test_stock_boundary.py` asserts its gate literals (projection/arrangement/role,
  the hit-test replication, the supported preempt seams) and quarantines `@dnd-kit` to the
  one mounted context plus 0006's two pure modules — loosening any of those literals fails
  the build.
- Drag feel becomes tunable data (`treeDragTuningState.ts`, the Drag Model Tuner panel)
  instead of emergent whiteboard physics; defaults reproduce shipped behaviour bit-for-bit.
- The cost accepted: two gesture codepaths to reason about at the boundary. The mitigation
  is that the boundary is a predicate over one press, enforced by test, not a mode.
- "Simplifying" back to a single drag owner is re-litigating this record — the WHY header
  in `treeDndDrag.tsx` says so at the seam.

## References

- Code: `src/behaviorTree/treeDndDrag.tsx:1` — the `WHY` header (Zach's quote, the gate,
  the SHADOW/preempt/interlock mechanism) that points back here
- Code: `src/behaviorTree/installBehaviorTreeRegions.ts` — single-writer discipline
  (skip the gesture owner's shapes, settle on release)
- Evidence: `docs/tree-dual-drag-report-2026-09-06.html` (hero screencast, both sides of
  the ownership boundary); `docs/assets/behavior-tree-dual-drag/sensitivity.json` (the
  measured 1.8–2.7× top-down vs left-right asymmetry behind the tuner)
- Related: `docs/peps/0006-tree-drag-dndkit-pure-collision.md` (the resolution engine this
  exception mounts a sensor in front of)
