# 0002: A Branch is a region with no ports of its own except its control band

- **Status:** Accepted
- **Date:** 2026-09-02
- **Merge:** 69f0f6a

## Context

SystemSketch needed a way to draw an `if` on the whiteboard: a conditional with
several mutually-exclusive arms, each containing real Blocks, whose values can
still be wired straight to the calls inside. The design question, worked out
in `docs/branch-regions-2026-09-02.html` (built by
`docs/build_branch_regions.py`) against prior art in LabVIEW, MLIR, the
sea-of-nodes IR and Blender's zones, was where the many-to-one merge after the
branch should live, and whether the region itself needed ports at all.

Two things had to be settled before any code: whether an `if` is a Block or a
region (agreed: a region — Blocks drop into it, cables run straight to the
calls inside, and it has no signature the way a `def` does), and what happens
where the arms rejoin. `docs/build_branch_regions.py` babbled five boards
(V1–V5) against that fixture; a container having no ports was treated as a
possible hard gate on the design (see the "Hinge" callout at
`docs/build_branch_regions.py:679`).

A second, structural problem surfaced once the region existed in the editor:
Blocks live at some geometric position inside the region, and which arm a
Block "belongs to" needs to survive the arm folding to just its header row —
at which point the Block's page position and the folded row's geometry no
longer agree.

## Decision

A Branch is implemented as its own frame-like shape (`src/branch/BranchShapeUtil.tsx`,
`src/branch/branchModel.ts`) with **no ports on its arms** — only a fixed set
of control ports on its band (`BranchControlPort`, read by
`getBranchConnectionPorts` in `src/blocks/connections/blockPorts.ts:131-144`).
Values the branch decides on land on the band; everything else wires straight
to the Blocks inside an arm. This is "wires always" (V1 from the babble):
exclusivity is carried by which arm's Blocks are wired, and read through two
views (`view: 'expanded' | 'case'` — Case view shows only the active arm's
wires), not by a merge port on the region. The contract is recorded verbatim
in the header comment of `src/branch/branchModel.ts:1-18`.

Ports are unified across Blocks and Branches through one host abstraction:
`PortHostShape = BlockShape | BranchShape` (`src/blocks/connections/blockPorts.ts:124`).
`isPortHostShape` gates every place the connection layer resolves a binding
(`src/blocks/connections/ConnectionBindingUtil.ts:93,114,240,392,447`), so a
cable welds to a Branch's control port with exactly the same binding, drag
hit-test and paint rules as a Block's own port — the Branch is a second kind
of host, never a second edge model.

Arm membership — which arm a given child shape sits in — is not read from
tldraw's own frame parent/child structure. Each arm gets an invisible tldraw
frame (`BranchArmShape`, `src/branch/BranchArmShapeUtil.tsx`) purely so the
stock frame clip/hit-test machinery can crop it, but that frame nesting is
rebuilt from `Branch.props.arms[]` as "an idempotent projection, not a second
arm model" (`src/branch/branchArmFrames.ts:51-53`). The actual authority is a
`branchArm` meta key stamped onto the child (`BRANCH_ARM_META_KEY`,
`src/branch/branchModel.ts:86`), read by `branchArmIdOfChild`
(`src/branch/branchScope.ts:48-58`): the stamp wins when it names a live arm,
falling back to geometry (which row holds the child's top edge) only when
there is no stamp — see the `WHY:` comment there. The stamp is written wherever a child's arm is
authoritatively known — tldraw's own frame-drop (`onDragShapesIn`,
`src/branch/BranchArmShapeUtil.tsx:170-187`) and the arm-reconciliation
command (`applyBranchProps`, `src/branch/branchCommands.ts:94-100`).

## Alternatives considered

- **V2, "yield on the region border"** — the option the babble's own scoring
  recommended (`docs/build_branch_regions.py:636`: "the recommendation is V2,
  with V1 as the gesture that authors it"). It would have given the region a
  real output port representing the post-branch join (a φ, in the SSA sense
  the doc uses), following MLIR's `scf.yield` and LabVIEW's output tunnels.
  It lost because Zach picked V1 directly (`docs/build_branch_regions.py:635`:
  "You read this and picked V1: wires always, no ports on the region,
  exclusivity carried by the wires and read through two views... 'a container
  has no ports' is a gate"), overriding the doc's own recommendation. The
  hinge the doc had flagged in advance — V2's only weak criterion is that the
  region gains a port — is exactly the reason given.
- **Geometry alone for arm membership** — resolving which arm a child
  belongs to purely from its page position and the current row layout, with
  no stamp. This is what shipped first and was proven wrong by the real
  browser journey in commit `4239b24`: folding an arm collapses its row to a
  header with no body, so a child geometrically re-homed into whichever open
  arm's row now overlapped its old top edge — breaking both the hide rule and
  the fold re-attach. The `branchArm` meta stamp was added to fix this; the
  fold-and-keep-stamp test lives at `src/branch/branchScope.test.ts:101-112`.

## Consequences

- A cable can always be drawn straight to a Block inside an arm, and to a
  control port on the band, using the one binding/rules path Blocks already
  had — no parallel wiring model for regions had to be built or maintained.
- Because there is no region-level merge port, a future "what does `pose`
  mean after the branch" feature (the V2 φ) is not free — it was explicitly
  deferred, not designed out. Re-litigating "should the region have a port"
  should point back here rather than reopening the babble from scratch.
- Arm membership depends on a meta stamp that must be kept in sync by every
  code path that moves a child between arms (drag-in, reconciliation, fold).
  Geometry is only a fallback for shapes that predate the stamp or were moved
  by something outside these paths; a new mutation path that forgets to write
  `BRANCH_ARM_META_KEY` will silently fall back to geometry and can
  misattribute a child once its arm folds.

## References

- Code: `src/branch/branchScope.ts:48` — `branchArmIdOfChild`, the `WHY:` comment that points back here
- Code: `src/branch/BranchArmShapeUtil.tsx:170-187` — `onDragShapesIn`, where the stamp is written on a tldraw frame drop
- Code: `src/blocks/connections/blockPorts.ts:118-128` — `PortHostShape`, the one port table for Blocks and Branches
- Code: `src/branch/branchModel.ts:1-18` — the verbatim contract this decision implements
- Tests: `src/branch/branchScope.test.ts:76-112` — stamped-vs-geometry arm membership, fold re-attach
- Tests: `tests/branch_region_smoke.mjs` — real-browser proof (drag into arms, wire to control ports, fold, Case view)
- Evidence: `docs/branch-regions-2026-09-02.html` (built by `docs/build_branch_regions.py`) — the V1–V5 babble and the pick
- Evidence: `docs/branch-region-implementation-2026-09-02.html` (built by `docs/build_branch_region_implementation.py`) — the shipped implementation report
- Related commits: `c88a332` (add the region), `4239b24` (fold-stamp fix, proven in browser), `040a08e` (report), merged via `69f0f6a`
