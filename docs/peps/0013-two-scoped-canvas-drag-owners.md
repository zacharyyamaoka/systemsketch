# 0013: A second scoped canvas drag owner, and the property a third must prove

- **Status:** Accepted
- **Date:** 2026-09-06
- **Merge:** `5bb251e8` — merge of `track/communication-draw-hotkeys` (queue pin `e51c6b8f0b41`)

## Context

[0006](0006-tree-drag-dndkit-pure-collision.md) brought dnd-kit into the tree lane as pure
collision math. [0007](0007-conditional-dual-drag-owner.md) then admitted **one** conditional
dnd-kit owner on the canvas: with Auto layout on, a Behavior Tree node hands its gesture to a
mounted `DndContext`, and everything else stays native tldraw.
[0009](0009-dndkit-for-plain-react-panels.md) allowed dnd-kit in plain React panels, which
share no pointer with a tldraw canvas and are a different question.

`track/communication-draw-hotkeys` asks for a **second canvas owner**: in the Communication
lens a port is a socket that can sit anywhere on a card's four walls, and Zach asked for
dnd-kit to move it ("basically we model each edge of the board as a kanban column/row and each
port as a kanban card", 2026-09-06). `tests/test_stock_boundary.py` refused the merge, exactly
as 0007 intended — the rule admitted one owner, and this is a second.

So the fork was real: keep one owner and rewrite the port drag natively, or widen the rule to
two.

## Decision

**Admit a second scoped canvas drag owner** — `src/blocks/ports/CommunicationPortDnd.tsx` —
on the same terms as the first: narrowly gated, mounted once, judged by property rather than
by name. The boundary test now admits it and asserts its gate (it claims only through
`canMoveCommunicationPort`, only under the Communication lens, only from `long_press`), its
refusal of the sortable layer, and that its geometry stays in page space.

**And record the constraint any future owner must satisfy**, because the obvious answer to
"how do two owners avoid colliding?" is wrong in a way that has already fooled three readers:

> Two canvas drag owners are separated by **which select-tool state owns the press**,
> re-checked at the moment a lane would **claim** — never by timing.

Timing cannot do it. `long_press` does **not** mean "the press did not move". In
`@tldraw/editor` 5.3.2, `long_press` is a 500 ms timer started on `pointer_down`, and
`_longPressTimeout` is cleared in exactly six places — pinch, middle-mouse, right-mouse,
`pointer_up`, spacebar-pan, and the `pointer_move` branch that fires only once the press
exceeds `dragDistanceSquared` (16, i.e. **4 px**; 36 coarse). `editor.cancel()` is not among
them. So `long_press` means *"has not crossed the drag threshold"* — a strictly weaker claim,
and one that a lane preempting **below** that threshold also satisfies. A numeric argument is
no better: the tree lane's preempt distance is a live knob (`btDragTuning.claimDistancePx`)
whose own comment permits a tuned value above 4.

State ownership is also the only discriminator that survives the shapes involved: Behavior
Tree nodes are real Blocks, and `blockLayoutLensFor` returns `'communication'` for *every*
shape under the whole-board lens, so "these lanes target different things" is not true either.

A third owner must therefore show a select-tool state that is its own, checked at claim time,
with every other admitted owner standing down for it. "It uses a different gesture" is not a
proof — that is precisely the argument that failed here.

## Alternatives considered

- **Keep one owner; rewrite the port drag natively.** Loses what dnd-kit is actually good at
  (a sensor, a draggable, collision against real targets) and duplicates it by hand — the
  forking failure mode 0006 and 0007 exist to prevent. Rejected.
- **Widen on timing — assert the preempt distance is below tldraw's threshold.** This was the
  original plan. Unsound: `long_press` survives sub-threshold movement, so the conditions
  overlap rather than being disjoint, and the live claim distance may exceed the threshold by
  design. Asserting it would have written a false invariant into the gate. Rejected on
  evidence read from `@tldraw/editor` 5.3.2 rather than from the code's own comments.
- **Rely on scope — a tree node will never carry communication ports.** Not true: tree nodes
  are real Blocks and the whole-board lens covers every shape. Rejected as a guarantee.
- **One shared host for both lanes now.** The right end state, and both files say so, but a
  refactor of two working lanes does not belong in the merge that admits the second one.
  Deferred.

## Consequences

- The rule admits two canvas owners and names the property a third must satisfy, so the next
  one is a decision rather than a diff.
- **Exclusivity is not yet implemented, and this merge does not implement it.** Two owners can
  still claim one press. The defect predates this merge and is live on `main` independently of
  it — the most reachable pair is the tree lane against the *native* Dataflow reorder lane
  (`portInteraction.ts`), under the default lens. `tests/test_stock_boundary.py` carries the
  full KNOWN GAP record: three gesture owners, both orderings, and the reachability of each.
  The fix spans all three lanes and changes shipped Behavior Tree behaviour, so it is its own
  change.
- The boundary rule is shaped around **dnd-kit** owners, but the invariant is about **gesture**
  owners — and the third one is native tldraw, so the rule structurally cannot see it. A future
  tightening should widen the abstraction, not add another name to the allow-list.
- `tests/test_long_press_semantics.py` now fails the build if any comment under `src/` claims
  `long_press` implies a stationary press. Four comments asserted it before this landed.
- **Owed as follow-up:** `CommunicationPortDnd.tsx` and `behaviorTree/treeDndDrag.tsx` share a
  pattern on purpose and should end up sharing one host. Until they do, a change to one lane's
  claim protocol must be mirrored by hand into the other.

## References

- Code: `src/blocks/ports/CommunicationPortDnd.tsx` — the second owner's `WHY:` block
- Code: `src/behaviorTree/treeDndDrag.tsx` — the first owner (0007's mechanism)
- Code: `src/blocks/ports/portInteraction.ts` — `DraggingBlockPort`, the native third gesture owner
- Test: `tests/test_stock_boundary.py` — admits the second owner; carries the KNOWN GAP record
- Test: `tests/test_long_press_semantics.py` — the false premise, guarded
- Related: `docs/peps/0007-conditional-dual-drag-owner.md` (extended by this)
- Related: `docs/peps/0006-tree-drag-dndkit-pure-collision.md`, `docs/peps/0009-dndkit-for-plain-react-panels.md`
