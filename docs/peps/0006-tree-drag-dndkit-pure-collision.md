# 0006: Drag-reorder resolution uses dnd-kit's exported collision functions, never a mounted sortable mirror

- **Status:** Accepted (sensor stance amended by 0007)
- **Date:** 2026-09-06
- **Merge:** landed on `main` with the 2026-09-06 Behavior Tree merge (drag-architecture commit `aefd9343`)

## Context

Tree view's drag-to-reorder was a hand-rolled engine (`treeDragReorder.ts`): depth bands, a
rail model, gap-boundary inference. It worked, but every refinement fought it, and an audit
had already flagged that dnd-kit's collision strategies "have no orientation concept for a
rail-is-a-depth model" — which was read at the time as a reason dnd-kit couldn't fit.

Zach then explicitly decided to migrate to `@dnd-kit` after a dedicated research pass read six
real tree-drag implementations from source (react-arborist among them) and found **none** use
a depth-band+inference model. The standing pattern is per-parent lists — dnd-kit's own
canonical multi-container Kanban example — with react-arborist's `walkUpFrom`/`bound()`
ancestor-climb for cross-parent moves. Modelled per-parent, each container sorts along its own
local axis, which dissolves the audit's objection: no global tree-wide orientation metric is
needed.

That left the real fork: **how much of dnd-kit to take.** The library's front door is a
mounted `DndContext` with `SortableContext` children — a React tree of droppable/draggable
DOM nodes with its own pointer sensors. But the things being dragged here are real tldraw
Block shapes translated by tldraw's own `select.translating` tool, and the stock-boundary
rule (don't build a second drag system beside the engine) plus the measured two-writer
corruption documented in `installBehaviorTreeRegions.ts` ruled out a parallel pointer-sensor
pipeline at migration time. A `SortableContext` DOM mirror of the layout would also be a
second, staler copy of the projection — the forking failure mode this app's projection
architecture exists to prevent.

## Decision

Use dnd-kit as a **math library, not a framework**. `dragListReorder.ts` composes the same
exported, pure collision functions `DndContext` runs internally — `pointerWithin` first,
`closestCenter` fallback, per the multi-container example — over virtual per-container slot
geometry that `sortableGeometry.ts` derives from the **real** layout in a two-phase pipeline
(Zach's refinement): compute the real layout first (d3-hierarchy for Tree view,
`processLayout.ts` for Process view), then derive uniform dnd-kit-facing slots from it with a
small, pure, view-agnostic function. The derived geometry only drives collision resolution;
rendered positions always come from the real layout engine.

Drop targets resolve against a **ghost layout** — the tree with the dragged occurrence (and
its whole subtree) already deleted — never against the live drag preview, so slot boundaries
hold still while the pointer wanders (the one idea kept from the hand-rolled predecessor). A
per-container hysteresis deadband (`resolveSlotWithHysteresis`) stabilises dnd-kit's
stateless per-frame rankings. The commit is `moveBehaviorTreeNode`, the existing structural
XML edit; its refusals (into own subtree, onto a leaf/full decorator) ARE the illegal-drop
signal — nothing in the drag layer re-derives legality.

## Alternatives considered

- **Keep the hand-rolled depth-band engine** — lost because the research pass found no real
  implementation that works this way; six of six use per-parent lists + ancestor climb, and
  every local refinement was reinventing what dnd-kit's collision functions already are.
- **Mount `DndContext`/`SortableContext` with a DOM mirror of the tree** — lost because
  tldraw was the drag owner and sensor (stock boundary; two-writer corruption was measured,
  not hypothetical), and a sortable DOM mirror duplicates the projection into a second,
  staler copy. (A *scoped* mounted `DndContext` was later admitted for sensing only — that is
  0007's decision, which amends this one's sensor stance without touching the resolution
  architecture.)
- **The newer pre-1.0 `@dnd-kit/{abstract,collision,…}` rewrite** — evaluated by an earlier
  audit and rejected; the classic stable v6 `@dnd-kit/core` + `@dnd-kit/sortable` line is
  what ships.

## Consequences

- Reorder resolution is pure and unit-testable (28 unit tests pinned the old engine's
  behaviour as the oracle before the swap); no sensors, listeners, or DOM in the engine.
- Process view's drag port (`processDragList.ts`) reuses `sortableGeometry`'s derivation
  against `processLayout.ts` output instead of reimplementing — the view-agnostic split paid
  off within days.
- `tests/test_stock_boundary.py` quarantines `@dnd-kit` imports to exactly three modules:
  the two pure resolution modules and 0007's one mounted context.
- Anyone "upgrading" this to a fully mounted sortable tree is re-litigating this record.

## References

- Code: `src/behaviorTree/dragListReorder.ts:1` — the `WHY` header that points back here
- Code: `src/behaviorTree/sortableGeometry.ts` — the two-phase virtual-slot derivation
- Evidence: `docs/tree-drag-dndkit-migration-2026-09-06.html`
- Related: `docs/peps/0007-conditional-dual-drag-owner.md` (amends the sensor stance)
