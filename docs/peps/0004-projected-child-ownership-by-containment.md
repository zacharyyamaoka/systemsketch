# 0004: A projected child's owning region is derived from containment, not from a stored id

- **Status:** Accepted
- **Date:** 2026-09-05
- **Merge:** (recorded below in References — landed on `main` with the Behavior Tree detach and region-identity work)

## Context

SystemSketch has a growing family of **projection regions**: a region owns a canonical model,
and the shapes inside it are *projections* of that model rather than authored objects. Branch
and Loop came first; the Behavior Tree region is the third, and it projects an entire BT.CPP
XML tree as real Blocks, control cards, value pills and cables. Every gesture on a projected
child compiles back into an edit of the region's canonical model, so before the app can honour
a gesture it has to answer one question: **which region does this shape belong to?**

The Behavior Tree installer answered it the way the model was already stamped — each projected
child carries `meta.btRegion`, the id of the region that projected it, and the installer read
that id. That is the obvious representation: it is O(1), it is explicit, and it survives a
child being moved anywhere on the page.

It is also a denormalized copy of a fact the store already maintains, and tldraw's copy
semantics break it in a specific way: **duplicate and paste re-mint every shape id but copy
`meta` verbatim.** A pasted child therefore still names the region it was copied *from*. Every
rule that trusted the stamp then acted on the original region instead of the copy — it
reparented the copy into the original, recorded the paste distance as one of the *original's*
free layout offsets, and deleted the original's own children as duplicate `role:path` strays.
Zach recorded it: at the Ctrl+V, the original region's `props.offsets` went from `{}` to twelve
entries, the largest 14,495 px — 13.5× the region's own width. Tidy clears offsets, which is
why Tidy appeared to repair it and the underlying cause stayed hidden.

That is a bug, and a bug alone would not earn a record here. What forced a decision is that
the fix has two defensible shapes and the shipped code deliberately keeps **both mechanisms**,
with a precedence between them that is not self-evident from reading either one. A future
reader who notices the redundancy will be tempted to collapse it. This record says which way.

Scope note: the `ValidationError` crash fixed in the same unit of work — a present-but-
`undefined` optional prop is legal in a shape's `props` and illegal in its `meta` — is **not**
part of this decision. That was a mistake with one correct answer, and it carries `WHY:`
comments at `src/blocks/detach/detachModel.ts` and `src/blocks/definitions/definitionLinking.ts`.

## Decision

**Containment is the truth; the stamp is a repaired fallback.**

`behaviorTreeRegionFor` resolves a projected child's owner by walking up the parent chain to
the nearest region ancestor. A child's parent is the one fact that duplicate, paste, drag and
undo all get right, because tldraw maintains it rather than copying it. Only when containment
cannot answer does the resolver fall back to the stored `meta.btRegion`.

Containment cannot answer in exactly two cases, and each has a named rule rather than an
exception:

- **A cable** is parented into the scope its two endpoints share — the page, not the region —
  so it has no region ancestor. `cableRegion` resolves it through its bindings' Blocks
  instead: those are the occurrences it was projected between, and paste rebinds a copied
  cable to the copied Blocks.
- **A child dragged clean out of every region** has no containing region at all. The stored id
  answers for it, and the drag rule then pulls it back.

The stamp is not deleted. `reconcileBehaviorTree` **re-stamps** a copied child's `btRegion` so
the two mechanisms agree again, which matters because a later delete of that child compiles an
XML edit and must edit the right tree. The invariant is therefore a precedence, not a
replacement: *derived structure outranks the denormalized stamp, and the stamp is repaired to
match.*

A second, independent guard covers the same class of mistake one layer up. The installer
inferred "a person dragged this" from a shape's position changing between store states, which
is false for a shape that did not exist in the previous state — an arrival's "movement" is its
entire distance from the original, which is what wrote the 14,495 px offsets. The installer now
tracks the set of shapes **created in the current operation** and never reads a fresh arrival
as a drag. Containment alone fixes the ownership; this guard alone fixes the offsets; the
mutation evidence below shows they fail differently and are both needed.

## Alternatives considered

- **Keep the stored id as the truth and re-stamp it on copy** — the minimal fix, and genuinely
  defensible: it preserves O(1) lookup and needs no special case for cables. It lost because it
  makes correctness depend on catching *every* path that mints new shapes. Duplicate, paste,
  cross-page copy, drag-out-of-a-region, undo/redo replays and any future import path each have
  to remember to repair the stamp, and a missed one fails silently and destructively — it
  corrupts a region the person was not even editing. Deriving from the parent chain has no such
  enumeration to get complete.
