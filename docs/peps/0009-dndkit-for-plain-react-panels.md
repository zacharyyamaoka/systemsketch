# 0009: dnd-kit may own the gesture in plain React panels, where no canvas shares the pointer

- **Status:** Accepted
- **Date:** 2026-09-06
- **Merge:** landed on `main` as merge `d84e238d` (implementation commit `a4b5ba41`, branch
  `track/inspector-port-dnd-kit`)

## Context

0007 admitted a second drag system on a precisely drawn boundary: dnd-kit may claim a gesture
only on an auto-laid-out diagram node, because Auto-layout changes a region's identity from
whiteboard to reactive diagram. `tests/test_stock_boundary.py` enforced that by name — dnd-kit
could be imported by exactly three modules, and exactly one `DndContext` could exist in the
app. The rule was deliberately absolute, and its own docstring said a future rewrite must not
silently re-litigate it.

That absoluteness swept in a case 0007 never actually reasoned about. The Block Inspector is a
plain React side panel. Its port list already had drag-to-reorder — a hand-rolled pointer loop
with a grip handle — and no tldraw canvas has ever shared that pointer. Nothing about the
two-writer corruption, the camera-relative screen positions, or the claim/preempt/hand-off
machinery in 0007's reasoning applies to it. What the panel did lack was everything a drag
library gives you for free, most visibly auto-scroll: the panel scrolls, its port list runs
past the fold with as few as four inputs, and a hand-rolled loop that never scrolled meant a
port could only be dragged to a row that happened to be painted at the same moment as its own
grip. The heading row was simply unreachable on a long Block.

The fork: keep the boundary absolute and keep hand-rolling panel drag machinery, or widen it
to a second, disjoint permission for surfaces with no canvas involvement.

## Decision

Zach's call, 2026-09-06: "yes please migrate to dnd kit." **dnd-kit may own the gesture in a
plain React panel — sensor and draggable handle — in addition to 0007's scoped canvas
exception.** The two permissions are disjoint: the canvas lane is about who wins a pointer
tldraw also wants, and a panel has no such contest to arbitrate.

The permission is narrow, and it is the *gesture* only. `BlockInspector.tsx` mounts a
`DndContext` with a `PointerSensor` and puts `useDraggable` on each row's grip. Everything
about where a port may land is unchanged: `listDropTarget` reads the painted sections, and
`moveBlockPortToSectionProps` remains the oracle for whether a place offers anything at all.

**dnd-kit's sortable layer stays out, and that is the load-bearing half of this decision.**
`SortableContext`/`useSortable` sort a flat array of DOM ids. A port row's place is
`{ row, branch, before }` — a body row, a conditional arm inside it, and the heading band as
row 0 — so `arrayMove` cannot express a legal move. Worse, painted order is not lane order:
the managed face paints hidden ports that the ordinary face filters out, so a DOM index
disagrees with the model by construction. Keeping the reducer as the oracle is what makes the
preview incapable of disagreeing with the commit.

`tests/test_stock_boundary.py` now enforces the widened scope as *properties* rather than a
longer allow-list. A panel surface must use `useDraggable` and `PointerSensor`; must not
mention `@dnd-kit/sortable`, `useSortable`, `SortableContext`, or `arrayMove`; must still call
`moveBlockPortToSectionProps` and `listDropTarget`; and must not carry the canvas lane's
claim machinery (`markEventAsHandled`, `getHitShapeOnCanvasPointerDown`). The checks run over
comment-stripped source, so a module's own explanation of what it refuses cannot be read as
the offence — nor can a promise in a comment satisfy a required symbol.

## Alternatives considered

- **Keep the boundary absolute; add auto-scroll to the hand-rolled loop.** This shipped first
  and worked (a ramped `dragScrollStep`, unit-tested, journey-proved). It was the conservative
  call and it is what the reasoner recommended. It lost because Zach decided the panel should
  use the library rather than grow a parallel copy of it — a hand-rolled scroller beside a
  mounted dnd-kit is the second-system smell the stock-boundary rule exists to prevent, just
  one level down. It is preserved in full as commit `9e626fa3` in this history, so the
  comparison is a `git show` away rather than a reconstruction.
- **Adopt `SortableContext` for the port list, the way dnd-kit's own examples do.** Rejected
  on the model, not on taste: it cannot address an arm, and it resolves against painted order,
  which the managed face makes wrong. Adopting it would have reintroduced exactly the class of
  bug the reducer-oracle design was built to prevent. `tests/inspector_port_2d_model_smoke.mjs`
  exists to make that regression loud — bypassing the oracle turns it red in one check.
- **Widen the boundary test by adding a filename to the skip-list.** Rejected as the shape of
  the change, not the change itself: a name on a list records that an exception was made and
  nothing about what makes it legitimate. The property checks fail on a future refactor that
  keeps the filename and loses the guarantee.

## Consequences

- Panel drag surfaces get dnd-kit's sensor lifecycle, cancel handling, and auto-scroll instead
  of hand-rolled equivalents. The Inspector's port list can now reach a row that was off
  screen when the drag began — the concrete capability that motivated this.
- The boundary is no longer "one DndContext in the app," so the honest invariant to reason
  about is now *disjointness*: canvas gestures are arbitrated by 0007's claim rules, panel
  gestures have nothing to arbitrate against. A surface that is neither — a React panel drawn
  over the canvas that tldraw also hit-tests — belongs to 0007's lane, not this one, and the
  property checks deliberately refuse it (no `markEventAsHandled` allowed here).
- The reducer-as-oracle property is now enforced by a test rather than by a convention, in
  both directions: a drop that offers a bar must change the lane, and a drop that offers
  nothing must leave it alone.
- `PANEL_DND` is a set of one. It should stay small; each addition is a decision to re-check
  that no canvas shares that surface's pointer, not a formality.

## References

- Code: `src/blocks/ui/BlockInspector.tsx` — the `WHY:` comment on the `DndContext` in
  `PortSection` points back here
- Enforcement: `tests/test_stock_boundary.py` — `PANEL_DND` and the panel property checks
- Evidence: `tests/inspector_port_2d_model_smoke.mjs` (cross-arm and hidden-port drops, the
  oracle checked in both directions), `tests/inspector_port_autoscroll_smoke.mjs` (a drop into
  a row that started off screen)
- Related: `docs/peps/0007-conditional-dual-drag-owner.md` (extends — 0007's canvas exception
  is unchanged and still stands), `docs/peps/0006-tree-drag-dndkit-pure-collision.md`
