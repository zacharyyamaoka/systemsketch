# 0005: Detach-to-primitives is a registry of per-kind reductions under one phased sweep

- **Status:** Accepted
- **Date:** 2026-09-05
- **Merge:** landed on `main` with the hierarchical detach refactor (this commit)

## Context

Detach-to-primitives is the operation that keeps SystemSketch honest: any custom shape must
be able to become ordinary stock tldraw records that survive with no SystemSketch code
registered. By September 2026 five kinds could lower — Block, cable, Branch, Loop, Behavior
Tree region — and the operation had grown into **two hand-ordered dispatchers that each named
every kind**: a five-pass sequence in `detachBlock.ts` for the selection command, and a
parallel six-pass sequence in `portableTldraw.ts` for the `.tldr` export. They had already
diverged: the export knew how to lower a Code block, the selection command did not; the
export lowered containers without their wired-port cores, the live command kept them.

Inside the Behavior Tree region the same growth pattern produced a hybrid: cables and leaf
Blocks delegated to their own kinds' reductions (which is why Block features flowed into
regions for free), but everything else was re-enumerated by literal type checks, and
`deleteShape(region)` then destroyed the whole remaining subtree on the assumption nothing
else could be in it. That assumption was false — a hand-drawn annotation dropped into a
region was silently destroyed (fixed at `81d75973` by lifting unstamped survivors), and a
Code block inside a region survived detach as a *non-stock record inside a stock frame*,
neither lowered nor refused.

Adding a sixth kind meant editing both dispatchers by hand and teaching every composite the
full list of kinds it might contain. Zach called for the refactor: implement detach
hierarchically so each element is verifiable alone and composites get their children's
lowering for free.

The fork was real because the obvious generalisation is wrong. A naive "each shape lowers
itself, recurse depth-first" breaks rebuild fidelity on two ordering invariants the pass
sequence silently encoded:

1. **A cable must lower while both endpoint shapes still stand** — its stock arrow binds to
   live geometry, and deleting an endpoint first takes the binding down with it.
2. **A container's wrapper must reduce only after its contents lowered or escaped** —
   deleting the container removes its whole remaining subtree.

Plus a third, subtler one: a cable lowered *because its Block endpoint is lowering* carries a
rebuild promise and binds port-precisely to the Block's replacement card, while a cable
lowered on its own, or a region's projected cable, must not promise a Block rebuild at all.

## Decision

**One contract, one plan, one executor, one list.**

- `src/detach/detachableKind.ts` — the contract. Each kind declares how it reduces itself
  (`lowerEdge` / `lowerNode`), which phase it needs (`edge`, `leaf`, `container`), whether it
  claims its own incident cables (Block), whether its children are discoverable authored work
  or contributed projection (Behavior Tree), how to survey facts that die mid-sweep (wired
  port ids), and whether its replacement may keep a Block-rebuild promise.
- `src/detach/detachPlan.ts` — planning, read-only. Discovery walks the requested tree;
  composites contribute the occurrences they own (bypassing the projection-refusal gate that
  blocks direct selection of a projected child); claim resolution defers a cable to a claiming
  Block endpoint unless the owning composite forced it plain; ordering is leaf-before-
  container, contributions-before-their-owner, discovery order otherwise.
- `src/detach/detachSweep.ts` — execution: one history stopping point, five phases (survey →
  edges → leaf nodes → container nodes → finalize), replacement adoption routed back to the
  owning composite by id, and rebuild promises cleared on arrows bound to non-rebuildable
  replacements.
- `src/detach/registeredKinds.ts` — the composition root, deliberately the only enumeration
  of kinds in the codebase. The selection menu and the portable export both consume it;
  `tests/test_stock_boundary.py` pins that.

A composite's own reduction now handles exactly its painted chrome plus the generic rule
"lift whatever is still inside me before I delete myself". The Behavior Tree region
contributes its projected cables (forced plain) and its child occurrences to the sweep,
adopts their replacements into its stock frame by id, and never names a kind. A shape kind
inside any composite either has a registered reduction (it lowers) or it does not (it is
lifted and preserved) — never silently destroyed, never left half-lowered.

## Alternatives considered

- **Keep the enumerated dispatchers and add the sixth kind by hand** — the status quo. Lost
  because the two dispatchers had already diverged in observable behavior, and every new
  composite re-litigates the ordering invariants by hand; the Behavior Tree hybrid showed the
  failure mode twice (destroyed annotation, half-lowered Code block).
- **Naive recursive dispatch: each shape lowers itself and recurses into children** — the
  approach the original investigation flagged as insufficient. Lost because it violates the
  invariants above: depth-first order lowers a container before a sibling cable's far
  endpoint, and per-shape-in-isolation cable lowering cannot decide the rebuild-promise
  question, which depends on *why* the cable is lowering.
- **Side-effect self-registration (each kind registers itself on import)** — lost to an
  explicit composition list. Registration order would depend on import order, unit tests
  importing one module would see a partial registry, and nothing would fail loudly when a
  kind is forgotten. The one-line list keeps a single, testable enumeration point.
- **A total order declared as per-kind priority numbers** — lost to the two named phases plus
  structural rules (claims, ownership post-order, discovery order). Priorities beg future
  off-by-one reasoning; the phases name the invariants they exist to protect.

## Consequences

- Adding a detachable kind is now: one `DetachableKind` definition beside the shape's module,
  one import line in `registeredKinds.ts`. No dispatcher edit, no composite edit, and the
  export picks it up for free.
- Deliberate behavior changes shipped with the refactor, all in the direction of the
  documented contract ("keeps the look"): a Code block is now detachable from the live
  selection menu, and lowers inside a detached region instead of surviving as a custom
  record; a container's wired-port cores are surveyed before any cable lowers, so a port
  whose cable went down with a selected Block in the same sweep keeps its filled core
  (`tests/stock_tldr_primitives_smoke.mjs` documents the corrected count); an authored
  Block/Branch/Loop pasted inside a Behavior Tree region now lowers with the region, matching
  what Branch and Loop children always did.
- The planner is pure over a reader interface, so ordering/claiming/refusal rules are unit
  tested against synthetic kinds (`src/detach/detachPlan.test.ts`) with no editor and no
  tldraw — a future composite's ordering bug fails there, not in a browser journey.
- Cost accepted: the sweep's phase model is more abstract than five literal passes; the two
  invariants above are the reading key, and they live as WHY comments at
  `src/detach/detachableKind.ts` and `src/detach/detachSweep.ts`.

## References

- Code: `src/detach/detachSweep.ts` — the `WHY:` comment that points back here
- Code: `src/detach/detachableKind.ts` — the two invariants, stated at the contract
- Evidence: `tests/behavior_tree_detach_smoke.mjs` (28/28), `tests/behavior_tree_identity_smoke.mjs` (33/33),
  `tests/block_detach_smoke.mjs` (15/15), `tests/detach_composite_fidelity_smoke.mjs`,
  `tests/detach_hierarchy_smoke.mjs` (new; composites detached with real cables, pills,
  nested and foreign content present), `tests/detach_primitives_stress_smoke.mjs` (50 cases)
- Related: `docs/peps/0004-projected-child-ownership-by-containment.md` (the same
  projection-region family; containment rules this sweep relies on)