- **Delete the stamp entirely and use containment only** — the tidier-looking end state, and
  rejected because containment provably cannot answer for the two cases above. A page-parented
  cable has no region ancestor by construction, and a child dragged out of every region has none
  by the person's own action. Removing the fallback would trade a copy bug for a drag bug.
- **Reparent cables into the region so containment becomes universal** — this would remove the
  `cableRegion` carve-out, but a connection is parented into the common scope of its two
  endpoints by the connection layer, which is shared with every non-Behavior-Tree cable in the
  app. Forcing a different parent for BT cables would fork that layer to serve one region type,
  against this repo's standing rule that new capability goes through the existing seam.
- **Forbid duplicating or pasting a region** — it would have made the bug unreachable, and it
  was never seriously weighed: a region is a shape on a whiteboard, and refusing Ctrl+D on it
  breaks the muscle memory the whole design rests on.
- **Detect the scramble and repair it afterwards** (the Tidy-clears-offsets behaviour, promoted
  to a rule) — rejected as treating the symptom. It would leave the wrong region edited between
  the paste and the repair, and a delete landing in that window would edit the wrong tree's XML.

## Consequences

- **The redundancy is deliberate. Do not "simplify" it away.** A future reader will find both a
  parent-chain walk and a stored `btRegion` and see one of them as dead weight. Neither is:
  the walk is the truth, the stamp answers the two questions the walk cannot, and
  `reconcileBehaviorTree` keeps them agreeing. Removing either one reintroduces a failure this
  record already paid for.
- **Ownership lookup is now O(parent depth) instead of O(1)**, on a path that runs on store
  changes. Accepted because projection depth is small and the alternative was silent
  cross-region corruption; if it ever shows up in a profile, cache it — do not re-promote the
  stamp to the truth.
- **A child's owner can now change implicitly.** Reparenting a projected child into a different
  region transfers ownership without touching its `meta`. That is the intended behaviour, but
  it means the model edit a gesture compiles depends on where the shape *is*, not on where it
  came from.
- **This binds the next projection region.** Branch, Loop and Behavior Tree are three instances
  of the same pattern and there will be more. A new region that stamps its children with an
  owner id and trusts it will reproduce this bug exactly. Resolve by containment, name the
  cases containment cannot answer, and repair the stamp rather than trusting it.
- **The general rule underneath**, worth carrying past regions: any state derived from a fact
  tldraw copies verbatim (`meta`, `props`) is invalid the instant a shape is duplicated. Prefer
  the facts tldraw *maintains* — parentage, bindings, the set of records created in this
  operation — and treat a copied value as a hint to be re-derived.
- **Guarded by a test that can fail.** `tests/behavior_tree_identity_smoke.mjs` was mutation
  tested against the shipped pre-fix behaviour: with containment resolution disabled it goes
  1/33 red, with the created-in-this-operation guard disabled 2/33, and **with both disabled —
  the exact code that shipped before this decision — 12/33 red**, including `duplicate.offsets`,
  `paste.offsets`, `move.offsets` and their `.kids` twins. That reproduces Zach's recording.

## References

- Code: `src/behaviorTree/installBehaviorTreeRegions.ts` — `behaviorTreeRegionFor` and its
  `WHY:` comment pointing back here; `cableRegion` for the bindings fallback
- Code: `src/behaviorTree/installBehaviorTreeRegions.ts` — the created-in-this-operation
  (`arrived`) guard in the reconcile installer
- Tests: `tests/behavior_tree_identity_smoke.mjs` — 33 real-browser checks over duplicate,
  paste, move, drag-out, undo and the Dataflow lens; the mutation table above is measured
  from it
- Tests: `tests/behavior_tree_detach_smoke.mjs` — 26 checks, the sibling journey for the
  detach half of the same unit of work
- Evidence: `docs/behavior-tree-detach-2026-09-05.html` — the rendered report: the recorded
  `props.offsets` bar chart, the before/after seam diagram, and the mutation table
- Evidence: `docs/assets/behavior-tree-identity/recording-store-000325.json` — the single
  store row from Zach's recording that the offsets chart is measured from
- Review: `sketches/review/behavior-tree-region-identity.systemsketch` — the guided fixture
- Related: `docs/peps/0002-branch-region-port-host.md` — the Branch region, the first
  projection region to keep a meta stamp across a structural change
